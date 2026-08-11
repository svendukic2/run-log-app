import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { toDbDate, toIsoDate } from '../common/dates';
import { NotificationsService } from '../notifications/notifications.service';
import { isPrismaError, prismaConstraint } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { Run as RunRow } from '../generated/prisma/client';
import {
  CreateRunDto,
  DEFAULT_EFFORT,
  EFFORT_LEVELS,
  type Effort,
} from './dto/create-run.dto';
import { UpdateRunDto } from './dto/update-run.dto';

// The API shape of a run: exactly the Run type from docs/data-model.md and
// frontend/src/lib/runs.ts. `date` is a yyyy-mm-dd string, never a Date or
// timestamp, and nothing derived (pace, totals) is ever part of it. userId
// is deliberately NOT in the response: the owner is implicit in the token,
// and the frontend contract predates accounts.
export interface RunResponse {
  id: string;
  routeName: string;
  distanceKm: number;
  durationSeconds: number;
  date: string;
  effort: Effort;
  note: string;
}

// The two FK constraints a run-create transaction can violate (P2003) since
// the RUN-65 fan-out joined it: the run's own owner FK and the notification
// rows' recipient FK. Postgres names the violated constraint in the error
// meta, which is what tells a transaction writing two FK-carrying tables
// WHICH one broke - the same technique follow.service uses.
const RUN_OWNER_FKEY = 'Run_userId_fkey';
const NOTIFICATION_RECIPIENT_FKEY = 'Notification_userId_fkey';

// The column is plain TEXT until RUN-73 adds a real enum, so a row edited
// outside the API (psql, a seed script) can hold anything. A loud 500 that
// names the row beats a silently wrong Effort type reaching the frontend's
// exhaustive switches.
function toEffort(rowId: string, value: string): Effort {
  if (!(EFFORT_LEVELS as readonly string[]).includes(value)) {
    throw new InternalServerErrorException(
      `Run ${rowId} has stored effort "${value}", not one of: ${EFFORT_LEVELS.join(', ')}. Fix the row (RUN-73 adds the enum that prevents this).`,
    );
  }
  return value as Effort;
}

// Every method takes the owning userId first (RUN-57) and folds it into the
// WHERE clause itself - ownership is enforced by the query, never by
// filtering rows in JS (AC2). A miss on someone else's row is exactly a
// miss on a nonexistent row: 404 either way, so an id never confirms it
// exists for another account (AC3). Prisma 7's WhereUniqueInput accepts
// non-unique fields alongside the unique id, so update() can carry
// {id, userId} atomically; delete uses deleteMany for the same shape.
@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private toResponse(row: RunRow): RunResponse {
    return {
      id: row.id,
      routeName: row.routeName,
      distanceKm: row.distanceKm,
      durationSeconds: row.durationSeconds,
      date: toIsoDate(row.date),
      effort: toEffort(row.id, row.effort),
      note: row.note,
    };
  }

  // Newest first, the order every screen shows runs in. Same-day runs have
  // no insertion timestamp in the contract (docs/data-model.md), so the id
  // is the tiebreak: arbitrary but deterministic across requests. Unbounded
  // on purpose for now: the frontend consumes the whole list; pagination
  // belongs to the schema-hardening follow-up.
  async findAll(userId: string): Promise<RunResponse[]> {
    const rows = await this.prisma.run.findMany({
      where: { userId },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async findOne(userId: string, id: string): Promise<RunResponse> {
    // findFirst, not findUnique: the where must carry the owner too.
    const row = await this.prisma.run.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException(`Run ${id} not found`);
    return this.toResponse(row);
  }

  create(userId: string, dto: CreateRunDto): Promise<RunResponse> {
    return this.createRun(userId, dto, /* retryOnFanOutRace */ true);
  }

  // One attempt of the create transaction, plus the error mapping that needs
  // to know whether a retry is still available. The fan-out reads follower
  // ids without locks, so a follower deleting their account mid-transaction
  // can break the notification FK; the same cascade that deleted them also
  // removed their Follow edge, so one retry re-reads a clean list. A second
  // consecutive failure escapes as the 500 it is.
  private async createRun(
    userId: string,
    dto: CreateRunDto,
    retryOnFanOutRace: boolean,
  ): Promise<RunResponse> {
    try {
      // Run and fan-out commit together (RUN-65 AC2): every follower gets
      // exactly one 'followed-ran' per run that actually exists, and a
      // failed request the user retries cannot double-notify because the
      // first attempt's run never committed either.
      const row = await this.prisma.$transaction(
        async (tx) => {
          const created = await tx.run.create({
            data: {
              userId,
              routeName: dto.routeName,
              distanceKm: dto.distanceKm,
              durationSeconds: dto.durationSeconds,
              date: toDbDate(dto.date),
              // The Add run modal preselects Medium (ADD-8) and treats the note
              // as optional-empty (data-model: optional text is ''), so the API
              // does the same for payloads that omit them. Omit means absent:
              // explicit nulls were already rejected by the DTO.
              effort: dto.effort ?? DEFAULT_EFFORT,
              note: dto.note ?? '',
            },
          });
          await this.notifications.fanOutRunLogged(tx, userId, {
            id: created.id,
            routeName: created.routeName,
            distanceKm: created.distanceKm,
            durationSeconds: created.durationSeconds,
            date: toIsoDate(created.date),
          });
          return created;
        },
        {
          // The fan-out makes this window proportional to follower count
          // (one createMany per FAN_OUT_CHUNK); Prisma's 5s default was
          // sized for single-row writes. 15s buys enough headroom for any
          // follower count this app will see; if real fan-outs ever
          // approach it, the upgrade is an outbox processed outside the
          // request, not a bigger number here.
          timeout: 15_000,
        },
      );
      return this.toResponse(row);
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        const constraint = prismaConstraint(error);
        // The run's own owner FK: the token verified (signed, unexpired)
        // but its account was deleted mid-session. The caller's fix is
        // signing in again, so answer like any other dead session.
        if (constraint === RUN_OWNER_FKEY) {
          throw new UnauthorizedException('Invalid or expired token');
        }
        // A follower vanished between the fan-out's read and its insert:
        // the runner's session is fine, so a 401 here would wrongly log
        // out a valid user. Retry once against the now-clean edge list.
        if (constraint === NOTIFICATION_RECIPIENT_FKEY && retryOnFanOutRace) {
          return this.createRun(userId, dto, false);
        }
        // No constraint name in the meta (other drivers put nothing or an
        // array there): decide like follow.service does, caller-existence
        // first - re-authenticating comes before retrying.
        if (constraint === undefined) {
          const caller = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
          });
          if (!caller) {
            throw new UnauthorizedException('Invalid or expired token');
          }
          if (retryOnFanOutRace) return this.createRun(userId, dto, false);
        }
      }
      throw error;
    }
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateRunDto,
  ): Promise<RunResponse> {
    const data = {
      ...(dto.routeName !== undefined && { routeName: dto.routeName }),
      ...(dto.distanceKm !== undefined && { distanceKm: dto.distanceKm }),
      ...(dto.durationSeconds !== undefined && {
        durationSeconds: dto.durationSeconds,
      }),
      ...(dto.date !== undefined && { date: toDbDate(dto.date) }),
      ...(dto.effort !== undefined && { effort: dto.effort }),
      ...(dto.note !== undefined && { note: dto.note }),
    };

    // An empty PATCH is a deliberate no-op: return the row as-is (404 if
    // the id is unknown or owned by someone else) rather than rejecting a
    // request that asks for nothing.
    if (Object.keys(data).length === 0) return this.findOne(userId, id);

    // One atomic query: WhereUniqueInput carries the owner alongside the
    // id, so "no such row" and "not your row" are both a P2025 mapped to
    // the same 404 (AC3), and the returned row is exactly the one this
    // write produced - no second read that a concurrent writer could race.
    try {
      const row = await this.prisma.run.update({
        where: { id, userId },
        data,
      });
      return this.toResponse(row);
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException(`Run ${id} not found`);
      }
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.run.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException(`Run ${id} not found`);
  }
}

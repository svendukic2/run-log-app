import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { toDbDate, toIsoDate } from '../common/dates';
import { runLimitViolation, type RunMeasurements } from '../common/runLimits';
import { NotificationsService } from '../notifications/notifications.service';
import { isPrismaError, prismaConstraint } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { Run as RunRow } from '../generated/prisma/client';
import { ROUTE_SOURCE_OPENROUTESERVICE } from '../routes/route-sources';
import {
  CreateRunDto,
  DEFAULT_EFFORT,
  type RunRouteDto,
} from './dto/create-run.dto';
import {
  runsNewestFirstOrder,
  toRunResponse,
  type RunResponse,
} from './run-response';
import { UpdateRunDto } from './dto/update-run.dto';

// The response shape and its mapper live in run-response.ts since RUN-63,
// shared with the public profile read - which is also why RUN-54's route
// mapping went there rather than here: two hand-written mappers is how the
// owner's runs and a public profile's runs would start disagreeing about what
// a run looks like, and the route is exactly the field where disagreeing
// means leaking. Re-exported so every existing importer keeps its path.
export type { RunResponse };

// The two FK constraints a run-create transaction can violate (P2003) since
// the RUN-65 fan-out joined it: the run's own owner FK and the notification
// rows' recipient FK. Postgres names the violated constraint in the error
// meta, which is what tells a transaction writing two FK-carrying tables
// WHICH one broke - the same technique follow.service uses.
const RUN_OWNER_FKEY = 'Run_userId_fkey';
const NOTIFICATION_RECIPIENT_FKEY = 'Notification_userId_fkey';
// The third one, since RUN-76: the event a run is being tagged to. It is the FK
// that catches an event deleted between assertTaggable and the write, and it is
// mapped rather than left to escape as a 500 (review finding) - from the
// caller's side that is the same situation as an id that was never valid, and
// they get the same message.
const RUN_EVENT_FKEY = 'Run_eventId_fkey';
const UNTAGGABLE_EVENT_MESSAGE = 'eventId must be an event you have joined';

// The three columns for a write. Its read-side counterpart (toRoute) lives in
// run-response.ts with the rest of the mapping; this one stays here because
// only the owner's own endpoints ever write a route. Prisma needs DbNull (not
// null) to put SQL NULL into a nullable Json column, which is the only reason
// clearing a route is not simply three nulls.
function routeColumns(route: RunRouteDto | null): {
  routePolyline: string | null;
  routeWaypoints: Prisma.InputJsonValue | typeof Prisma.DbNull;
  routeSource: string | null;
} {
  if (!route) {
    return {
      routePolyline: null,
      routeWaypoints: Prisma.DbNull,
      routeSource: null,
    };
  }
  return {
    routePolyline: route.polyline,
    // Narrowed to the two fields the contract has: the DTO's whitelist pipe
    // already stripped unknown keys, and rebuilding keeps it that way if
    // CoordinateDto ever grows one.
    routeWaypoints: route.waypoints.map((point) => ({
      lat: point.lat,
      lng: point.lng,
    })),
    // Server-assigned, never client-supplied: the polyline can only have
    // come from POST /api/routes/plan, so this is a fact the server already
    // knows and the client has no business asserting.
    routeSource: ROUTE_SOURCE_OPENROUTESERVICE,
  };
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

  // Every response from this service is the OWNER's own run, so the route
  // always comes with it, whole and untrimmed: privacy gates who may see
  // someone ELSE's routes (users.service, routeVisibility), never your own.
  private toResponse(row: RunRow): RunResponse {
    return toRunResponse(row, { routeVisibility: 'full' });
  }

  // Newest first, the order every screen shows runs in (the ordering and
  // its reasoning live in run-response.ts, shared with the public profile
  // read). Unbounded on purpose for now: the frontend consumes the whole
  // list; pagination belongs to the schema-hardening follow-up.
  async findAll(userId: string): Promise<RunResponse[]> {
    const rows = await this.prisma.run.findMany({
      where: { userId },
      orderBy: [...runsNewestFirstOrder],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async findOne(userId: string, id: string): Promise<RunResponse> {
    // findFirst, not findUnique: the where must carry the owner too.
    const row = await this.prisma.run.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException(`Run ${id} not found`);
    return this.toResponse(row);
  }

  // The sanity limits (RUN-72) are enforced here rather than in the DTOs,
  // and for one reason: the pace rule reads distance and duration TOGETHER,
  // so on a PATCH carrying only one of them the other has to come off the
  // stored row. A DTO cannot see that row. Putting all four limits in the
  // one place that can is what makes create and update agree by
  // construction instead of by two copies staying in step.
  private assertWithinLimits(run: RunMeasurements): void {
    const violation = runLimitViolation(run);
    if (violation) throw new BadRequestException(violation);
  }

  // The two rules that make an event tag legal (RUN-76 AC3), both enforced
  // HERE and not in the DTO, because neither is knowable from the payload: the
  // event has to exist and be one the caller joined, and the run's date has to
  // fall inside the event's window. The form applies the same rules by only
  // offering legal options, but the form is not the enforcement - a client can
  // post anything.
  //
  // One query answers both halves of the first rule, and it answers them with
  // ONE message on purpose: "no such event" and "an event you have not joined"
  // are deliberately indistinguishable, so a run POST cannot be used to probe
  // which event ids exist. Same reasoning as the 404 on someone else's run.
  //
  // Not inside the write's transaction, and honestly: a caller who leaves the
  // event between this check and the insert ends up with a run tagged to an
  // event they are no longer in, so their kilometres keep counting on a board
  // they left. That is one owner racing themselves across two tabs, the same
  // tradeoff assertWithinLimits already takes below, and the reason it is
  // acceptable is that the run feed and the leaderboard both read through the
  // participant list - the row is stale, not authoritative.
  private async assertTaggable(
    userId: string,
    eventId: string,
    dateIso: string,
  ): Promise<void> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, participants: { some: { userId } } },
      select: { name: true, startDate: true, endDate: true },
    });
    if (!event) {
      throw new BadRequestException(UNTAGGABLE_EVENT_MESSAGE);
    }
    // Inclusive on both ends, the same closed interval the event's own state
    // derivation uses: a run logged on the first or the last day counts.
    const startDate = toIsoDate(event.startDate);
    const endDate = toIsoDate(event.endDate);
    if (dateIso < startDate || dateIso > endDate) {
      throw new BadRequestException(
        `date must fall inside ${event.name} (${startDate} to ${endDate}) to tag this run to it`,
      );
    }
  }

  // async, not a bare Promise-returning method: the limit check below
  // throws before any await, and a synchronous throw out of a method every
  // caller treats as a promise is a trap - `create(...).catch(...)` would
  // never see it.
  async create(userId: string, dto: CreateRunDto): Promise<RunResponse> {
    // Both fields are required on create, so the pair is complete here and
    // nothing needs reading first.
    this.assertWithinLimits(dto);
    // Omitted and null are both "no event" (AC7), and neither costs a query.
    if (dto.eventId) {
      await this.assertTaggable(userId, dto.eventId, dto.date);
    }
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
              // Omitted route === null route === no route (AC3): the columns
              // stay NULL and this run is indistinguishable from every run
              // saved before RUN-54.
              ...routeColumns(dto.route ?? null),
              // Validated above; the FK is the second line of defence against
              // an event deleted between that check and this insert (P2003).
              eventId: dto.eventId ?? null,
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
        // The event was deleted between the tag check and this insert. Nothing
        // was stored (the transaction rolled back), and the honest answer is the
        // one an unknown event id gets: the tag is not usable.
        if (constraint === RUN_EVENT_FKEY) {
          throw new BadRequestException(UNTAGGABLE_EVENT_MESSAGE);
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
      // PATCH semantics for the route, all three cases: absent leaves the
      // stored one alone (so an edit that never opened the map cannot lose
      // it), null clears all three columns, and an object replaces them.
      ...(dto.route !== undefined && routeColumns(dto.route)),
      // The same three cases for the event tag (RUN-76): absent keeps it, null
      // untags (AC6), an id retags.
      ...(dto.eventId !== undefined && { eventId: dto.eventId }),
    };

    // An empty PATCH is a deliberate no-op: return the row as-is (404 if
    // the id is unknown or owned by someone else) rather than rejecting a
    // request that asks for nothing.
    if (Object.keys(data).length === 0) return this.findOne(userId, id);

    // Two rules hold on the MERGED row rather than on the patch alone, so both
    // read the stored one first - once, in a single select, because two
    // pre-reads for one PATCH would be two round trips for the same row:
    //
    //   the limits (RUN-72): a PATCH moving only the duration must not slide
    //   the pace past the limit against the stored distance;
    //   the event tag (RUN-76 AC3): a PATCH moving only the date must not slide
    //   a tagged run out of its event's window, and one moving only the tag has
    //   to be checked against the stored date.
    //
    // Note that this read and the write below are NOT one statement, so two
    // concurrent PATCHes of the same run - one moving the distance, one the
    // duration - can each validate against a pre-merge value and commit a
    // pair outside the limits. That is one owner racing themselves across
    // two tabs, and these are honest-mistake guards rather than an
    // invariant the database enforces, so the read stays cheap and separate
    // instead of taking a row lock.
    const touchesLimits =
      dto.distanceKm !== undefined || dto.durationSeconds !== undefined;
    const touchesTag = dto.eventId !== undefined || dto.date !== undefined;
    if (touchesLimits || touchesTag) {
      const existing = await this.prisma.run.findFirst({
        where: { id, userId },
        select: {
          distanceKm: true,
          durationSeconds: true,
          date: true,
          eventId: true,
        },
      });
      if (!existing) throw new NotFoundException(`Run ${id} not found`);
      if (touchesLimits) {
        this.assertWithinLimits({
          distanceKm: dto.distanceKm ?? existing.distanceKm,
          durationSeconds: dto.durationSeconds ?? existing.durationSeconds,
        });
      }
      // A run being untagged needs no check - there is no event left to be
      // outside of - and neither does one whose tag and date both stay put.
      const mergedEventId =
        dto.eventId !== undefined ? dto.eventId : existing.eventId;
      if (touchesTag && mergedEventId !== null) {
        await this.assertTaggable(
          userId,
          mergedEventId,
          dto.date ?? toIsoDate(existing.date),
        );
      }
    }

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
      // Same race as on create, on the only other write that sets the tag.
      if (
        isPrismaError(error, 'P2003') &&
        prismaConstraint(error) === RUN_EVENT_FKEY
      ) {
        throw new BadRequestException(UNTAGGABLE_EVENT_MESSAGE);
      }
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.run.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException(`Run ${id} not found`);
  }
}

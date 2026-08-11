import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { isPrismaError } from '../prisma/prisma-errors';
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
// timestamp, and nothing derived (pace, totals) is ever part of it.
export interface RunResponse {
  id: string;
  routeName: string;
  distanceKm: number;
  durationSeconds: number;
  date: string;
  effort: Effort;
  note: string;
}

// The DATE column round-trips through JS as a Date pinned to UTC midnight,
// so slicing the ISO string is exact in both directions. Never build these
// with `new Date(isoString)` maths in local time: west of Greenwich that
// lands on the previous day.
function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function toIsoDate(dbDate: Date): string {
  return dbDate.toISOString().slice(0, 10);
}

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

// P2025 = "record not found" on a mutation: the row vanished between the
// request and the query (or never existed). The duck-typing rationale lives
// with the shared predicate in ../prisma/prisma-errors.ts.
function isRecordNotFound(error: unknown): boolean {
  return isPrismaError(error, 'P2025');
}

@Injectable()
export class RunsService {
  constructor(private readonly prisma: PrismaService) {}

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
  // on purpose for now: one implicit user, and the frontend consumes the
  // whole list; pagination belongs to the schema-hardening follow-up.
  async findAll(): Promise<RunResponse[]> {
    const rows = await this.prisma.run.findMany({
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async findOne(id: string): Promise<RunResponse> {
    const row = await this.prisma.run.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Run ${id} not found`);
    return this.toResponse(row);
  }

  async create(dto: CreateRunDto): Promise<RunResponse> {
    const row = await this.prisma.run.create({
      data: {
        routeName: dto.routeName,
        distanceKm: dto.distanceKm,
        durationSeconds: dto.durationSeconds,
        date: toDbDate(dto.date),
        // The Add run modal preselects Medium (ADD-8) and treats the note as
        // optional-empty (data-model: optional text is ''), so the API does
        // the same for payloads that omit them. Omit means absent: explicit
        // nulls were already rejected by the DTO.
        effort: dto.effort ?? DEFAULT_EFFORT,
        note: dto.note ?? '',
      },
    });
    return this.toResponse(row);
  }

  async update(id: string, dto: UpdateRunDto): Promise<RunResponse> {
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
    // the id is unknown) rather than rejecting a request that asks for
    // nothing.
    if (Object.keys(data).length === 0) return this.findOne(id);

    try {
      const row = await this.prisma.run.update({ where: { id }, data });
      return this.toResponse(row);
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new NotFoundException(`Run ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.run.delete({ where: { id } });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new NotFoundException(`Run ${id} not found`);
      }
      throw error;
    }
  }
}

import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { toDbDate, toIsoDate } from '../common/dates';
import { isPrismaError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  currentWeekCandidates,
  WeekTargetsService,
} from '../week-targets/week-targets.service';
import type { Goal as GoalRow } from '../generated/prisma/client';
import { PutGoalDto } from './dto/put-goal.dto';

// The API shape of the onboarding goal: exactly the Goal type from
// docs/data-model.md and frontend/src/lib/goal.ts. Dates are yyyy-mm-dd
// strings, endDate null renders as "No end date". One row per user, owner
// implicit in the token.
export interface GoalResponse {
  km: number;
  startDate: string;
  endDate: string | null;
}

@Injectable()
export class GoalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weekTargets: WeekTargetsService,
  ) {}

  private toResponse(row: GoalRow): GoalResponse {
    return {
      km: row.km,
      startDate: toIsoDate(row.startDate),
      endDate: row.endDate ? toIsoDate(row.endDate) : null,
    };
  }

  // 404 before the first PUT: a fresh account simply has no goal yet.
  async get(userId: string): Promise<GoalResponse> {
    const row = await this.prisma.goal.findUnique({ where: { userId } });
    if (!row) throw new NotFoundException('Goal not found');
    return this.toResponse(row);
  }

  // Create-or-replace in one atomic upsert on the unique userId. Replacing
  // the goal never touches WeekTarget rows: weeks already materialized keep
  // their snapshot (docs/data-model.md, "existing rows never change
  // retroactively"); the new km only seeds weeks first used after this.
  //
  // SET-6 applies here too, not just to the profile default: while the
  // account has no profile row, goal.km IS the active week-target seed
  // (see WeekTargetsService.snapshotKm), so changing it must freeze the
  // running week under the old value first - the same rule, the same
  // freeze, the same bounded window exception documented in
  // ProfileService.put. With a profile present the goal is not the seed
  // and no freeze is needed; on the first PUT nothing is changing yet
  // (onboarding), so nothing freezes at the 20 km fallback.
  async put(userId: string, dto: PutGoalDto): Promise<GoalResponse> {
    const [existing, profile] = await Promise.all([
      this.prisma.goal.findUnique({ where: { userId }, select: { km: true } }),
      this.prisma.profile.findUnique({
        where: { userId },
        select: { id: true },
      }),
    ]);
    if (!profile && existing && existing.km !== dto.km) {
      await Promise.all(
        currentWeekCandidates().map((weekStart) =>
          this.weekTargets.ensure(userId, weekStart),
        ),
      );
    }

    const data = {
      km: dto.km,
      startDate: toDbDate(dto.startDate),
      // Omitted and explicit null both mean "No end date" (GOAL-3): the
      // full-replace PUT has no "keep the old value" case.
      endDate: dto.endDate ? toDbDate(dto.endDate) : null,
    };
    try {
      const row = await this.prisma.goal.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      return this.toResponse(row);
    } catch (error) {
      // P2003 = the token's account was deleted mid-session; answer like
      // any other dead session instead of a 500.
      if (isPrismaError(error, 'P2003')) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      throw error;
    }
  }
}

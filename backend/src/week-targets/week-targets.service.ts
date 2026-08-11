import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { mondayOf, toDbDate, toIsoDate, utcDayOf } from '../common/dates';
import { GOAL_FALLBACK_KM } from '../common/weekly-goal';
import { isPrismaError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { WeekTarget as WeekTargetRow } from '../generated/prisma/client';

// The API shape of a week target: exactly the WeekTarget type from
// docs/data-model.md, `{ weekStart, targetKm }`. The row id stays internal -
// the week is the identity the frontend keys on.
export interface WeekTargetResponse {
  weekStart: string;
  targetKm: number;
}

// The extremes of real-world UTC offsets: Baker Island is UTC-12,
// Kiritimati UTC+14. Every client's local "now" lies inside this span
// around the server's UTC now.
const MAX_WEST_OFFSET_MS = 12 * 60 * 60 * 1000;
const MAX_EAST_OFFSET_MS = 14 * 60 * 60 * 1000;

// The Mondays a client may honestly call "the current week". The server
// cannot know the client's timezone, so it computes the local calendar day
// at both offset extremes and takes the Monday of each: identical most of
// the week, two distinct Mondays only while the week boundary is actually
// crossing the globe (Sunday 10:00 UTC, when UTC+14 enters the new week,
// until Monday 12:00 UTC, when UTC-12 leaves the old one). Hour-precision
// on purpose: a day-granularity window would leave the previous week
// writable for 48 hours every week instead of these 26.
//
// CONTRACT: returned ASCENDING - westmostDay <= eastmostDay, and Set keeps
// insertion order, so the last element is always the latest Monday. The
// past-vs-future 404 wording in ensure() leans on this; reorder it and
// those messages silently swap. Exported for the spec.
export function currentWeekCandidates(): string[] {
  const now = Date.now();
  // The UTC day of a shifted instant is the calendar day a clock at that
  // offset shows.
  const westmostDay = utcDayOf(new Date(now - MAX_WEST_OFFSET_MS));
  const eastmostDay = utcDayOf(new Date(now + MAX_EAST_OFFSET_MS));
  return [...new Set([mondayOf(westmostDay), mondayOf(eastmostDay)])];
}

// The WeekTarget snapshot rule (docs/data-model.md), enforced server-side:
// the first use of a week creates its row from the goal state of that
// moment, and after that the row is the truth for that week - re-reading
// never recomputes it and changing the goal or the Settings default never
// rewrites it. That immutability is what makes Hit/Missed history possible
// (AIC-7).
@Injectable()
export class WeekTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(row: WeekTargetRow): WeekTargetResponse {
    return { weekStart: toIsoDate(row.weekStart), targetKm: row.targetKm };
  }

  // What a brand-new week snapshots. The data model's shorthand is "the
  // goal's current km", but the precise order mirrors the frontend's
  // resolveGoalTarget: the Settings default wins when a profile exists
  // (SET-6 "applied to each new week"; RUN-50 initializes it from the
  // onboarding goal, so it is always the fresher of the two), else the
  // onboarding goal, else the 20 km fallback. Reading prisma.profile from
  // the goal module is deliberate: the seed rule spans both entities and
  // PrismaService is the app's single database entry point.
  private async snapshotKm(userId: string): Promise<number> {
    const [profile, goal] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { userId },
        select: { defaultWeeklyGoalKm: true },
      }),
      this.prisma.goal.findUnique({
        where: { userId },
        select: { km: true },
      }),
    ]);
    return profile?.defaultWeeklyGoalKm ?? goal?.km ?? GOAL_FALLBACK_KM;
  }

  // Every week this account ever materialized, newest first: the coach's
  // Previous plans list derives Hit/Missed from these. Unbounded like the
  // runs list: one row per used week is small by construction.
  async findAll(userId: string): Promise<WeekTargetResponse[]> {
    const rows = await this.prisma.weekTarget.findMany({
      where: { userId },
      orderBy: { weekStart: 'desc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  // Get-or-create, but creation is allowed ONLY for the current week:
  // reading the week you are in is what materializes it (the "first time a
  // week is displayed or evaluated" from the data model - a week can only
  // be displayed while someone is in it). A past week that was never
  // materialized while it was live gets an honest 404, never a row: seeding
  // it from TODAY'S goal state would fabricate a target the runner never
  // had and freeze the lie into Hit/Missed history forever. A future week
  // gets the same 404: it snapshots when it arrives, under whatever default
  // is in force then (SET-6).
  //
  // The read-then-create split (rather than one upsert) keeps the hot path -
  // an already-materialized week - to a single query with no snapshotKm
  // reads. A concurrent request winning the create race is fine: its
  // snapshot came from the same goal state, and the P2002 loser re-reads
  // the winner's row.
  async ensure(userId: string, weekStart: string): Promise<WeekTargetResponse> {
    const where = {
      userId_weekStart: { userId, weekStart: toDbDate(weekStart) },
    };
    const existing = await this.prisma.weekTarget.findUnique({ where });
    if (existing) return this.toResponse(existing);

    const candidates = currentWeekCandidates();
    if (!candidates.includes(weekStart)) {
      // Both are 404, but a past week and a future week are missing for
      // different reasons and the message should not tell the same story
      // for both. ISO day strings compare chronologically as strings.
      throw new NotFoundException(
        weekStart > candidates[candidates.length - 1]
          ? `No target exists for the week of ${weekStart} yet: a week snapshots when it arrives`
          : `No target was recorded for the week of ${weekStart}: weeks snapshot on first use while current, and this one never was`,
      );
    }

    const targetKm = await this.snapshotKm(userId);
    try {
      const row = await this.prisma.weekTarget.create({
        data: { userId, weekStart: toDbDate(weekStart), targetKm },
      });
      return this.toResponse(row);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        const row = await this.prisma.weekTarget.findUnique({ where });
        if (row) return this.toResponse(row);
        // A unique violation with no row to show for it is not a state
        // this method can explain; do not fall through to unrelated checks.
        throw error;
      }
      if (isPrismaError(error, 'P2003')) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      throw error;
    }
  }

  // "Apply to weekly goal" (AIC-5, A15): overwrite the CURRENT week's
  // target with the number the runner accepted. Past weeks are immutable
  // history (rewriting one would rewrite its Hit/Missed chip) and future
  // weeks have not snapshotted yet (they will pick up whatever default is
  // in force when they arrive), so anything outside the current-week window
  // is refused. Upsert, because applying before the week was ever displayed
  // must work too.
  async apply(
    userId: string,
    weekStart: string,
    targetKm: number,
  ): Promise<WeekTargetResponse> {
    const candidates = currentWeekCandidates();
    if (!candidates.includes(weekStart)) {
      throw new BadRequestException(
        `weekStart must be the current week (${candidates.join(' or ')}): past weeks are immutable history and future weeks snapshot when they arrive`,
      );
    }
    try {
      const row = await this.prisma.weekTarget.upsert({
        where: { userId_weekStart: { userId, weekStart: toDbDate(weekStart) } },
        create: { userId, weekStart: toDbDate(weekStart), targetKm },
        update: { targetKm },
      });
      return this.toResponse(row);
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      throw error;
    }
  }
}

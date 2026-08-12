import { IsIn, IsInt, Max, Min } from 'class-validator';
import { GOAL_MAX_KM, GOAL_MIN_KM } from '../../common/weekly-goal';
import type { $Enums } from '../../generated/prisma/client';

// Mirrors the RunningLevel union in docs/data-model.md: capitalized in the
// API and the database, whatever casing the v1 localStorage store used.
//
// Tied to the database enum in both directions since RUN-78, for the reason
// spelled out over EFFORT_LEVELS in the runs DTO: the read-side guard that
// used to catch a drift between the two is gone, so the type system has to.
export const RUNNING_LEVELS = [
  'Beginner',
  'Intermediate',
  'Advanced',
] as const satisfies readonly $Enums.RunningLevel[];
export type RunningLevel = (typeof RUNNING_LEVELS)[number];

// Compile error if the database enum ever gains a value this array lacks.
// Exported for the same reason its twin in the runs DTO is: it states the
// invariant rather than parking a scratch alias.
export type RunningLevelCoversTheDatabaseEnum =
  Exclude<$Enums.RunningLevel, RunningLevel> extends never ? true : never;

// PUT /api/profile is a full replace: every field is required, so the row
// can never drift into a half-written state and re-sending the same payload
// is a no-op (the PUT idempotency the frontend's pessimistic writes rely
// on). Since RUN-59 the profile holds the SETUP ANSWERS only - the runner's
// name and email moved to PUT /api/account, the single source of truth every
// social surface already read from.
export class PutProfileDto {
  @IsIn(RUNNING_LEVELS, {
    message: `runningLevel must be one of: ${RUNNING_LEVELS.join(', ')}`,
  })
  runningLevel!: RunningLevel;

  @IsInt({ message: 'defaultWeeklyGoalKm must be an integer number' })
  @Min(GOAL_MIN_KM, {
    message: `defaultWeeklyGoalKm must be at least ${GOAL_MIN_KM}`,
  })
  @Max(GOAL_MAX_KM, {
    message: `defaultWeeklyGoalKm must be at most ${GOAL_MAX_KM}`,
  })
  defaultWeeklyGoalKm!: number;
}

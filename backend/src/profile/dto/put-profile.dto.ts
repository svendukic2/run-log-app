import { IsIn, IsInt, Max, Min } from 'class-validator';
import { GOAL_MAX_KM, GOAL_MIN_KM } from '../../common/weekly-goal';

// Mirrors the RunningLevel union in docs/data-model.md: capitalized in the
// API and the database, whatever casing the v1 localStorage store used.
export const RUNNING_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
export type RunningLevel = (typeof RUNNING_LEVELS)[number];

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

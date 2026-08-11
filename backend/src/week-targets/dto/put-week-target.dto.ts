import { IsInt, Max, Min } from 'class-validator';
import { GOAL_MIN_KM, WEEK_TARGET_MAX_KM } from '../../common/weekly-goal';

// The body of "Apply to weekly goal" (AIC-5, A15). The bounds are
// deliberately NOT the 0-60 slider range: the coach can suggest more than
// the sliders offer and the target must honour the number the runner
// accepted (the same reasoning as frontend applyGoalTarget), but see
// WEEK_TARGET_MAX_KM for why "more" still has a ceiling. Zero is in: the
// goal slider allows 0, so a week target of 0 must be writable too, or a
// snapshot the server itself seeded with 0 could never be re-applied.
export class PutWeekTargetDto {
  @IsInt({ message: 'targetKm must be an integer number' })
  @Min(GOAL_MIN_KM, { message: `targetKm must be at least ${GOAL_MIN_KM}` })
  @Max(WEEK_TARGET_MAX_KM, {
    message: `targetKm must be at most ${WEEK_TARGET_MAX_KM}`,
  })
  targetKm!: number;
}

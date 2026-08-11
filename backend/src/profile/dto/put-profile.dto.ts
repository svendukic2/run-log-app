import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GOAL_MAX_KM, GOAL_MIN_KM } from '../../common/weekly-goal';

// Mirrors the RunningLevel union in docs/data-model.md: capitalized in the
// API and the database, whatever casing the v1 localStorage store used.
export const RUNNING_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
export type RunningLevel = (typeof RUNNING_LEVELS)[number];

// Anti-abuse bounds like the runs module's (ROUTE_NAME_MAX_LENGTH): they
// keep a stray script from storing megabytes in unbounded TEXT columns,
// not police real names. 254 is the RFC 5321 ceiling for an address.
export const NAME_MAX_LENGTH = 80;
export const EMAIL_MAX_LENGTH = 254;

const trimmed = () =>
  Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  );

// PUT /api/profile is a full replace: every field is required, so the row
// can never drift into a half-written state and re-sending the same payload
// is a no-op (the PUT idempotency the frontend's pessimistic writes rely
// on). Rules mirror the onboarding forms (WEL-5): non-empty trimmed names,
// a well-formed email, one of the three levels, goal km on the 0-60 slider
// range.
export class PutProfileDto {
  @trimmed()
  @IsString({ message: 'firstName must be a string' })
  @IsNotEmpty({ message: 'firstName must not be empty' })
  @MaxLength(NAME_MAX_LENGTH, {
    message: `firstName must be at most ${NAME_MAX_LENGTH} characters`,
  })
  firstName!: string;

  @trimmed()
  @IsString({ message: 'lastName must be a string' })
  @IsNotEmpty({ message: 'lastName must not be empty' })
  @MaxLength(NAME_MAX_LENGTH, {
    message: `lastName must be at most ${NAME_MAX_LENGTH} characters`,
  })
  lastName!: string;

  @trimmed()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(EMAIL_MAX_LENGTH, {
    message: `email must be at most ${EMAIL_MAX_LENGTH} characters`,
  })
  email!: string;

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

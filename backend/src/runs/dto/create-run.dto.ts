import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { addDaysIso, isRealCalendarDay, utcTodayIso } from '../../common/dates';
import { ValidateIfPresent } from '../../common/validation';

// Moved to src/common/validation.ts when the profile/goal DTOs (RUN-49)
// needed the same present-or-valid semantics; re-exported so this module's
// DTO surface stays in one import.
export { ValidateIfPresent };

// Mirrors frontend/src/lib/runs.ts EFFORT_LEVELS; the API and the UI must
// agree on the capitalized spellings (docs/data-model.md).
export const EFFORT_LEVELS = ['Easy', 'Medium', 'Hard'] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

// Medium is what the Add run modal preselects (ADD-8), so it is also what a
// payload without an effort means. Omitted, not null: an explicit null is
// rejected like any other invalid value.
export const DEFAULT_EFFORT: Effort = 'Medium';

// API-side bounds for the two free-text fields (documented in
// docs/data-model.md). The v1 forms enforce no lengths, so these exist to
// keep a stray script from storing megabytes in an unbounded TEXT column,
// not to police real input. RUN-73 mirrors these in the forms when the
// frontend switches to the API.
export const ROUTE_NAME_MAX_LENGTH = 120;
export const NOTE_MAX_LENGTH = 2000;

// The latest calendar day the API accepts: tomorrow in UTC, computed from
// UTC getters end to end (local getters here would silently shrink the
// slack on any server west of Greenwich). The server cannot know the
// client's zone, and the maximum eastern offset is UTC+14, so a client's
// local calendar day can exceed the UTC day by at most one: one day of
// slack is exactly sufficient, no more. The strict "not in the future" of
// RUN-23 AC7 is enforced by the form, where the user's zone is known.
export function latestAcceptableUtcIso(): string {
  return addDaysIso(utcTodayIso(), 1);
}

// Rejects impossible calendar days (2026-02-31, which new Date() silently
// rolls over to March) and dates past the one-day slack above. class-validator
// runs every validator on a property independently (no short-circuiting), so
// for a garbage string both this and @Matches report; that is also why this
// validator does its own type guarding instead of trusting @Matches to have
// run first.
export function IsRealNotFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRealNotFutureDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          // ISO date strings compare correctly as strings.
          return isRealCalendarDay(value) && value <= latestAcceptableUtcIso();
        },
      },
    });
  };
}

export class CreateRunDto {
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'routeName must be a string' })
  @IsNotEmpty({ message: 'routeName must not be empty' })
  @MaxLength(ROUTE_NAME_MAX_LENGTH, {
    message: `routeName must be at most ${ROUTE_NAME_MAX_LENGTH} characters`,
  })
  routeName!: string;

  @IsNumber({}, { message: 'distanceKm must be a number' })
  @IsPositive({ message: 'distanceKm must be greater than 0' })
  distanceKm!: number;

  @IsInt({ message: 'durationSeconds must be an integer number' })
  @IsPositive({ message: 'durationSeconds must be greater than 0' })
  durationSeconds!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be a yyyy-mm-dd string',
  })
  @IsRealNotFutureDate({
    message: 'date must be a real calendar day and not in the future',
  })
  date!: string;

  @ValidateIfPresent()
  @IsIn(EFFORT_LEVELS, {
    message: `effort must be one of: ${EFFORT_LEVELS.join(', ')}`,
  })
  effort?: Effort;

  @ValidateIfPresent()
  @IsString({ message: 'note must be a string' })
  @MaxLength(NOTE_MAX_LENGTH, {
    message: `note must be at most ${NOTE_MAX_LENGTH} characters`,
  })
  note?: string;
}

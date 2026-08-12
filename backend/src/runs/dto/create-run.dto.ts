import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  registerDecorator,
  ValidateNested,
  type ValidationOptions,
} from 'class-validator';
import { addDaysIso, isRealCalendarDay, utcTodayIso } from '../../common/dates';
import { ValidateIfNotNull, ValidateIfPresent } from '../../common/validation';
import { CoordinateDto, MAX_WAYPOINTS } from '../../routes/dto/plan-route.dto';

// Moved to src/common/validation.ts when the profile/goal DTOs (RUN-49)
// needed the same present-or-valid semantics; re-exported so this module's
// DTO surface stays in one import.
export { ValidateIfNotNull, ValidateIfPresent };

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

// A bound on the event id (RUN-76), the same kind of thing as the two above:
// ids are cuid()s of about 25 characters, so this is far above anything real
// and far below "a stray script sent a megabyte". Deliberately NOT a cuid
// format check - the id's real validation is the lookup in runs.service, which
// has to happen anyway (the event must exist, be one the caller joined, and
// contain the run's date), and a format rule here would only turn a 400 that
// explains itself into a 400 about syntax.
export const EVENT_ID_MAX_LENGTH = 64;

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

/* The optional route (RUN-54) -------------------------------------------- */

// A stored route keeps the points the runner tapped INCLUDING both ends, so
// Edit can restore the picker exactly and re-plan from it (AC5): index 0 is
// Start, the last is Finish, and everything between is a numbered waypoint.
// Hence the bounds: the plan endpoint's waypoint cap (MAX_WAYPOINTS, reused
// so the two cannot drift) plus the two ends, and a floor of two, because
// one point is not a route.
export const MIN_ROUTE_POINTS = 2;
export const MAX_ROUTE_POINTS = MAX_WAYPOINTS + 2;

// An encoded polyline is a couple of bytes per point per axis, so even a
// long walking route is a few KB. This bound is the same kind of thing as
// NOTE_MAX_LENGTH: far above anything five tapped points can produce, far
// below "a stray script filled a TEXT column".
export const ROUTE_POLYLINE_MAX_LENGTH = 20_000;

// The route as the client submits it: the line the provider drew plus the
// points it was drawn from. `source` is deliberately NOT here - the server
// stamps it (runs.service.ts) because it is a fact about who planned the
// route, not a client preference, and the app-wide whitelist pipe rejects
// any payload that tries to send one.
export class RunRouteDto {
  @IsString({ message: 'route.polyline must be a string' })
  @IsNotEmpty({ message: 'route.polyline must not be empty' })
  @MaxLength(ROUTE_POLYLINE_MAX_LENGTH, {
    message: `route.polyline must be at most ${ROUTE_POLYLINE_MAX_LENGTH} characters`,
  })
  polyline!: string;

  @IsArray({ message: 'route.waypoints must be an array' })
  @ArrayMinSize(MIN_ROUTE_POINTS, {
    message: `route.waypoints must contain at least ${MIN_ROUTE_POINTS} points (start and finish)`,
  })
  @ArrayMaxSize(MAX_ROUTE_POINTS, {
    message: `route.waypoints must contain at most ${MAX_ROUTE_POINTS} points`,
  })
  // Both of these are load-bearing for the same reason they are on
  // PlanRouteDto: without @IsObject an array element that is itself an array
  // validates clean, and without @Type the nested checks have no class to
  // run against.
  @IsObject({
    each: true,
    message: 'each route.waypoints entry must be a { lat, lng } object',
  })
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  waypoints!: CoordinateDto[];
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

  // Omitted and null both mean "no route", and the run saves exactly as it
  // did before RUN-54 (AC3). null is accepted here, unlike everywhere else
  // in this DTO, because the run form submits its complete shape on every
  // save: "the map is empty" has to be sayable, and saying it as null beats
  // asking every caller to delete a key.
  //
  // Nesting the three route facts under ONE property is what makes the
  // all-or-none invariant structural: there is no way to submit a polyline
  // with no waypoints, so there is no cross-field rule to enforce and no
  // half-written route to store (the database CHECK in the migration guards
  // the same thing from the other side).
  @ValidateIfNotNull()
  @IsObject({ message: 'route must be a { polyline, waypoints } object' })
  @ValidateNested()
  @Type(() => RunRouteDto)
  route?: RunRouteDto | null;

  // The event this run counts towards (RUN-76 AC1), or null / omitted for the
  // ordinary untagged run. null is accepted here for the same reason it is on
  // `route` above: the run form submits its complete shape on every save, so
  // "No event" has to be sayable.
  //
  // Everything that makes a tag LEGAL is checked in runs.service, not here:
  // the event has to exist, the caller has to have joined it, and the run's
  // date has to fall inside its window (AC3). None of those are knowable from
  // the payload alone, and splitting the rules across two files is how one of
  // them ends up enforced on create but not on PATCH.
  @ValidateIfNotNull()
  @IsString({ message: 'eventId must be a string' })
  @IsNotEmpty({ message: 'eventId must not be empty' })
  @MaxLength(EVENT_ID_MAX_LENGTH, {
    message: `eventId must be at most ${EVENT_ID_MAX_LENGTH} characters`,
  })
  eventId?: string | null;
}

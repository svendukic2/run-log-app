import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  EFFORT_LEVELS,
  IsRealNotFutureDate,
  NOTE_MAX_LENGTH,
  ROUTE_NAME_MAX_LENGTH,
  RunRouteDto,
  ValidateIfNotNull,
  ValidateIfPresent,
  type Effort,
} from './create-run.dto';

// PATCH semantics: any subset of the create fields, each validated by the
// same rules when present. Written out explicitly rather than through
// PartialType, whose default @IsOptional SKIPS validation for null - so
// PATCH {"routeName": null} would sail through the pipe and hit the
// NOT NULL column as a 500. ValidateIfPresent validates null like any other
// wrong value; the duplication with CreateRunDto is the price of one
// mechanism with no version-sensitive library magic.
export class UpdateRunDto {
  @ValidateIfPresent()
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'routeName must be a string' })
  @IsNotEmpty({ message: 'routeName must not be empty' })
  @MaxLength(ROUTE_NAME_MAX_LENGTH, {
    message: `routeName must be at most ${ROUTE_NAME_MAX_LENGTH} characters`,
  })
  routeName?: string;

  @ValidateIfPresent()
  @IsNumber({}, { message: 'distanceKm must be a number' })
  @IsPositive({ message: 'distanceKm must be greater than 0' })
  distanceKm?: number;

  @ValidateIfPresent()
  @IsInt({ message: 'durationSeconds must be an integer number' })
  @IsPositive({ message: 'durationSeconds must be greater than 0' })
  durationSeconds?: number;

  @ValidateIfPresent()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be a yyyy-mm-dd string',
  })
  @IsRealNotFutureDate({
    message: 'date must be a real calendar day and not in the future',
  })
  date?: string;

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

  // Three distinct meanings, all reachable (RUN-54): omitted leaves the
  // stored route alone, null REMOVES it, and an object replaces it whole.
  // The removal case is why null is legal here while it is a 400 for every
  // field above - clearing the map has to survive a save, and a PATCH that
  // can only ever add a route would leave the picker's Clear button lying.
  @ValidateIfNotNull()
  @IsObject({ message: 'route must be a { polyline, waypoints } object' })
  @ValidateNested()
  @Type(() => RunRouteDto)
  route?: RunRouteDto | null;
}

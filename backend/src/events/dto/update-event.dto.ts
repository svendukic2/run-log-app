import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDay, ValidateIfPresent } from '../../common/validation';
import {
  EVENT_DESCRIPTION_MAX_LENGTH,
  EVENT_NAME_MAX_LENGTH,
} from './create-event.dto';

// PATCH /api/events/:id (RUN-67 AC5): every field optional, same rules as
// create for whatever is present. Deliberately a hand-written mirror rather
// than PartialType(CreateEventDto): the app takes no dependency on
// @nestjs/mapped-types, and targetKm's rule genuinely differs (null clears
// the goal here; create rejects null).
export class UpdateEventDto {
  @ValidateIfPresent()
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(EVENT_NAME_MAX_LENGTH, {
    message: `name must be at most ${EVENT_NAME_MAX_LENGTH} characters`,
  })
  name?: string;

  @ValidateIfPresent()
  @IsString({ message: 'description must be a string' })
  @MaxLength(EVENT_DESCRIPTION_MAX_LENGTH, {
    message: `description must be at most ${EVENT_DESCRIPTION_MAX_LENGTH} characters`,
  })
  description?: string;

  @ValidateIfPresent()
  @IsCalendarDay({
    message: 'startDate must be a real yyyy-mm-dd calendar day',
  })
  startDate?: string;

  @ValidateIfPresent()
  @IsCalendarDay({
    message: 'endDate must be a real yyyy-mm-dd calendar day',
  })
  endDate?: string;

  // Skipped only for undefined and null: null means "clear the distance
  // goal" (the column is nullable), anything else must be a positive number.
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsNumber({}, { message: 'targetKm must be a number or null' })
  @IsPositive({ message: 'targetKm must be greater than 0' })
  targetKm?: number | null;
}

import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsCalendarDay, ValidateIfPresent } from '../../common/validation';

// API-side bounds for the two free-text fields, same reasoning as the runs
// DTO: they stop a stray script from storing megabytes in an unbounded TEXT
// column, not to police real input.
export const EVENT_NAME_MAX_LENGTH = 120;
export const EVENT_DESCRIPTION_MAX_LENGTH = 2000;

// POST /api/events (RUN-67 AC1). Both dates are inclusive calendar days with
// no past/future bound: a backdated or already-finished event is odd but
// harmless, and the AC only requires end on/after start. That cross-field
// rule is deliberately NOT here: the PATCH DTO validates fields it cannot
// order (either date may be absent), so the service checks the merged pair
// for both verbs in one place (validateDateOrder).
export class CreateEventDto {
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(EVENT_NAME_MAX_LENGTH, {
    message: `name must be at most ${EVENT_NAME_MAX_LENGTH} characters`,
  })
  name!: string;

  @ValidateIfPresent()
  @IsString({ message: 'description must be a string' })
  @MaxLength(EVENT_DESCRIPTION_MAX_LENGTH, {
    message: `description must be at most ${EVENT_DESCRIPTION_MAX_LENGTH} characters`,
  })
  description?: string;

  @IsCalendarDay({
    message: 'startDate must be a real yyyy-mm-dd calendar day',
  })
  startDate!: string;

  @IsCalendarDay({
    message: 'endDate must be a real yyyy-mm-dd calendar day',
  })
  endDate!: string;

  // Omitted means "no distance goal"; an explicit null is rejected like any
  // other invalid value (ValidateIfPresent semantics, matching every other
  // optional field in the app).
  @ValidateIfPresent()
  @IsNumber({}, { message: 'targetKm must be a number' })
  @IsPositive({ message: 'targetKm must be greater than 0' })
  targetKm?: number;
}

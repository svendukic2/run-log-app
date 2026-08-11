import {
  IsInt,
  Max,
  Min,
  registerDecorator,
  ValidateIf,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { isRealCalendarDay } from '../../common/dates';
import { IsCalendarDay } from '../../common/validation';
import { GOAL_MAX_KM, GOAL_MIN_KM } from '../../common/weekly-goal';

// A goal period that ends before it starts is nonsense the onboarding form
// already prevents (GOAL-4); the API refuses it too. ISO day strings
// compare chronologically as plain strings. When startDate itself is not a
// real day this passes and stays quiet: startDate's own validators are
// already reporting, and a comparison against garbage would only add a
// misleading second error.
function IsOnOrAfterStartDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isOnOrAfterStartDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const { startDate } = args.object as PutGoalDto;
          if (!isRealCalendarDay(startDate)) return true;
          return typeof value === 'string' && value >= startDate;
        },
      },
    });
  };
}

// PUT /api/goal is a full replace of the onboarding goal record
// (docs/data-model.md): km on the 0-60 slider (GOAL-2, A17), a start day,
// and an end day that is either a real day on or after the start or null -
// null and omitted both mean "No end date" (GOAL-3).
export class PutGoalDto {
  @IsInt({ message: 'km must be an integer number' })
  @Min(GOAL_MIN_KM, { message: `km must be at least ${GOAL_MIN_KM}` })
  @Max(GOAL_MAX_KM, { message: `km must be at most ${GOAL_MAX_KM}` })
  km!: number;

  // One validator, not @Matches plus this: IsCalendarDay already rejects
  // every shape @Matches would, and one mistake deserves one error.
  @IsCalendarDay({
    message: 'startDate must be a real yyyy-mm-dd calendar day',
  })
  startDate!: string;

  // Skipped only for undefined and null (both mean "No end date"); any
  // other value must be a real day that does not precede the start.
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsCalendarDay({
    message: 'endDate must be a real yyyy-mm-dd calendar day or null',
  })
  @IsOnOrAfterStartDate({ message: 'endDate must not be before startDate' })
  endDate?: string | null;
}

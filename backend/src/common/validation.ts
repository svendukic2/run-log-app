// Validation building blocks shared across feature DTOs (RUN-49). Both
// started life in the runs module and moved here when the profile/goal
// DTOs needed the same semantics.
import {
  registerDecorator,
  ValidateIf,
  type ValidationOptions,
} from 'class-validator';
import { isRealCalendarDay } from './dates';

// Runs the decorated validators only when the property is present in the
// payload. Unlike @IsOptional, an explicit null is NOT waved through: null
// fails the validators like any other wrong value. This matters most for
// PATCH/PUT payloads ({"routeName": null} must be a 400, not a null hitting
// a NOT NULL column).
export function ValidateIfPresent() {
  return ValidateIf((_object, value) => value !== undefined);
}

// For the rare property where null is a MEANING rather than a mistake:
// omitted and null both skip the decorated validators. Reach for this only
// when the client genuinely has to be able to state an absence - the run's
// route (RUN-54) is the one case today, because the run form always submits
// its complete shape and "I cleared the map" has to be expressible as
// something. Every other field keeps ValidateIfPresent above, where an
// explicit null is a 400 by design (docs/data-model.md, API validation).
export function ValidateIfNotNull() {
  return ValidateIf((_object, value) => value !== undefined && value !== null);
}

// A real calendar day with no past/future bound: goal periods legitimately
// start in the past and end in the future. Rejects impossible days like
// 2026-02-31, which new Date() would silently roll over into March.
// class-validator runs every validator on a property independently (no
// short-circuiting), so this guards its own input type instead of trusting
// a @Matches to have run first.
export function IsCalendarDay(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCalendarDay',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isRealCalendarDay(value);
        },
      },
    });
  };
}

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsLatitude,
  IsLongitude,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { ValidateIfPresent } from '../../common/validation';

// The most waypoints a single plan request may carry, between start and
// finish (RUN-53 AC1). The cap is a work bound as much as a UI one: every
// extra point is more provider work per request against a free-tier quota,
// and the RUN-54 picker only offers three. Raising it means re-checking the
// provider's own coordinate limit, not just this number.
export const MAX_WAYPOINTS = 3;

// One point, in the order the browser has it. Leaflet hands RUN-54 a
// {lat, lng} pair, so that is what this endpoint takes; the provider wants
// [lng, lat] and RoutesService does that flip in one place. Do not "fix"
// this to match the provider - the swap cost of a different provider should
// land in the service, not in the request contract.
export class CoordinateDto {
  // @IsLatitude alone accepts numeric strings, so the range check is paired
  // with @IsNumber: without it "52.52" would pass validation and then be
  // JSON-serialised to the provider as a string.
  @IsNumber({}, { message: 'lat must be a number' })
  @IsLatitude({ message: 'lat must be between -90 and 90' })
  lat!: number;

  @IsNumber({}, { message: 'lng must be a number' })
  @IsLongitude({ message: 'lng must be between -180 and 180' })
  lng!: number;
}

// POST /api/routes/plan body. Validated by the app-wide ValidationPipe
// (whitelist + forbidNonWhitelisted + transform, see AppModule), which is
// why every bound below lives here rather than in the service: the DTO is
// the contract. @Type is what makes the nested checks run at all - without
// it the nested objects stay plain and @ValidateNested has no class to
// validate against.
// Both endpoints are required, and @IsDefined is what makes that true:
// @ValidateNested on its own has nothing to descend into when the property is
// absent, so it passes an undefined straight through. Without these two lines
// a body of {} validates, and the service then reads .lng off undefined - a
// TypeError, which is the generic 500 AC2 exists to prevent.
export class PlanRouteDto {
  @IsDefined({ message: 'start is required' })
  @ValidateNested()
  @Type(() => CoordinateDto)
  start!: CoordinateDto;

  @IsDefined({ message: 'finish is required' })
  @ValidateNested()
  @Type(() => CoordinateDto)
  finish!: CoordinateDto;

  // Omitted and [] both mean "straight from start to finish". An explicit
  // null is rejected like any other wrong value (ValidateIfPresent, not
  // IsOptional), so a frontend bug that sends null gets a 400 instead of
  // silently routing a two-point line.
  @ValidateIfPresent()
  @IsArray({ message: 'waypoints must be an array' })
  @ArrayMaxSize(MAX_WAYPOINTS, {
    message: `waypoints must contain at most ${MAX_WAYPOINTS} points`,
  })
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  waypoints?: CoordinateDto[];
}

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsObject,
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
// @ValidateNested needs two companions to actually mean "a required point",
// and both are load-bearing. @IsDefined, because nested validation has nothing
// to descend into when the property is absent and so passes undefined straight
// through - a body of {} would validate and the service would then read .lng
// off undefined. @IsObject, because an array is an object to @ValidateNested
// but not to us: `{"start": []}` and `{"start": [{...}]}` otherwise validate
// clean, and the service sends [null, null] to the provider and charges a
// quota request to report the client's mistake as a provider fault. Both
// cases are the generic-error leak AC2 exists to prevent.
export class PlanRouteDto {
  @IsDefined({ message: 'start is required' })
  @IsObject({ message: 'start must be a { lat, lng } object' })
  @ValidateNested()
  @Type(() => CoordinateDto)
  start!: CoordinateDto;

  @IsDefined({ message: 'finish is required' })
  @IsObject({ message: 'finish must be a { lat, lng } object' })
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
  // Same reason as start/finish above, applied per element: without it a
  // nested array like [[]] is a valid waypoint.
  @IsObject({
    each: true,
    message: 'each waypoint must be a { lat, lng } object',
  })
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  waypoints?: CoordinateDto[];
}

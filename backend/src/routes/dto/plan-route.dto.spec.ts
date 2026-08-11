// @Type on the nested coordinates needs Reflect.getMetadata, which Nest's
// bootstrap provides in production and @nestjs/testing pulls in for the
// service spec. This file imports neither, so it says so itself - without
// this line the suite fails to load, not just to pass.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { CoordinateDto, MAX_WAYPOINTS, PlanRouteDto } from './plan-route.dto';

// Direct class-validator runs, like create-run.dto.spec.ts: the app-wide
// ValidationPipe is what applies these in production, so proving the DTO
// proves the endpoint's contract without an HTTP server. AC1's 0-3 waypoint
// cap and the coordinate ranges are enforced here and nowhere else - the
// service assumes the numbers it is handed are in range.

const START = { lat: 52.516275, lng: 13.377704 };
const FINISH = { lat: 52.520008, lng: 13.404954 };

async function errorsFor(
  overrides: Record<string, unknown>,
): Promise<ValidationError[]> {
  const dto = plainToInstance(PlanRouteDto, {
    start: START,
    finish: FINISH,
    ...overrides,
  });
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

// Nested failures nest their own errors, so a flat list of the property names
// that failed anywhere in the payload is what the assertions want.
function failedProperties(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    error.property,
    ...failedProperties(error.children ?? []),
  ]);
}

describe('PlanRouteDto', () => {
  it('accepts a start and a finish with no waypoints', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('accepts an empty waypoints array as "straight there"', async () => {
    expect(await errorsFor({ waypoints: [] })).toHaveLength(0);
  });

  it(`accepts exactly ${MAX_WAYPOINTS} waypoints`, async () => {
    const waypoints = Array.from({ length: MAX_WAYPOINTS }, (_, index) => ({
      lat: 52.51 + index / 1000,
      lng: 13.39 + index / 1000,
    }));

    expect(await errorsFor({ waypoints })).toHaveLength(0);
  });

  it('rejects a fourth waypoint by the documented cap', async () => {
    const waypoints = Array.from({ length: MAX_WAYPOINTS + 1 }, () => START);

    const errors = await errorsFor({ waypoints });

    expect(failedProperties(errors)).toContain('waypoints');
    expect(JSON.stringify(errors)).toContain(`at most ${MAX_WAYPOINTS} points`);
  });

  it.each([
    ['a latitude past the pole', { lat: 91, lng: 13.4 }],
    ['a latitude past the south pole', { lat: -90.1, lng: 13.4 }],
    ['a longitude past the antimeridian', { lat: 52.5, lng: 180.1 }],
    ['a longitude below -180', { lat: 52.5, lng: -180.1 }],
  ])('rejects %s in start', async (_label, start) => {
    expect(failedProperties(await errorsFor({ start }))).toContain('start');
  });

  it('rejects a numeric string, which the range check alone would accept', async () => {
    // @IsLatitude passes for "52.5"; without the paired @IsNumber the string
    // would reach the provider as a JSON string and be rejected there.
    const errors = await errorsFor({ start: { lat: '52.5', lng: '13.4' } });

    expect(failedProperties(errors)).toEqual(
      expect.arrayContaining(['lat', 'lng']),
    );
  });

  it('rejects an out-of-range waypoint, not just an out-of-range endpoint', async () => {
    const errors = await errorsFor({ waypoints: [{ lat: 52.5, lng: 200 }] });

    expect(failedProperties(errors)).toContain('waypoints');
  });

  it.each([
    ['a missing start', { start: undefined }],
    ['a missing finish', { finish: undefined }],
    ['a start with no lng', { start: { lat: 52.5 } }],
    ['a start that is not an object', { start: 'here' }],
    ['an explicit null waypoints', { waypoints: null }],
    ['waypoints that is not an array', { waypoints: START }],
  ])('rejects %s', async (_label, overrides) => {
    expect((await errorsFor(overrides)).length).toBeGreaterThan(0);
  });

  it('rejects unknown properties, top level and nested', async () => {
    // forbidNonWhitelisted in production; asserted here so a client cannot
    // smuggle provider options (a different profile, say) through the proxy.
    expect(
      failedProperties(await errorsFor({ profile: 'driving-car' })),
    ).toContain('profile');
    expect(
      failedProperties(await errorsFor({ start: { ...START, radius: 5000 } })),
    ).toContain('radius');
  });
});

describe('CoordinateDto', () => {
  it('accepts 0,0 - useless, but in range and not our business to guess', async () => {
    const dto = plainToInstance(CoordinateDto, { lat: 0, lng: 0 });
    expect(await validate(dto)).toHaveLength(0);
  });
});

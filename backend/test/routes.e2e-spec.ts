import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  ROUTE_PLAN_ERRORS,
  type RoutePlanErrorBody,
  type RoutePlanResponse,
} from './../src/routes/routes.service';
import { createE2eApp, signupUser } from './create-test-app';

// Full-path POST /api/routes/plan (RUN-53). The provider is stubbed here as
// it is in the unit spec - this suite is not about the provider but about the
// three things only a booted app can prove: the global JwtAuthGuard really
// does cover this endpoint, the global ValidationPipe really does enforce the
// DTO, and the typed error body survives Nest's exception layer with its
// `code` intact. That last one is what AC2 rests on: a `code` the modal can
// switch on is worthless if the framework flattens it on the way out.

function planBody(response: request.Response): RoutePlanResponse {
  return response.body as RoutePlanResponse;
}

function errorBody(response: request.Response): RoutePlanErrorBody {
  return response.body as RoutePlanErrorBody;
}

function validationMessages(response: request.Response): string[] {
  const { message } = response.body as { message: string | string[] };
  return Array.isArray(message) ? message : [message];
}

const START = { lat: 52.516275, lng: 13.377704 };
const FINISH = { lat: 52.520008, lng: 13.404954 };

const POLYLINE = 'mfp_Ic_vpAWBSBE?C@C?E?c@FsALC@M@K@';

describe('Route planning API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const keyBeforeSuite = process.env.ROUTING_API_KEY;

  beforeAll(async () => {
    // Set before the app boots, because ConfigModule reads the environment
    // once at module init. A fixed key here means this suite behaves the same
    // whether or not the developer running it has a real one in backend/.env,
    // and the stub below means it never spends their quota either.
    process.env.ROUTING_API_KEY = 'e2e-test-key';

    ({ app, prisma } = await createE2eApp());
    await prisma.user.deleteMany();
    auth = await signupUser(app, 'route-planner');
  });

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
    if (keyBeforeSuite === undefined) {
      delete process.env.ROUTING_API_KEY;
    } else {
      process.env.ROUTING_API_KEY = keyBeforeSuite;
    }
  });

  function post(body: unknown) {
    return request(app.getHttpServer()).post('/api/routes/plan').send(body);
  }

  it('401s without a token, and never calls the provider', async () => {
    // Deliberately not @Public: an open planner is a free proxy onto our
    // free-tier quota, and exhausting it breaks the map for real users.
    await post({ start: START, finish: FINISH }).expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the polyline and distance for a signed-in caller (AC1)', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          routes: [
            {
              summary: { distance: 2137.4, duration: 1583.2 },
              geometry: POLYLINE,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const response = await post({
      start: START,
      finish: FINISH,
      waypoints: [{ lat: 52.518611, lng: 13.388889 }],
    }).set(auth);

    // 200, not 201: nothing was created.
    expect(response.status).toBe(200);
    expect(planBody(response)).toEqual({
      polyline: POLYLINE,
      distanceKm: 2.14,
      durationSeconds: 1583,
      profile: 'foot-walking',
      source: 'openrouteservice',
    });
  });

  it('keeps the error code intact through the exception layer (AC2)', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const response = await post({ start: START, finish: FINISH }).set(auth);

    expect(response.status).toBe(503);
    const body = errorBody(response);
    expect(body.code).toBe(ROUTE_PLAN_ERRORS.UNAVAILABLE);
    expect(body.statusCode).toBe(503);
    // A message the modal can show as-is, with none of the provider's own
    // wording in it.
    expect(body.message).toEqual(expect.any(String));
    expect(body.message).not.toContain('ECONNREFUSED');
  });

  it.each([
    ['a latitude past the pole', { start: { lat: 91, lng: 13.4 } }],
    ['a missing finish', { finish: undefined }],
    ['a fourth waypoint', { waypoints: [START, START, START, START] }],
    // forbidNonWhitelisted: a client must not be able to smuggle provider
    // options - a driving profile, say - through the proxy.
    ['an unknown property', { profile: 'driving-car' }],
  ])('400s %s without calling the provider', async (_label, overrides) => {
    const response = await post({
      start: START,
      finish: FINISH,
      ...overrides,
    }).set(auth);

    expect(response.status).toBe(400);
    expect(validationMessages(response).length).toBeGreaterThan(0);
    // Validation must run before we spend a request on the provider.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

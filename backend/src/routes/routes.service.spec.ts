import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { PlanRouteDto } from './dto/plan-route.dto';
import {
  DEFAULT_ROUTING_BASE_URL,
  ROUTE_PLAN_ERRORS,
  ROUTING_PROFILE,
  ROUTING_SOURCE,
  RoutesService,
  type RoutePlanErrorBody,
} from './routes.service';

// The provider is stubbed at the global fetch boundary, so these tests prove
// the two things that are actually ours: the request we send (AC1's
// foot-walking profile, the [lng, lat] flip, waypoint order) and the mapping
// from every provider answer to a typed error the modal can distinguish
// (AC2). Nothing here touches the network - the live check lives in
// routes.live-smoke.spec.ts.

// Brandenburg Gate to Museum Island, roughly. Real coordinates so the
// live smoke test can reuse them.
const START = { lat: 52.516275, lng: 13.377704 };
const FINISH = { lat: 52.520008, lng: 13.404954 };

const POLYLINE = 'mfp_Ic_vpAWBSBE?C@C?E?c@FsALC@M@K@';

function okBody(overrides: Record<string, unknown> = {}) {
  return {
    routes: [
      {
        summary: { distance: 2137.4, duration: 1583.2 },
        geometry: POLYLINE,
        ...overrides,
      },
    ],
    metadata: { service: 'routing' },
  };
}

// Response is a global in Node 24, but building one by hand keeps the
// assertions about status and body rather than about header plumbing.
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// fetch's own types allow a URL object or a Request, and a BodyInit that is
// not necessarily a string, so both accessors narrow rather than stringify:
// a change that started passing a Request should fail loudly here, not turn
// into a "[object Object]" assertion that quietly still passes.
function calledUrl(call: Parameters<typeof fetch>): string {
  const [url] = call;
  if (typeof url !== 'string') {
    throw new Error(`expected a string URL, got ${typeof url}`);
  }
  return url;
}

function calledJsonBody(call: Parameters<typeof fetch>): unknown {
  const body = call[1]?.body;
  if (typeof body !== 'string') {
    throw new Error(`expected a JSON string body, got ${typeof body}`);
  }
  return JSON.parse(body);
}

describe('RoutesService', () => {
  let service: RoutesService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let config: Record<string, string | undefined>;

  beforeEach(async () => {
    config = { ROUTING_API_KEY: 'test-provider-key' };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RoutesService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();

    service = moduleRef.get(RoutesService);
    fetchMock = jest.spyOn(globalThis, 'fetch');
    // Provider failures are logged for the operator; the assertions are on
    // the thrown body, so keep the test output readable.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function plan(dto: Partial<PlanRouteDto> = {}): Promise<unknown> {
    return service.plan({ start: START, finish: FINISH, ...dto });
  }

  // Asserts the shape AC2 promises: a deliberate status and a typed body with
  // a code, never a raw provider payload or a generic 500.
  async function failureOf(promise: Promise<unknown>): Promise<{
    status: number;
    body: RoutePlanErrorBody;
  }> {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const exception = error as HttpException;
      return {
        status: exception.getStatus(),
        body: exception.getResponse() as RoutePlanErrorBody,
      };
    }
    throw new Error('expected plan() to reject, but it resolved');
  }

  describe('the happy path (AC1)', () => {
    it('returns the polyline and the distance in km', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, okBody()));

      await expect(plan()).resolves.toEqual({
        polyline: POLYLINE,
        // 2137.4 m, rounded to the two decimals CreateRunDto.distanceKm takes.
        distanceKm: 2.14,
        durationSeconds: 1583,
        profile: ROUTING_PROFILE,
        source: ROUTING_SOURCE,
      });
    });

    it('asks for the foot-walking profile, not a car one', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, okBody()));
      await plan();

      // The whole point of the spike: the public OSRM demo answered this same
      // path with car results, which is why the provider is ORS.
      expect(calledUrl(fetchMock.mock.calls[0])).toBe(
        `${DEFAULT_ROUTING_BASE_URL}/v2/directions/foot-walking`,
      );
    });

    it('sends [lng, lat] pairs in start, waypoints, finish order', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, okBody()));
      const via = { lat: 52.518611, lng: 13.388889 };

      await plan({ waypoints: [via] });

      expect(calledJsonBody(fetchMock.mock.calls[0])).toEqual({
        coordinates: [
          [START.lng, START.lat],
          [via.lng, via.lat],
          [FINISH.lng, FINISH.lat],
        ],
      });
    });

    it('sends the key as a raw Authorization header and never in the URL', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, okBody()));
      await plan();

      expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
        Authorization: 'test-provider-key',
      });
      // A key in the query string lands in provider access logs and in any
      // proxy between us; it belongs in the header only.
      expect(calledUrl(fetchMock.mock.calls[0])).not.toContain(
        'test-provider-key',
      );
    });

    it('honours ROUTING_BASE_URL for a self-hosted provider, trailing slash and all', async () => {
      config.ROUTING_BASE_URL = 'http://localhost:8080/ors/';
      fetchMock.mockResolvedValue(jsonResponse(200, okBody()));

      await plan();

      expect(calledUrl(fetchMock.mock.calls[0])).toBe(
        'http://localhost:8080/ors/v2/directions/foot-walking',
      );
    });

    it('reads a zero-valued summary as 0, not as a broken response', async () => {
      // ORS omits zero summary fields rather than sending 0, which a strict
      // reader would mistake for a malformed body.
      fetchMock.mockResolvedValue(jsonResponse(200, okBody({ summary: {} })));

      await expect(plan()).resolves.toMatchObject({
        distanceKm: 0,
        durationSeconds: 0,
        polyline: POLYLINE,
      });
    });
  });

  describe('provider failures (AC2)', () => {
    it('maps an unreachable provider to 503 UNAVAILABLE', async () => {
      fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

      const { status, body } = await failureOf(plan());

      expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.code).toBe(ROUTE_PLAN_ERRORS.UNAVAILABLE);
      // The provider's own words never reach the browser.
      expect(body.message).not.toContain('ENOTFOUND');
    });

    it('maps a provider 5xx to 503 UNAVAILABLE', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(503, { error: { code: 9999, message: 'maintenance' } }),
      );

      const { status, body } = await failureOf(plan());

      expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.code).toBe(ROUTE_PLAN_ERRORS.UNAVAILABLE);
    });

    it('maps a 429 to 503 RATE_LIMITED, distinct from UNAVAILABLE', async () => {
      fetchMock.mockResolvedValue(jsonResponse(429, { error: 'rate limited' }));

      const { status, body } = await failureOf(plan());

      expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.code).toBe(ROUTE_PLAN_ERRORS.RATE_LIMITED);
    });

    it('reads an exhausted quota out of ORS 403, which is not a 429', async () => {
      // The free tier reports a spent daily allowance as 403, with the reason
      // only in the message, so the status alone would misfile this as a key
      // problem and tell the user the wrong thing.
      fetchMock.mockResolvedValue(
        jsonResponse(403, {
          error: { message: 'Quota exceeded for this API key' },
        }),
      );

      expect((await failureOf(plan())).body.code).toBe(
        ROUTE_PLAN_ERRORS.RATE_LIMITED,
      );
    });

    it('maps a rejected key to NOT_CONFIGURED, an operator problem', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(403, {
          error: { message: 'Access to this API is denied' },
        }),
      );

      const { status, body } = await failureOf(plan());

      expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.code).toBe(ROUTE_PLAN_ERRORS.NOT_CONFIGURED);
    });

    it('answers NOT_CONFIGURED without calling the provider when no key is set', async () => {
      delete config.ROUTING_API_KEY;

      const { status, body } = await failureOf(plan());

      expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.code).toBe(ROUTE_PLAN_ERRORS.NOT_CONFIGURED);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps an unparseable provider body to 502 PROVIDER_ERROR', async () => {
      fetchMock.mockResolvedValue(
        new Response('<html>gateway timeout</html>', { status: 400 }),
      );

      const { status, body } = await failureOf(plan());

      expect(status).toBe(HttpStatus.BAD_GATEWAY);
      expect(body.code).toBe(ROUTE_PLAN_ERRORS.PROVIDER_ERROR);
    });

    it('maps a 200 with no usable geometry to 502 PROVIDER_ERROR', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { routes: [{ summary: { distance: 5 } }] }),
      );

      expect((await failureOf(plan())).body.code).toBe(
        ROUTE_PLAN_ERRORS.PROVIDER_ERROR,
      );
    });
  });

  describe('unroutable points', () => {
    it.each([
      ['no route between the locations', 2009],
      ['a point nowhere near a way', 2010],
    ])('maps ORS code %s (%i) to 422 NOT_FOUND', async (_label, code) => {
      fetchMock.mockResolvedValue(
        jsonResponse(404, { error: { code, message: 'unroutable' } }),
      );

      const { status, body } = await failureOf(plan());

      // 422, not 502: the payload was fine, the world disagreed. This is the
      // one failure the user can act on by moving a pin.
      expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body.code).toBe(ROUTE_PLAN_ERRORS.NOT_FOUND);
    });

    it('treats a 200 with an empty routes list as NOT_FOUND too', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { routes: [] }));

      const { status, body } = await failureOf(plan());

      expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body.code).toBe(ROUTE_PLAN_ERRORS.NOT_FOUND);
    });

    it('does not mistake an unknown 404 for an unroutable point', async () => {
      // A moved endpoint is our problem, not the user's, and must not tell
      // them to drag their pins somewhere else.
      fetchMock.mockResolvedValue(jsonResponse(404, { error: 'Not Found' }));

      expect((await failureOf(plan())).body.code).toBe(
        ROUTE_PLAN_ERRORS.PROVIDER_ERROR,
      );
    });
  });
});

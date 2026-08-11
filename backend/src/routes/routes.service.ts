import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlanRouteDto } from './dto/plan-route.dto';

// ---------------------------------------------------------------------------
// Provider choice (RUN-53 spike, AC3)
// ---------------------------------------------------------------------------
// OpenRouteService, not the public OSRM demo server. The demo server does not
// serve the foot profile that AC1 requires: it accepts any profile segment in
// the path - including a literal nonsense one - and answers every one of them
// with byte-identical car results (same distance, same duration, same
// geometry, weight_name "routability"). A street-snapped line that follows
// one-way car restrictions and skips pedestrian paths is the wrong line for a
// running route, and silently so, which is worse than an error.
//
// OpenRouteService serves a real foot-walking profile behind a free key. The
// key is read here through ConfigService and never leaves the server, which
// is the whole reason this proxy exists rather than a browser fetch.
//
// Swap path: everything provider-shaped is in this file - the URL, the
// profile name, the [lng, lat] flip, and normaliseRoute. The request DTO and
// the RoutePlanResponse below are deliberately provider-neutral, so a
// different provider (or a self-hosted ORS via ROUTING_BASE_URL, which needs
// no code change at all) rewrites this file and nothing else.

// ORS profile id for walking. The ticket asks for foot/walking; foot-hiking
// is the other foot profile and prefers trails, which is not the default a
// road-running log wants.
export const ROUTING_PROFILE = 'foot-walking';

// Echoed to the client and destined for the routeSource column RUN-54 adds,
// so a stored route records which provider drew it.
export const ROUTING_SOURCE = 'openrouteservice';

// Overridable via ROUTING_BASE_URL for a self-hosted ORS instance.
export const DEFAULT_ROUTING_BASE_URL = 'https://api.openrouteservice.org';

// A walking route over at most five points is a fast query. This bound is
// what turns a hung provider into AC2's distinguishable error instead of a
// request that hangs until the browser gives up.
export const ROUTING_TIMEOUT_MS = 8_000;

// The `code` in every error body this endpoint produces (AC2). The status
// code alone is not enough for the modal: "we cannot reach the provider" and
// "these two points have no walkable route between them" are different
// messages to show, and neither should block saving the run by hand.
export const ROUTE_PLAN_ERRORS = {
  // No ROUTING_API_KEY set, or the provider rejected the one we have. Both
  // are operator problems, not user ones, and both mean the same thing to
  // the modal: route planning is off right now.
  NOT_CONFIGURED: 'ROUTING_NOT_CONFIGURED',
  // Unreachable, timed out, or answered 5xx.
  UNAVAILABLE: 'ROUTING_PROVIDER_UNAVAILABLE',
  // Free-tier quota or per-minute limit exhausted. Distinct from
  // UNAVAILABLE because "try again tomorrow" and "try again now" are
  // different advice.
  RATE_LIMITED: 'ROUTING_PROVIDER_RATE_LIMITED',
  // The provider answered, but with something we cannot turn into a route.
  PROVIDER_ERROR: 'ROUTING_PROVIDER_ERROR',
  // The only one of these that is about the request: the points are not
  // near a walkable way, or nothing connects them.
  NOT_FOUND: 'ROUTE_NOT_FOUND',
} as const;

export type RoutePlanErrorCode =
  (typeof ROUTE_PLAN_ERRORS)[keyof typeof ROUTE_PLAN_ERRORS];

// One place per code, because several of these are reachable from more than
// one branch of mapFailure and a message that drifts between them turns into
// two different modal texts for one condition. Each says what the user can do
// next; every provider-fault one says the run can still be saved by hand,
// which is the half of AC2 that is easy to forget.
const MESSAGES = {
  NOT_CONFIGURED: 'Route planning is not configured on this server.',
  UNAVAILABLE:
    'The routing provider could not be reached. Save the run manually and try the map again later.',
  RATE_LIMITED:
    'Route planning has hit its usage limit. Save the run manually and try the map again later.',
  PROVIDER_ERROR:
    'The routing provider could not plan this route. Save the run manually and try the map again later.',
  UNEXPECTED: 'The routing provider returned an unexpected response.',
  NOT_FOUND:
    'No walking route could be found between those points. Try moving them closer to a path.',
} as const;

// The body shape of every failure above. Hand-mirrored into the frontend
// when RUN-54 consumes it - the same wart CLAUDE.md records for
// HelloResponse, and the same fix (a generated OpenAPI spec) applies.
export interface RoutePlanErrorBody {
  statusCode: number;
  code: RoutePlanErrorCode;
  message: string;
}

export interface RoutePlanResponse {
  // Google-algorithm encoded polyline at precision 5 (ORS's JSON default,
  // with elevation off). RUN-55's decoder must be told precision 5, not 6:
  // asking ORS for elevation would return a three-dimensional polyline that
  // a standard 2-D decoder silently mangles rather than rejects.
  polyline: string;
  // Rounded to two decimals to match CreateRunDto.distanceKm, so the value
  // can be written straight into the run form.
  distanceKm: number;
  // The provider's *walking* estimate for the route, whole seconds. Useful
  // as a distance sanity check or an ETA; it is not a run time, so do not
  // prefill the run form's durationSeconds with it.
  durationSeconds: number;
  profile: typeof ROUTING_PROFILE;
  source: typeof ROUTING_SOURCE;
}

// ORS internal error codes that mean "we cannot route these points", as
// opposed to "we are broken". 2009 no route between locations, 2010 point
// not found, 2012 point not near a way, 2013-2016 entry/exit point problems.
// https://giscience.github.io/openrouteservice/api-reference/error-codes
const UNROUTABLE_PROVIDER_CODES = new Set([
  2009, 2010, 2012, 2013, 2014, 2015, 2016,
]);

// ORS reports an exhausted free-tier quota as a 403 rather than a 429, with
// the reason only in the message, so the status alone cannot separate "bad
// key" from "out of quota". This is the narrowest thing that can: it only
// ever runs on a 401/403, and picking wrong costs a slightly-off message,
// not a wrong outcome.
const QUOTA_MESSAGE = /quota|rate.?limit|limit.?(exceeded|reached)|too many/i;

function routingFailure(
  status: HttpStatus,
  code: RoutePlanErrorCode,
  message: string,
): HttpException {
  const body: RoutePlanErrorBody = { statusCode: status, code, message };
  return new HttpException(body, status);
}

// Separates the two ways reading a body can fail, because they are different
// diagnoses. A failed transfer - including our own timeout aborting the stream
// after the headers already arrived - propagates, so a provider that answers
// and then stalls is reported as unreachable like any other timeout. Bytes
// that simply are not JSON return "no detail" instead: the status code is
// still the useful signal there.
async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ORS's own failures arrive as { error: { code, message } }, but the gateway in
// front of it uses a flat { error: "..." } for some conditions - exhausted
// quota among them - so both shapes are read. Missing the flat one is not
// cosmetic: it leaves QUOTA_MESSAGE below nothing to match, which turns "out
// of quota" into "bad key" and logs a failure with no reason in it.
function providerError(body: unknown): { code?: number; message?: string } {
  if (!isRecord(body)) return {};
  if (typeof body.error === 'string') return { message: body.error };
  if (!isRecord(body.error)) return {};
  const { code, message } = body.error;
  return {
    code: typeof code === 'number' ? code : undefined,
    message: typeof message === 'string' ? message : undefined,
  };
}

// Finite numbers only: NaN and Infinity would survive a typeof check and
// then serialise to null in the response.
function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

@Injectable()
export class RoutesService {
  // Provider messages are logged server-side and deliberately not returned:
  // they can name our account or the upstream host, and the modal only needs
  // the code. The operator needs the detail, which is what this is for.
  private readonly logger = new Logger(RoutesService.name);

  constructor(private readonly config: ConfigService) {}

  async plan(dto: PlanRouteDto): Promise<RoutePlanResponse> {
    const apiKey = this.config.get<string>('ROUTING_API_KEY')?.trim();
    if (!apiKey) {
      // Optional config on purpose (unlike DATABASE_URL/JWT_SECRET): a clone
      // with no routing key boots fine and every other feature works. Only
      // this endpoint says no, and it says so as a 503 the modal can show.
      throw routingFailure(
        HttpStatus.SERVICE_UNAVAILABLE,
        ROUTE_PLAN_ERRORS.NOT_CONFIGURED,
        MESSAGES.NOT_CONFIGURED,
      );
    }

    const baseUrl = (
      this.config.get<string>('ROUTING_BASE_URL')?.trim() ||
      DEFAULT_ROUTING_BASE_URL
    ).replace(/\/+$/, '');

    // Provider order: start, then the waypoints as given, then finish. ORS
    // takes [lng, lat] - GeoJSON order, the reverse of the DTO's - and this
    // is the only place that flip happens.
    const coordinates = [dto.start, ...(dto.waypoints ?? []), dto.finish].map(
      (point) => [point.lng, point.lat],
    );

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v2/directions/${ROUTING_PROFILE}`, {
        method: 'POST',
        headers: {
          // ORS wants the raw key here, not a Bearer prefix.
          Authorization: apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ coordinates }),
        // Node 24 global fetch and AbortSignal - no HTTP client dependency
        // needed for one outbound call.
        signal: AbortSignal.timeout(ROUTING_TIMEOUT_MS),
      });
    } catch (error) {
      // DNS failure, connection refused, or our own timeout above.
      throw this.unreachable(error);
    }

    let body: unknown;
    try {
      body = await readJsonBody(response);
    } catch (error) {
      // The headers arrived but the body did not finish - a stalled stream our
      // own timeout then aborted. That is the same diagnosis as never
      // connecting at all, and saying so beats reporting it as a provider that
      // answered with something unexpected.
      throw this.unreachable(error);
    }

    if (!response.ok) throw this.mapFailure(response.status, body);
    return this.normaliseRoute(body);
  }

  private unreachable(error: unknown): HttpException {
    this.logger.warn(
      `Routing provider unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return routingFailure(
      HttpStatus.SERVICE_UNAVAILABLE,
      ROUTE_PLAN_ERRORS.UNAVAILABLE,
      MESSAGES.UNAVAILABLE,
    );
  }

  // Everything the provider can say that is not a route, turned into one of
  // the ROUTE_PLAN_ERRORS. The default is PROVIDER_ERROR rather than a
  // rethrow, so no raw provider payload or generic 500 ever reaches the
  // browser (AC2).
  private mapFailure(status: number, body: unknown): HttpException {
    const { code, message } = providerError(body);
    this.logger.warn(
      `Routing provider failed: HTTP ${status}${code === undefined ? '' : ` code ${code}`}${message === undefined ? '' : ` - ${message}`}`,
    );

    if (status === 429) {
      return routingFailure(
        HttpStatus.SERVICE_UNAVAILABLE,
        ROUTE_PLAN_ERRORS.RATE_LIMITED,
        MESSAGES.RATE_LIMITED,
      );
    }

    if (status === 401 || status === 403) {
      return QUOTA_MESSAGE.test(message ?? '')
        ? routingFailure(
            HttpStatus.SERVICE_UNAVAILABLE,
            ROUTE_PLAN_ERRORS.RATE_LIMITED,
            MESSAGES.RATE_LIMITED,
          )
        : routingFailure(
            HttpStatus.SERVICE_UNAVAILABLE,
            ROUTE_PLAN_ERRORS.NOT_CONFIGURED,
            MESSAGES.NOT_CONFIGURED,
          );
    }

    // The one provider failure that is about the request, not the provider:
    // a point nowhere near a walkable way, or no path between two of them.
    // 422 rather than 400 because the payload was well-formed and passed
    // validation - only the world disagreed.
    if (code !== undefined && UNROUTABLE_PROVIDER_CODES.has(code)) {
      return routingFailure(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ROUTE_PLAN_ERRORS.NOT_FOUND,
        MESSAGES.NOT_FOUND,
      );
    }

    if (status >= 500) {
      return routingFailure(
        HttpStatus.SERVICE_UNAVAILABLE,
        ROUTE_PLAN_ERRORS.UNAVAILABLE,
        MESSAGES.UNAVAILABLE,
      );
    }

    return routingFailure(
      HttpStatus.BAD_GATEWAY,
      ROUTE_PLAN_ERRORS.PROVIDER_ERROR,
      MESSAGES.PROVIDER_ERROR,
    );
  }

  // The provider's JSON is untrusted input like any other: this is the only
  // place its shape is assumed, and it either produces a complete
  // RoutePlanResponse or throws.
  private normaliseRoute(body: unknown): RoutePlanResponse {
    const routes = isRecord(body) ? body.routes : undefined;
    if (!Array.isArray(routes)) {
      this.logger.warn('Routing provider returned no routes array');
      throw routingFailure(
        HttpStatus.BAD_GATEWAY,
        ROUTE_PLAN_ERRORS.PROVIDER_ERROR,
        MESSAGES.UNEXPECTED,
      );
    }

    // A 200 with an empty list is the provider agreeing it found nothing,
    // which is the user's answer (NOT_FOUND), not a broken provider. ORS
    // normally 404s instead; this covers the gateway that does not.
    if (routes.length === 0) {
      throw routingFailure(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ROUTE_PLAN_ERRORS.NOT_FOUND,
        MESSAGES.NOT_FOUND,
      );
    }

    const route: unknown = routes[0];
    const geometry = isRecord(route) ? route.geometry : undefined;
    if (typeof geometry !== 'string' || geometry.length === 0) {
      this.logger.warn('Routing provider returned a route with no geometry');
      throw routingFailure(
        HttpStatus.BAD_GATEWAY,
        ROUTE_PLAN_ERRORS.PROVIDER_ERROR,
        MESSAGES.UNEXPECTED,
      );
    }

    // ORS omits zero-valued summary fields (a start-equals-finish route has
    // an empty summary), so an absent number means 0 here rather than a
    // malformed body. Distance is metres, duration seconds.
    const summary =
      isRecord(route) && isRecord(route.summary) ? route.summary : {};
    const metres = finiteNumber(summary.distance) ?? 0;
    const seconds = finiteNumber(summary.duration) ?? 0;

    return {
      polyline: geometry,
      distanceKm: Math.round((metres / 1000) * 100) / 100,
      durationSeconds: Math.round(seconds),
      profile: ROUTING_PROFILE,
      source: ROUTING_SOURCE,
    };
  }
}

'use client';

// The client for POST /api/routes/plan (RUN-53's proxy), used by the Route
// step of the Add/Edit run modal (RUN-54).
//
// WHY THIS IS NOT A STORE, unlike runs/account/profile/goal: those cache an
// entity the app reads on every screen, so they earn a module-level cache
// behind useSyncExternalStore. A planned route is a COMMAND's result - it
// exists for one open modal, is thrown away when the modal closes, and no
// other screen ever reads it. What it does follow from the app-wide pattern
// (docs/data-model.md, "The frontend API pattern") is the half that matters
// here: the call is awaited, nothing on screen changes until the server
// answered, and a failure becomes an inline role="alert" line the caller
// owns. eventParticipants.ts made the same judgement one step up (per-entity
// cache, card-level errors); this is one step further down again.
//
// The browser never talks to the routing provider: the key is server-side and
// stays there, which is the entire reason the proxy exists.
import { MAX_ROUTE_WAYPOINTS, type RouteWaypoint } from './runMath';
import { ApiError, apiFetch } from './session';

// The plan response, hand-mirrored from backend RoutePlanResponse - the same
// wart CLAUDE.md records for HelloResponse, with the same fix pending (a
// generated OpenAPI spec).
export interface RoutePlan {
  polyline: string;
  distanceKm: number;
  // The provider's WALKING estimate. Deliberately unused: it is not a run
  // time, so nothing here prefills the duration field with it.
  durationSeconds: number;
  source: string;
}

// The typed error codes the endpoint answers with (backend ROUTE_PLAN_ERRORS).
// Mirrored because the modal needs to tell "route planning is switched off on
// this server" from "these two points have no path between them": the first is
// nothing the runner can act on, the second is fixed by dragging a pin.
const ROUTE_PLAN_ERROR_CODES = [
  'ROUTING_NOT_CONFIGURED',
  'ROUTING_PROVIDER_UNAVAILABLE',
  'ROUTING_PROVIDER_RATE_LIMITED',
  'ROUTING_PROVIDER_ERROR',
  'ROUTE_NOT_FOUND',
] as const;

export type RoutePlanErrorCode = (typeof ROUTE_PLAN_ERROR_CODES)[number];

// A plan failure carrying the server's code, so the caller can decide whether
// to keep offering the map at all. Everything else about it behaves like any
// ApiError: `message` is the inline line, and it is never terminal - a failed
// plan costs the map, never the save.
export class RoutePlanError extends ApiError {
  constructor(
    message: string,
    readonly code: RoutePlanErrorCode | null,
    status: number | null,
  ) {
    super(message, status);
    this.name = 'RoutePlanError';
  }

  // True when retrying cannot help until an operator does something: no key
  // configured, or the free-tier quota is gone. The step hides the map's
  // "try again" affordances for these and says the run can still be saved by
  // hand, which is exactly what the backend's own copy tells the user.
  get providerOffline(): boolean {
    return (
      this.code === 'ROUTING_NOT_CONFIGURED' || this.code === 'ROUTING_PROVIDER_RATE_LIMITED'
    );
  }
}

const FALLBACK_MESSAGE =
  'The route could not be planned right now. You can still save the run without a map.';

function isRoutePlanErrorCode(value: unknown): value is RoutePlanErrorCode {
  return (ROUTE_PLAN_ERROR_CODES as readonly unknown[]).includes(value);
}

function isRoutePlan(value: unknown): value is RoutePlan {
  const plan = value as RoutePlan;
  return (
    typeof plan?.polyline === 'string' &&
    plan.polyline.length > 0 &&
    typeof plan.distanceKm === 'number' &&
    Number.isFinite(plan.distanceKm) &&
    typeof plan.source === 'string' &&
    plan.source.length > 0
  );
}

// The endpoint's typed body is { statusCode, code, message }; a failure that
// arrives without one (a proxy error page, a body that is not JSON) still has
// to produce a sentence, hence the fallback.
async function toPlanError(response: Response): Promise<RoutePlanError> {
  let code: RoutePlanErrorCode | null = null;
  let message: string | null = null;
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown };
    if (isRoutePlanErrorCode(body.code)) code = body.code;
    if (typeof body.message === 'string' && body.message.length > 0) {
      message = body.message;
    }
  } catch {
    // Not JSON: the status is all we have, and the fallback covers it.
  }
  return new RoutePlanError(message ?? FALLBACK_MESSAGE, code, response.status);
}

// Plans a route through the tapped points: the first is Start, the last is
// Finish, and everything between is a waypoint - the split the endpoint's
// request shape wants, made here so the picker can stay a flat ordered list
// (which is also how the route is stored, see runMath.RunRoute).
//
// Throws ApiError/RoutePlanError; every caller shows `message` inline and
// leaves the run saveable either way (AC2, AC3).
export async function planRoute(points: RouteWaypoint[]): Promise<RoutePlan> {
  if (points.length < 2) {
    throw new ApiError('A route needs at least a start and a finish.');
  }
  if (points.length > MAX_ROUTE_WAYPOINTS + 2) {
    throw new ApiError(`A route can have at most ${MAX_ROUTE_WAYPOINTS} waypoints.`);
  }

  const response = await apiFetch('/api/routes/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start: points[0],
      waypoints: points.slice(1, -1),
      finish: points[points.length - 1],
    }),
  });
  if (!response.ok) throw await toPlanError(response);

  const body: unknown = await response.json();
  if (!isRoutePlan(body)) {
    throw new ApiError('The server returned a route in an unexpected shape.');
  }
  return body;
}

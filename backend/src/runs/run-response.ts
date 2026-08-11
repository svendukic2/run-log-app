import { InternalServerErrorException } from '@nestjs/common';
import { toIsoDate } from '../common/dates';
import type { Prisma, Run as RunRow } from '../generated/prisma/client';
import {
  EFFORT_LEVELS,
  MAX_ROUTE_POINTS,
  MIN_ROUTE_POINTS,
  type Effort,
} from './dto/create-run.dto';

// The API shape of a run and the one mapper that produces it, split out of
// runs.service in RUN-63 so the public profile can serve another runner's
// runs through exactly the same contract. A second hand-written mapper is
// how the two surfaces would quietly start disagreeing about what a run
// looks like - and how the effort validation below would end up applied on
// one path only.

// Exactly the Run type from docs/data-model.md and frontend/src/lib/runs.ts.
// `date` is a yyyy-mm-dd string, never a Date or timestamp, and nothing
// derived (pace, totals) is ever part of it. userId is deliberately NOT in
// the response: the owner is implicit in the token on /api/runs, and on a
// public profile it is the profile's own id.
// One tapped point, the same {lat, lng} order the routing endpoint takes and
// Leaflet hands the picker (RUN-53's DTO comment explains why that order and
// not the provider's).
export interface RouteWaypointResponse {
  lat: number;
  lng: number;
}

// A run's route, served as ONE nullable object rather than three loose columns
// (RUN-54). The columns stay separate in the database - that is what the
// ticket asks for and what lets routeSource be filtered later - but the API
// shape makes the invariant impossible to violate: `route === null` is the
// whole of "no route", and no caller can construct a polyline with no
// waypoints.
export interface RunRouteResponse {
  // Encoded polyline, precision 5 (RUN-53: the decoder must be told 5).
  polyline: string;
  // The runner's tapped points: [0] is Start, the last is Finish, the rest are
  // the numbered waypoints, 2-5 in total.
  waypoints: RouteWaypointResponse[];
  // Who drew it, which is also what says "reconstruction, not GPS truth".
  source: string;
}

export interface RunResponse {
  id: string;
  routeName: string;
  distanceKm: number;
  durationSeconds: number;
  date: string;
  effort: Effort;
  note: string;
  // null means EITHER "this run has no route" OR "this route is not yours to
  // see" - see withRoute on the mapper below. The two are deliberately
  // indistinguishable to a viewer: a "there is a route here you may not see"
  // signal is itself information the owner did not share.
  route: RunRouteResponse | null;
}

// The column is plain TEXT until RUN-73 adds a real enum, so a row edited
// outside the API (psql, a seed script) can hold anything. A loud 500 that
// names the row beats a silently wrong Effort type reaching the frontend's
// exhaustive switches.
function toEffort(rowId: string, value: string): Effort {
  if (!(EFFORT_LEVELS as readonly string[]).includes(value)) {
    throw new InternalServerErrorException(
      `Run ${rowId} has stored effort "${value}", not one of: ${EFFORT_LEVELS.join(', ')}. Fix the row (RUN-73 adds the enum that prevents this).`,
    );
  }
  return value as Effort;
}

// routeWaypoints is a JSONB column, so its contents are untrusted the same way
// a provider body is: this is the only place their shape is assumed.
// Latitude/longitude ranges are re-checked here rather than trusted from the
// write path, because a stored point outside them would put a Leaflet marker
// nowhere and the picker has no way to report that.
function isRouteWaypoint(value: unknown): value is RouteWaypointResponse {
  if (typeof value !== 'object' || value === null) return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

// The stored JSON as a point list, or null if it is not one. Rebuilt entry by
// entry rather than cast, so extra keys a hand-edited row might carry cannot
// leak into the response.
function toRouteWaypoints(
  value: Prisma.JsonValue | null,
): RouteWaypointResponse[] | null {
  if (!Array.isArray(value)) return null;
  const points: RouteWaypointResponse[] = [];
  for (const entry of value) {
    if (!isRouteWaypoint(entry)) return null;
    points.push({ lat: entry.lat, lng: entry.lng });
  }
  if (points.length < MIN_ROUTE_POINTS || points.length > MAX_ROUTE_POINTS) {
    return null;
  }
  return points;
}

// The route columns as one nullable object. All three NULL is the ordinary
// no-route run (RUN-54 AC3). Anything else must be complete: a loud 500 that
// names the row, like toEffort above, rather than a route the picker silently
// cannot restore or a line with no provenance. The database CHECK added with
// these columns makes the all-or-none half of this unreachable through SQL
// too, so what is really left here is "the JSON is not a list of points".
function toRoute(row: RunRow): RunRouteResponse | null {
  const { routePolyline, routeWaypoints, routeSource } = row;
  if (
    routePolyline === null &&
    routeWaypoints === null &&
    routeSource === null
  ) {
    return null;
  }
  const waypoints = toRouteWaypoints(routeWaypoints);
  if (routePolyline === null || routeSource === null || waypoints === null) {
    throw new InternalServerErrorException(
      `Run ${row.id} has an unreadable route: routePolyline, routeWaypoints (${MIN_ROUTE_POINTS}-${MAX_ROUTE_POINTS} {lat, lng} points) and routeSource must all be present or all be NULL. Fix the row.`,
    );
  }
  return { polyline: routePolyline, waypoints, source: routeSource };
}

// `withRoute` is REQUIRED, with no default, and that is the point: routes are
// private by default (User.showRoutes, RUN-64) and this mapper serves both the
// owner's own runs and another runner's public profile. A default would let a
// future third caller ship a route leak by simply not thinking about it; an
// unavoidable parameter makes every call site answer the question. The public
// profile answers it with canViewRoutes (common/privacy.ts).
export function toRunResponse(
  row: RunRow,
  { withRoute }: { withRoute: boolean },
): RunResponse {
  return {
    id: row.id,
    routeName: row.routeName,
    distanceKm: row.distanceKm,
    durationSeconds: row.durationSeconds,
    date: toIsoDate(row.date),
    effort: toEffort(row.id, row.effort),
    note: row.note,
    route: withRoute ? toRoute(row) : null,
  };
}

// The order every screen shows runs in, newest first. Same-day runs have no
// insertion timestamp in the contract (docs/data-model.md), so the id is the
// tiebreak: arbitrary but deterministic across requests. Shared with the
// public profile read so both lists arrive in the same order, and mirrored
// on the client by compareRunsNewestFirst in frontend/src/lib/runs.ts.
export const runsNewestFirstOrder = [{ date: 'desc' }, { id: 'desc' }] as const;

import { InternalServerErrorException } from '@nestjs/common';
import { toIsoDate } from '../common/dates';
import { kmNumber } from '../common/decimal';
import type { RouteVisibility } from '../common/privacy';
import type { Prisma, Run as RunRow } from '../generated/prisma/client';
import {
  MAX_ROUTE_POINTS,
  MIN_ROUTE_POINTS,
  type Effort,
} from './dto/create-run.dto';
import { trimPolylineEnds } from './route-trim';

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
  // Encoded polyline, precision 5 (RUN-53: the decoder must be told 5). On a
  // trimmed route this is the middle of the stored one, re-encoded.
  polyline: string;
  // The runner's tapped points: [0] is Start, the last is Finish, the rest are
  // the numbered waypoints, 2-5 in total.
  //
  // EMPTY on a trimmed route, and that is not an omission: the first and last
  // tapped points are exactly the addresses the trim exists to hide, so sending
  // them would undo it in one line. Nothing needs them there either - only the
  // owner's Edit picker restores markers from waypoints, and the owner is never
  // served a trimmed route.
  waypoints: RouteWaypointResponse[];
  // Who drew it, which is also what says "reconstruction, not GPS truth".
  source: string;
  // Whether the ends were cut off before sending (RUN-55 AC4). The client is
  // told rather than left to infer, because a trimmed line's first and last
  // points are NOT the run's start and finish and must not be drawn as if they
  // were - a "Start" pin 400 m up the road is a worse lie than no pin.
  trimmed: boolean;
}

export interface RunResponse {
  id: string;
  routeName: string;
  distanceKm: number;
  durationSeconds: number;
  date: string;
  effort: Effort;
  note: string;
  // When the run was logged, an ISO instant (not a calendar day like `date`,
  // which is when it was RUN). Part of the contract since RUN-78 because it
  // is the same-day tiebreak: the client re-sorts its cache after every
  // mutation, so it has to be able to sort by what the server sorted by.
  // Read-only - it is never part of a write, and the API ignores one that is
  // sent.
  createdAt: string;
  // null means EITHER "this run has no route" OR "this route is not yours to
  // see" - see routeVisibility on the mapper below. The two are deliberately
  // indistinguishable to a viewer: a "there is a route here you may not see"
  // signal is itself information the owner did not share.
  route: RunRouteResponse | null;
}

// There was a toEffort guard here until RUN-78, throwing a 500 on a stored
// value outside the vocabulary. The column is a database enum now, so a row
// holding 'banana' is unreachable through any path - psql included - and the
// guard was checking something the database will not let happen. Its type is
// the generated $Enums.Effort, the same three capitalized values as the DTO's
// union, so the mapper below assigns it straight across.

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
function toRoute(
  row: RunRow,
  visibility: RouteVisibility,
): RunRouteResponse | null {
  // Nothing is read at all in the hidden case: the route is not fetched and
  // then dropped, which is what keeps a later `...row` spread from leaking it.
  if (visibility === 'hidden') return null;

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
  if (visibility === 'full') {
    return {
      polyline: routePolyline,
      waypoints,
      source: routeSource,
      trimmed: false,
    };
  }

  // A stranger's copy: ends cut off, tapped points dropped (RUN-55 AC4). null
  // back from the trim means there was no honest middle left, and a route too
  // short to trim is not served at all - see route-trim.ts.
  const middle = trimPolylineEnds(routePolyline);
  if (middle === null) return null;
  return {
    polyline: middle,
    waypoints: [],
    source: routeSource,
    trimmed: true,
  };
}

// `routeVisibility` is REQUIRED, with no default, and that is the point: routes
// are private by default (User.showRoutes, RUN-64) and this mapper serves both
// the owner's own runs and another runner's public profile. A default would let
// a future third caller ship a route leak by simply not thinking about it; an
// unavoidable parameter makes every call site answer the question. It is also
// why the parameter is three-valued rather than a boolean since RUN-55 - a
// granted route is not necessarily the WHOLE route. The public profile answers
// it with routeVisibility() from common/privacy.ts.
export function toRunResponse(
  row: RunRow,
  { routeVisibility }: { routeVisibility: RouteVisibility },
): RunResponse {
  return {
    id: row.id,
    routeName: row.routeName,
    // The Decimal boundary (RUN-78): NUMERIC(5, 2) arrives as a decimal.js
    // object and leaves here as the plain JSON number the contract promises.
    distanceKm: kmNumber(row.distanceKm),
    durationSeconds: row.durationSeconds,
    date: toIsoDate(row.date),
    effort: row.effort,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    route: toRoute(row, routeVisibility),
  };
}

// The order every screen shows runs in, newest first: the calendar day, then
// the moment the row was written, then the id. createdAt joined it in RUN-78
// and is the reason same-day runs now come back in insertion order rather
// than cuid order; the id stays as the last resort for rows that predate that
// migration and therefore share its timestamp.
//
// Shared with the public profile read so both lists arrive in the same order,
// and mirrored on the client by compareRunsNewestFirst in
// frontend/src/lib/runs.ts. Those two MUST change together - a divergence
// makes a freshly added same-day run jump position on the next full load.
export const runsNewestFirstOrder = [
  { date: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
] as const;

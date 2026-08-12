'use client';

// Step 2 of the Add/Edit run modal: the optional route (RUN-54, Figma node
// 214:847). The map itself is RouteMapPicker; this owns everything around it -
// planning, the undo/clear controls, the status line, the amber mismatch hint
// and the plan-failure line.
//
// Two rules run through the whole file, both from the ticket:
//   1. The route is OPTIONAL. Nothing here can block a save. A provider that
//      is down, a point in the sea, a 20% distance mismatch: all of them are
//      lines of text, and "Save run" stays live through every one of them.
//   2. The ENTERED distance is the source of truth. The routed distance is
//      never written into the form, only compared against it.
import dynamic from 'next/dynamic';
import { useMemo, useRef, useState } from 'react';
import { decodePolyline, polylineDistanceKm } from '@/lib/polyline';
import { planRoute, RoutePlanError, type RoutePlan } from '@/lib/routePlan';
import {
  MAX_ROUTE_POINTS,
  MAX_ROUTE_WAYPOINTS,
  MIN_ROUTE_POINTS,
  roundKm,
  routeMismatchHint,
  sameWaypoints,
  type RouteWaypoint,
  type RunRoute,
} from '@/lib/runMath';
import { mutationErrorMessage } from '@/lib/session';

// ssr: false is not a preference: Leaflet reads `window` at module scope, so a
// server render of RouteMapPicker fails the production build outright
// ("window is not defined"). The loading box holds the map's exact height so
// the modal does not jump when it arrives.
const RouteMapPicker = dynamic(() => import('./RouteMapPicker'), {
  ssr: false,
  loading: () => (
    <div
      className="h-[260px] w-full animate-pulse rounded-[14px] border border-line-strong bg-muted sm:h-[300px]"
      aria-hidden="true"
    />
  ),
});

export interface RouteStepProps {
  // The tapped points, owned by the modal so they survive a trip back to
  // step 1: [0] Start, last Finish, up to MAX_ROUTE_WAYPOINTS between.
  points: RouteWaypoint[];
  onPointsChange: (points: RouteWaypoint[]) => void;
  // What will actually be saved. null whenever there is no usable polyline -
  // including "the points are placed but the provider said no", because
  // waypoints without a line are not a route (see docs/data-model.md).
  route: RunRoute | null;
  onRouteChange: (route: RunRoute | null) => void;
  // From the Distance field of step 1, for the mismatch hint. null if it is
  // not a usable number (unreachable in practice: step 1 validates before
  // this step opens).
  enteredDistanceKm: number | null;
  // Whether a plan is in flight, and the last failure - BOTH owned by the
  // modal, not by this component. Two reasons, and each one is a bug on its
  // own: "Back" unmounts this step, so local state would forget a failure the
  // user has not read yet; and the modal's Save button has to know a plan is
  // running, or it stores route: null and throws away the answer landing a
  // moment later.
  planning: boolean;
  onPlanningChange: (planning: boolean) => void;
  planError: RoutePlanFailure | null;
  onPlanErrorChange: (error: RoutePlanFailure | null) => void;
}

export interface RoutePlanFailure {
  message: string;
  // True when no retry can help until an operator acts (no key, quota gone):
  // the step then does not offer one, because it would be a lie.
  offline: boolean;
}

function statusLine(points: RouteWaypoint[]): string {
  if (points.length === 0) return 'No points placed yet.';
  if (points.length === 1) return 'Start placed. Click again to place Finish.';
  const waypoints = points.length - 2;
  const placed =
    waypoints === 0
      ? 'Start and Finish placed'
      : `Start, ${waypoints} ${waypoints === 1 ? 'waypoint' : 'waypoints'} and Finish placed`;
  return points.length >= MAX_ROUTE_POINTS
    ? `${placed}. That is the maximum of ${MAX_ROUTE_WAYPOINTS} waypoints - remove one to change the route.`
    : `${placed}.`;
}

export default function RouteStep({
  points,
  onPointsChange,
  route,
  onRouteChange,
  enteredDistanceKm,
  planning,
  onPlanningChange,
  planError,
  onPlanErrorChange,
}: RouteStepProps) {
  // The provider's own distance for the mismatch hint. Local on purpose,
  // unlike the two above: losing it on a trip back to step 1 costs nothing,
  // because the hint falls back to measuring the stored polyline.
  const [plan, setPlan] = useState<RoutePlan | null>(null);

  // Only the newest request may publish: dropping a pin three times fast fires
  // three plans, and the first to come back is not necessarily the right one.
  const requestRef = useRef(0);

  // Asks the provider for a line through these points. Every caller has just
  // changed something, so the first thing it does is invalidate whatever is
  // already in flight.
  function requestPlan(next: RouteWaypoint[]): void {
    requestRef.current += 1;
    const request = requestRef.current;
    onPlanningChange(true);
    onPlanErrorChange(null);

    void planRoute(next)
      .then((result) => {
        if (requestRef.current !== request) return;
        onPlanningChange(false);
        setPlan(result);
        // The waypoints stored with the polyline are the ones it was planned
        // from, never the map's current state: those two can only differ if a
        // newer request is in flight, and that request owns the next write.
        onRouteChange({
          polyline: result.polyline,
          waypoints: next,
          source: result.source,
        });
      })
      .catch((error: unknown) => {
        if (requestRef.current !== request) return;
        onPlanningChange(false);
        setPlan(null);
        onPlanErrorChange({
          message: mutationErrorMessage(error),
          offline: error instanceof RoutePlanError && error.providerOffline,
        });
        // No line means nothing to save: the markers stay on screen so the
        // user can move them and try again, but the run saves without a route
        // rather than with half of one (AC3 covers what that looks like).
        onRouteChange(null);
      });
  }

  // Every point change arrives here, from the map or from the undo/clear
  // buttons, and planning hangs off THAT rather than off an effect watching
  // `points`. Deliberate: placing a point is an event, not a state React needs
  // synchronising with an external system, and an effect version has to defend
  // itself against its own writes - a failed plan clears the route, the
  // cleared route looks like "not planned yet", and it re-fires forever.
  function changePoints(next: RouteWaypoint[]): void {
    onPointsChange(next);
    // Ahead of every branch below, including the two that return early: a plan
    // already in flight was asked about a DIFFERENT set of points, so its
    // answer must never land. Bumping only on the branch that starts a new
    // request would let an undo be overwritten by the route it undid.
    requestRef.current += 1;

    if (next.length < MIN_ROUTE_POINTS) {
      // One point is not a route. Anything planned before is void, and saying
      // so beats leaving a line on screen that no longer has both its ends.
      setPlan(null);
      onPlanningChange(false);
      onPlanErrorChange(null);
      onRouteChange(null);
      return;
    }
    // A route Edit restored is already planned for exactly these points, so
    // reopening the step costs no provider request (AC5). Undoing back onto a
    // planned pair lands here too, which is why planning is cleared: the
    // request that was in flight has just been invalidated above.
    if (route && sameWaypoints(route.waypoints, next)) {
      onPlanningChange(false);
      onPlanErrorChange(null);
      return;
    }

    requestPlan(next);
  }

  // The routed distance for the hint: the provider's own number when this
  // session planned the route, measured off the polyline when Edit restored
  // one (the plan's distance is not stored - see polylineDistanceKm).
  const routedKm = useMemo(() => {
    if (plan) return plan.distanceKm;
    if (!route) return null;
    const line = decodePolyline(route.polyline);
    return line.length > 1 ? roundKm(polylineDistanceKm(line)) : null;
  }, [plan, route]);

  const mismatch =
    routedKm !== null && enteredDistanceKm !== null
      ? routeMismatchHint(routedKm, enteredDistanceKm)
      : null;

  const undo = () => changePoints(points.slice(0, -1));
  const clear = () => changePoints([]);

  // Enough points for a route, but no line to show for them: a plan failed, or
  // the user walked back to step 1 and returned after one did. Either way the
  // step has to SAY so - the markers alone look like a saved route and are not
  // one - and offer the retry that a point change would otherwise be the only
  // way to trigger.
  const routeUnplanned = points.length >= MIN_ROUTE_POINTS && route === null && !planning;

  return (
    <div className="flex flex-col gap-[14px]">
      {/* flex-wrap: the undo/clear pair is shrink-0, so at 320px inside the
          modal it leaves the heading about 7px of slack - inside the margin of
          error of any font that is not the one measured. Wrapping costs
          nothing at any width where the row already fits (RUN-75, AC1). */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[15px] font-semibold text-text-primary">Route (optional)</p>
        {/* Not in the Figma frame, which shows the map alone: AC6 asks for
            undo and clear, and two text buttons are the smallest thing that
            provides them without competing with Save. Hidden entirely rather
            than disabled while empty - there is nothing to undo and a greyed
            pair would just be noise. */}
        {points.length > 0 && (
          <div className="flex shrink-0 items-center gap-3 text-[13px] font-semibold">
            <button
              type="button"
              onClick={undo}
              className="text-secondary hover:text-ink hover:underline"
            >
              Undo last point
            </button>
            <button
              type="button"
              onClick={clear}
              className="text-secondary hover:text-ink hover:underline"
            >
              Clear route
            </button>
          </div>
        )}
      </div>

      <RouteMapPicker
        points={points}
        polyline={route?.polyline ?? null}
        onPlace={(point) => changePoints([...points, point])}
        onMove={(index, point) =>
          changePoints(points.map((current, at) => (at === index ? point : current)))
        }
        onRemove={(index) => changePoints(points.filter((_current, at) => at !== index))}
      />

      <p className="text-[13px] leading-[1.5] text-secondary">
        Click the map to drop Start, up to {MAX_ROUTE_WAYPOINTS} waypoints and Finish. The route
        snaps to real streets and paths.
      </p>

      {/* One polite live region for the map's state, because every change the
          map reports is visual: a marker appeared, a line snapped, a plan is
          in flight. Polite and not assertive - none of it interrupts. */}
      <p role="status" className="text-[13px] leading-[1.5] text-secondary">
        {planning ? 'Planning the route…' : statusLine(points)}
        {!planning && routedKm !== null && ` Routed distance ${routedKm.toFixed(1)} km.`}
        {routeUnplanned && ' No route is drawn, so this run will be saved without one.'}
      </p>

      {routeUnplanned && !planError?.offline && (
        <div>
          <button
            type="button"
            onClick={() => requestPlan(points)}
            className="text-[13px] font-semibold text-accent hover:underline"
          >
            Plan the route again
          </button>
        </div>
      )}

      {mismatch && (
        // Amber, not red, and never a blocker (AC2): the run is saved with the
        // distance the runner entered either way.
        <p className="rounded-[12px] bg-warning-soft px-[14px] py-[11px] text-[13px] leading-[1.5] text-warning-text">
          {mismatch}
        </p>
      )}

      {planError && (
        <p role="alert" className="text-[13px] leading-[1.5] text-accent-pressed">
          {planError.message}
          {planError.offline ? '' : ' Try again, move a point, or save the run without a map.'}
        </p>
      )}
    </div>
  );
}

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RunModal from './RunModal';
import { getRuns, type Run, type RunRoute } from '@/lib/runs';
import {
  fireMapClick,
  fireMarkerClick,
  fireMarkerDragEnd,
  leafletState,
} from '@/test/leafletMock';
import {
  failRoutePlan,
  holdRoutePlan,
  restoreRoutePlan,
  routePlanRequestsMade,
  seedRoutePlan,
  seedRuns,
} from '@/test/runsApiMock';

// The Route step (RUN-54), driven through the modal that owns it: the two are
// one flow (validate, advance, place, save) and testing the step alone would
// prove nothing about where the route ends up. Leaflet itself is the stub in
// src/test/leafletMock.ts, so "clicking the map" is fireMapClick.

const POLYLINE = 'wap_IsyspAsFgc@cG{h@qFe{A';
const START = { lat: 52.516275, lng: 13.377704 };
const MIDDLE = { lat: 52.518611, lng: 13.388889 };
const FINISH = { lat: 52.520008, lng: 13.404954 };

function storedRoute(): RunRoute {
  return { polyline: POLYLINE, waypoints: [START, FINISH], source: 'openrouteservice' };
}

async function openRouteStep(run?: Run) {
  const user = userEvent.setup();
  const onClose = jest.fn();
  render(<RunModal run={run} onClose={onClose} />);
  if (!run) {
    await user.type(screen.getByLabelText('Route name'), 'Evening tempo');
    await user.type(screen.getByLabelText('Distance (km)'), '8.2');
    await user.type(screen.getByLabelText('Duration'), '42:15');
  }
  await user.click(screen.getByRole('button', { name: /^next$/i }));
  // The picker is a dynamic import (ssr: false is mandatory for Leaflet), so
  // it arrives a tick after the step does.
  await screen.findByTestId('route-map');
  return { user, onClose };
}

// A click on the map, wrapped because it drives React state from outside React.
async function placePoint(point: { lat: number; lng: number }) {
  await act(async () => {
    fireMapClick(point.lat, point.lng);
  });
}

const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /^save (run|changes)$/i }));

describe('Route step (RUN-54)', () => {
  it('opens only on a valid form, and plans the route from the placed points (AC1)', async () => {
    const user = userEvent.setup();
    render(<RunModal onClose={jest.fn()} />);

    // AC1 is conditional on a valid form: an empty one stays on step 1.
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText('Route name is required')).toBeInTheDocument();
    expect(screen.queryByTestId('route-map')).toBeNull();

    await user.type(screen.getByLabelText('Route name'), 'Evening tempo');
    await user.type(screen.getByLabelText('Distance (km)'), '8.2');
    await user.type(screen.getByLabelText('Duration'), '42:15');
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await screen.findByTestId('route-map');
    expect(screen.getByText(/Step 2 of 2/i)).toBeInTheDocument();

    // One point is not a route: nothing is planned yet.
    await placePoint(START);
    expect(routePlanRequestsMade()).toEqual([]);

    await placePoint(MIDDLE);
    await placePoint(FINISH);

    // The endpoint takes the ends as start/finish and only the middle as
    // waypoints; the picker keeps one flat list, so the split happens on the
    // way out. Two requests: one per point placed after the second.
    await waitFor(() =>
      expect(routePlanRequestsMade()).toEqual([
        [START, MIDDLE],
        [START, MIDDLE, FINISH],
      ]),
    );

    // The snapped line is drawn dashed - a reconstruction, not a GPS trace -
    // and every placed point has a marker.
    await waitFor(() => expect(leafletState().polylines).toHaveLength(1));
    expect(leafletState().polylines[0].options).toMatchObject({ dashArray: '8 8' });
    expect(leafletState().markers).toHaveLength(3);
    // OSM's licence requires the attribution to be on the map.
    expect(leafletState().tileLayers[0].options.attribution).toContain('OpenStreetMap');
  });

  it('warns about a distance mismatch over 20% without blocking the save (AC2)', async () => {
    // 5.1 routed against 8.2 entered: a 38% gap.
    seedRoutePlan({ distanceKm: 5.1 });
    const { user, onClose } = await openRouteStep();

    await placePoint(START);
    await placePoint(FINISH);

    expect(
      await screen.findByText(
        'Routed distance is 5.1 km, but you logged 8.2 km. Add a waypoint where you turned.',
      ),
    ).toBeInTheDocument();

    // A hint, never a gate: the run saves with the distance the runner entered.
    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(getRuns()[0].distanceKm).toBe(8.2);
  });

  it('says nothing when the two distances agree closely enough (AC2)', async () => {
    seedRoutePlan({ distanceKm: 8.0 });
    await openRouteStep();

    await placePoint(START);
    await placePoint(FINISH);

    await waitFor(() => expect(leafletState().polylines).toHaveLength(1));
    expect(screen.queryByText(/Routed distance is/)).toBeNull();
  });

  it('stores the polyline, the tapped points and the server-stamped source (AC4)', async () => {
    const { user, onClose } = await openRouteStep();

    await placePoint(START);
    await placePoint(FINISH);
    await waitFor(() => expect(leafletState().polylines).toHaveLength(1));
    await save(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(getRuns()[0].route).toEqual({
      polyline: POLYLINE,
      waypoints: [START, FINISH],
      // Never sent by the client: the server knows who drew the line.
      source: 'openrouteservice',
    });
  });

  it('saves with no route exactly as before when the map is untouched (AC3)', async () => {
    const { user, onClose } = await openRouteStep();

    await save(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(getRuns()[0].route).toBeNull();
    // Reaching the step must not cost a provider request either.
    expect(routePlanRequestsMade()).toEqual([]);
  });

  it('restores a stored route on Edit, then moves and removes its points (AC5)', async () => {
    const [run] = seedRuns([
      {
        routeName: 'Morning loop',
        distanceKm: 8.2,
        durationSeconds: 2535,
        date: '2026-07-07',
        effort: 'Medium',
        note: '',
        route: storedRoute(),
      },
    ]);
    const { user, onClose } = await openRouteStep(run);

    // The stored polyline and its two points are on the map, and NOTHING was
    // re-planned: the line already belongs to exactly these points.
    expect(leafletState().markers).toHaveLength(2);
    expect(leafletState().polylines).toHaveLength(1);
    expect(routePlanRequestsMade()).toEqual([]);

    // Moving a marker re-plans from where it landed.
    await act(async () => {
      fireMarkerDragEnd(1, 52.53, 13.41);
    });
    await waitFor(() =>
      expect(routePlanRequestsMade()).toEqual([[START, { lat: 52.53, lng: 13.41 }]]),
    );

    // Removing one leaves a single point, which is not a route: the line goes
    // and the saved run keeps no half-route behind.
    await act(async () => {
      fireMarkerClick(1);
    });
    await waitFor(() => expect(leafletState().markers).toHaveLength(1));
    expect(leafletState().polylines).toHaveLength(0);

    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(getRuns()[0].route).toBeNull();
  });

  it('undoes the last point and clears the whole route before saving (AC6)', async () => {
    const { user } = await openRouteStep();

    await placePoint(START);
    await placePoint(MIDDLE);
    await placePoint(FINISH);
    await waitFor(() => expect(leafletState().markers).toHaveLength(3));

    await user.click(screen.getByRole('button', { name: /undo last point/i }));
    await waitFor(() => expect(leafletState().markers).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: /clear route/i }));
    await waitFor(() => expect(leafletState().markers).toHaveLength(0));
    // Nothing left to undo, so the controls go away rather than sit greyed out.
    expect(screen.queryByRole('button', { name: /clear route/i })).toBeNull();
  });

  it('refuses to save while a plan is in flight, then saves the route it waited for', async () => {
    const release = holdRoutePlan();
    const { user, onClose } = await openRouteStep();

    await placePoint(START);
    await placePoint(FINISH);

    // Saving now would store route: null and throw away the line landing a
    // moment later - a route the user watched being drawn and never got.
    const saveButton = screen.getByRole('button', { name: /^save run$/i });
    await waitFor(() => expect(saveButton).toBeDisabled());
    await user.click(saveButton);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      release();
    });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await save(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(getRuns()[0].route).toMatchObject({ waypoints: [START, FINISH] });
  });

  it('ignores a plan that lands after the points it was asked about changed', async () => {
    const { user, onClose } = await openRouteStep();

    await placePoint(START);
    await placePoint(FINISH);
    await waitFor(() => expect(leafletState().polylines).toHaveLength(1));

    // A third point starts a plan that never gets to finish first: the user
    // undoes it while the request is still open.
    const release = holdRoutePlan();
    await placePoint(MIDDLE);
    await user.click(screen.getByRole('button', { name: /undo last point/i }));
    await act(async () => {
      release();
    });

    // The late answer describes a route with three points that are no longer
    // on the map; publishing it would save a run whose route the user undid.
    await waitFor(() => expect(leafletState().markers).toHaveLength(2));
    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(getRuns()[0].route?.waypoints).toEqual([START, FINISH]);
  });

  it('keeps the failure and a retry across a trip back to the details step', async () => {
    failRoutePlan();
    const { user } = await openRouteStep();

    await placePoint(START);
    await placePoint(FINISH);
    await screen.findByRole('alert');

    // "Back" unmounts the step; the failure must not be forgotten with it, or
    // the markers come back looking like a route that will be saved.
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await screen.findByTestId('route-map');
    expect(screen.getByRole('alert')).toHaveTextContent('routing provider could not be reached');
    expect(
      screen.getByText(/No route is drawn, so this run will be saved without one/),
    ).toBeInTheDocument();

    // And the retry does not need a point moved to reach it.
    restoreRoutePlan();
    await user.click(screen.getByRole('button', { name: /plan the route again/i }));
    await waitFor(() => expect(leafletState().polylines).toHaveLength(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the run saveable when the provider fails, and says so inline (AC2, AC3)', async () => {
    failRoutePlan('ROUTING_NOT_CONFIGURED', 503, 'Route planning is not configured.');
    const { user, onClose } = await openRouteStep();

    await placePoint(START);
    await placePoint(FINISH);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Route planning is not configured.');
    // NOT_CONFIGURED is nothing a retry can fix, so the step does not promise
    // one - it would be a lie until an operator sets a key.
    expect(alert).not.toHaveTextContent('Move a point');
    // The markers stay, but with no line there is no route to store, and the
    // run itself saves as if the map had never been opened.
    expect(leafletState().markers).toHaveLength(2);
    expect(leafletState().polylines).toHaveLength(0);

    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(getRuns()[0].route).toBeNull();
    expect(getRuns()[0].distanceKm).toBe(8.2);
  });
});

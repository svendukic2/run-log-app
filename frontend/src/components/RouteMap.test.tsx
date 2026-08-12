import { render, screen } from '@testing-library/react';
import { decodePolyline } from '@/lib/polyline';
import { type Run, type RunRoute } from '@/lib/runs';
import { leafletState } from '@/test/leafletMock';
import { seedRuns } from '@/test/runsApiMock';
import { seedPublicProfile, TRIMMED_POLYLINE } from '@/test/usersApiMock';
import PublicRunDetailView from './PublicRunDetailView';
import RunDetailView from './RunDetailView';

// The route map (RUN-55), driven through the two screens that own it rather
// than in isolation: the interesting behaviour is a CHOICE - map or sketch,
// full or trimmed, card or no card - and every one of those choices is made by
// the screen from what the API sent it. Rendering RouteMap directly would test
// the half nobody gets wrong.
//
// Leaflet itself is the stub in src/test/leafletMock.ts, so the assertions read
// what the component drew (leafletState) instead of a DOM of tiles and
// transforms.

// RunDetailView reads the router for the after-delete navigation, which no test
// here triggers; jsdom has no app router to read.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const POLYLINE = 'wap_IsyspAsFgc@cG{h@qFe{A';
const START = { lat: 52.516275, lng: 13.377704 };
const FINISH = { lat: 52.520008, lng: 13.404954 };

function route(overrides: Partial<RunRoute> = {}): RunRoute {
  return {
    polyline: POLYLINE,
    waypoints: [START, FINISH],
    source: 'openrouteservice',
    trimmed: false,
    ...overrides,
  };
}

const PUBLIC_RUN: Run = {
  id: 'run-1',
  routeName: 'Riverside loop',
  distanceKm: 8.2,
  durationSeconds: 2535,
  date: '2026-08-01',
  effort: 'Medium',
  note: '',
  route: route(),
};

function seedOwnRun(overrides: Partial<Omit<Run, 'id'>> = {}): Run {
  const [run] = seedRuns([
    {
      routeName: 'Morning loop',
      distanceKm: 8.2,
      durationSeconds: 2535,
      date: '2026-07-07',
      effort: 'Medium',
      note: '',
      ...overrides,
    },
  ]);
  return run;
}

// The line as the stub received it, [lat, lng] pairs in drawing order.
const drawnLine = () => leafletState().polylines[0];

describe('Route map on run detail (RUN-55)', () => {
  it('draws the stored route dashed over OSM tiles instead of the sketch (AC1, AC3)', async () => {
    const run = seedOwnRun({ route: route() });

    render(<RunDetailView runId={run.id} />);
    // The map is a dynamic import (ssr: false is mandatory for Leaflet), so it
    // arrives a tick after the card.
    await screen.findByTestId('route-map-display');

    // AC3: the owner's own run draws the WHOLE stored polyline, every point of
    // it, not a shortened copy.
    expect(drawnLine().latlngs).toEqual(
      decodePolyline(POLYLINE).map((point) => [point.lat, point.lng]),
    );
    expect(drawnLine().options).toMatchObject({ dashArray: '8 8' });
    expect(leafletState().tileLayers[0].url).toContain('tile.openstreetmap.org');
    // The attribution is a licence requirement, not decoration.
    expect(leafletState().tileLayers[0].options.attribution).toContain('OpenStreetMap');
    // Framed to the line, and told apart from the sketch it replaced.
    expect(leafletState().fitBoundsCalls).toBe(1);
    // Bottom right, not Leaflet's default top-left corner, which is where the
    // legend sits: the default put the opaque "Routed estimate" pill straight
    // over the + button (review finding).
    expect(leafletState().zoomControls).toEqual([{ position: 'bottomright' }]);
    expect(screen.queryByTestId('route-sketch')).toBeNull();
    expect(screen.getByText('Routed estimate')).toBeInTheDocument();

    // Start and Finish, at the ends of the line (AC1). The labels live in the
    // marker icons, which is where Leaflet puts them on a real map too.
    const icons = leafletState().markers.map((marker) => marker.options.icon);
    expect(JSON.stringify(icons)).toContain('Start');
    expect(JSON.stringify(icons)).toContain('Finish');
    expect(leafletState().markers.map((marker) => marker.latlng)).toEqual([
      drawnLine().latlngs[0],
      drawnLine().latlngs[drawnLine().latlngs.length - 1],
    ].map(([lat, lng]) => ({ lat, lng })));
  });

  it('keeps the v1 sketch for a run with no route, and loads no map at all (AC2, AC5)', () => {
    const run = seedOwnRun();

    render(<RunDetailView runId={run.id} />);

    expect(screen.getByTestId('route-sketch')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Route' })).toBeInTheDocument();
    // AC5: no map means no tile request and no Leaflet at all. The dynamic
    // import is what makes this true, so asserting it is what stops a future
    // static import from quietly undoing it.
    expect(leafletState().tileLayers).toEqual([]);
    expect(leafletState().polylines).toEqual([]);
    expect(screen.queryByTestId('route-map-display')).toBeNull();
  });

  it('renders no map for a visitor when showRoutes is off, stats intact (AC4)', () => {
    const profile = seedPublicProfile({
      firstName: 'Ana',
      profilePublic: true,
      showRoutes: false,
      runs: [PUBLIC_RUN],
    });

    render(<PublicRunDetailView userId={profile.id} runId="run-1" />);

    expect(screen.queryByTestId('route-map-display')).toBeNull();
    expect(leafletState().tileLayers).toEqual([]);
    // No Route card at all (RUN-63's shape, kept), and the stats beside it are
    // untouched: privacy costs the map, not the page.
    expect(screen.queryByRole('heading', { name: 'Route' })).toBeNull();
    expect(screen.getByText('8.2 km')).toBeInTheDocument();
    expect(screen.getByText('42:15')).toBeInTheDocument();
  });

  it('draws a granted visitor the trimmed line, with no end pins (AC4)', async () => {
    const profile = seedPublicProfile({
      firstName: 'Ana',
      profilePublic: true,
      showRoutes: true,
      runs: [PUBLIC_RUN],
    });

    render(<PublicRunDetailView userId={profile.id} runId="run-1" />);
    await screen.findByTestId('route-map-display');

    // The trimmed polyline the server sent, NOT the stored one. The trim is the
    // server's (backend route-trim.spec.ts covers the geometry); what this
    // proves is that the screen draws what arrived and does not reach for
    // anything longer.
    expect(drawnLine().latlngs).toEqual(
      decodePolyline(TRIMMED_POLYLINE).map((point) => [point.lat, point.lng]),
    );
    // No Start/Finish pins: the ends of a trimmed line are wherever the cut
    // landed, so labelling them would be a confident lie.
    expect(leafletState().markers).toEqual([]);
    expect(
      screen.getByText(/first and last 300 m are hidden to protect this runner/i),
    ).toBeInTheDocument();
  });

  it('says so rather than drawing half a line when the stored polyline is junk', async () => {
    // Unreachable through the API, which validates routes on write - but a row
    // edited in psql would land here, and a partially decoded line would claim
    // the runner went somewhere they did not.
    const run = seedOwnRun({ route: route({ polyline: 'not a polyline!' }) });

    render(<RunDetailView runId={run.id} />);
    await screen.findByTestId('route-map-undrawable');

    expect(leafletState().tileLayers).toEqual([]);
    expect(leafletState().polylines).toEqual([]);
  });
});

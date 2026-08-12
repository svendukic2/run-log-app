import { render, screen, within } from '@testing-library/react';
import { type EventRun } from '@/lib/events';
import { decodePolyline } from '@/lib/polyline';
import { seedEventRuns, seedEvents, seedParticipants } from '@/test/eventsApiMock';
import { leafletState } from '@/test/leafletMock';
import { eventRouteLines } from './eventRouteLines';
import EventDetailView from './EventDetailView';
import { EVENT_ROUTE_COLORS } from './routeMapStyle';

// The event route map (RUN-77), driven through the event detail page rather than
// in isolation - the RouteMap.test.tsx precedent, and for the same reason: every
// interesting behaviour here is a CHOICE the page makes from what the API sent
// (map or no map at all, which lines, which colours), and rendering the map
// directly would test the half nobody gets wrong.
//
// Leaflet itself is the stub in src/test/leafletMock.ts, so assertions read what
// the component drew (leafletState) rather than a DOM of tiles and transforms.

// Two real polylines in two different places, so a mixed-up line is visible as a
// wrong coordinate rather than as a subtly wrong one.
const JARUN = 'wap_IsyspAsFgc@cG{h@qFe{A';
const MAKSIMIR = 'cvo_Iwt}pAqAeAmB_BwAsB';

function route(polyline: string) {
  return { polyline };
}

// The three cards on that page each read their own store; seeding participants
// keeps the roster half quiet so a failure here is about the map.
function seedEventWithRuns(drafts: Array<Partial<EventRun> & { distanceKm: number }>) {
  const [event] = seedEvents([{ name: 'Zagreb Challenge' }]);
  seedParticipants(event.id, [{ firstName: 'Ana', rank: 1, totalKm: 10, runCount: 1 }]);
  seedEventRuns(event.id, drafts);
  return event;
}

const ANA = { id: 'user-ana', firstName: 'Ana', lastName: 'Horvat' };
const BRUNO = { id: 'user-bruno', firstName: 'Bruno', lastName: 'Novak' };

function legendNames(): string[] {
  const map = screen.getByRole('application', {
    name: 'Map of every route run for this event',
  });
  // The legend is the list beside the map inside the same card.
  const card = map.closest('section');
  if (!card) throw new Error('the map is not inside a card');
  return within(card)
    .getAllByRole('listitem')
    .map((row) => row.textContent?.trim() ?? '');
}

describe('Event route map (RUN-77)', () => {
  it('draws every tagged run in its own colour, framed together, with a legend (AC1, AC2)', async () => {
    const event = seedEventWithRuns([
      { distanceKm: 6.7, runner: ANA, route: route(JARUN) },
      { distanceKm: 3.3, runner: BRUNO, route: route(MAKSIMIR) },
    ]);

    render(<EventDetailView eventId={event.id} />);
    // The map is a dynamic import (ssr: false is mandatory for Leaflet), so it
    // arrives a tick after the card.
    await screen.findByTestId('event-routes-map');

    // One line per tagged run, each the WHOLE decoded polyline.
    expect(leafletState().polylines.map((line) => line.latlngs)).toEqual([
      decodePolyline(JARUN).map((point) => [point.lat, point.lng]),
      decodePolyline(MAKSIMIR).map((point) => [point.lat, point.lng]),
    ]);

    // AC1: visually distinct colours, from the shared palette - not two shades
    // the legend then claims to tell apart.
    const colors = leafletState().polylines.map((line) => line.options.color);
    expect(new Set(colors).size).toBe(2);
    expect(colors).toEqual([EVENT_ROUTE_COLORS[0], EVENT_ROUTE_COLORS[1]]);
    // Dashed, like the single-route map: these are reconstructions, not GPS.
    expect(leafletState().polylines[0].options).toMatchObject({ dashArray: '8 8' });

    // AC2: one fitBounds, and framed to every point of BOTH lines rather than to
    // the first route. Asserted on the argument, not just the call count - the
    // count alone cannot tell those two apart, which is the regression AC2 names
    // (review finding).
    expect(leafletState().fitBoundsCalls).toBe(1);
    expect(leafletState().fitBoundsArgs[0]).toEqual([
      ...decodePolyline(JARUN).map((point) => [point.lat, point.lng]),
      ...decodePolyline(MAKSIMIR).map((point) => [point.lat, point.lng]),
    ]);

    // The licence-required attribution and the tiles themselves.
    expect(leafletState().tileLayers[0].url).toContain('tile.openstreetmap.org');
    expect(leafletState().tileLayers[0].options.attribution).toContain('OpenStreetMap');
    // Bottom right, out from under the card's own heading, like RouteMap's.
    expect(leafletState().zoomControls).toEqual([{ position: 'bottomright' }]);

    // AC1's legend: a row per runner, naming them.
    expect(legendNames()).toEqual(['Ana Horvat', 'Bruno Novak']);

    // No Start/Finish pins: sixteen markers over eight overlapping routes is
    // clutter, and the legend is what identifies a line here.
    expect(leafletState().markers).toEqual([]);
  });

  it('leaves out a runner whose route the server withheld (AC3)', async () => {
    // The withholding itself is server-side (events.service gates the route on
    // canViewRoutes, so a runner with showRoutes off is sent `route: null`).
    // What this asserts is the client half: a null route is not a line and its
    // runner is not in the legend, rather than an entry with nothing beside it.
    const event = seedEventWithRuns([
      { distanceKm: 6.7, runner: ANA, route: route(JARUN) },
      { distanceKm: 3.3, runner: BRUNO, route: null },
    ]);

    render(<EventDetailView eventId={event.id} />);
    await screen.findByTestId('event-routes-map');

    expect(leafletState().polylines).toHaveLength(1);
    expect(legendNames()).toEqual(['Ana Horvat']);
    // Their run is still IN the feed - the opt-out is about the route, not about
    // the run - so the two cards do not disagree about who took part.
    expect(screen.getByText('Bruno Novak')).toBeInTheDocument();
  });

  it('renders no map and never loads Leaflet when no tagged run has a route (AC4)', async () => {
    const event = seedEventWithRuns([
      { distanceKm: 6.7, runner: ANA },
      { distanceKm: 3.3, runner: BRUNO },
    ]);

    render(<EventDetailView eventId={event.id} />);
    // Awaited so the feed's own re-read lands before the assertions: "no map"
    // has to mean "no map once the runs are in", not "no map yet".
    await screen.findByText('Bruno Novak');

    // No empty frame, no heading, nothing.
    expect(screen.queryByTestId('event-routes-map')).toBeNull();
    expect(screen.queryByText('Where everyone ran')).toBeNull();
    // AC4's second half: no map means no Leaflet and no tile request at all. The
    // dynamic import is what makes that true, so asserting it is what stops a
    // future static import from quietly undoing it.
    expect(leafletState().tileLayers).toEqual([]);
    expect(leafletState().polylines).toEqual([]);
    // The run feed is unaffected and moves up into its place.
    // A regex, because that heading carries the run count alongside its label.
    expect(screen.getByRole('region', { name: /Runs in this event/ })).toBeInTheDocument();
  });

  it('gives one runner two lines in one colour and one legend row', async () => {
    const event = seedEventWithRuns([
      { distanceKm: 6.7, runner: ANA, route: route(JARUN) },
      { distanceKm: 3.3, runner: ANA, route: route(MAKSIMIR) },
    ]);

    render(<EventDetailView eventId={event.id} />);
    await screen.findByTestId('event-routes-map');

    expect(leafletState().polylines).toHaveLength(2);
    // The colour belongs to the RUNNER, not to the run, so two runs share it -
    // and the legend says their name once rather than twice.
    const colors = leafletState().polylines.map((line) => line.options.color);
    expect(new Set(colors).size).toBe(1);
    expect(legendNames()).toEqual(['Ana Horvat']);
  });

  it('skips a route that will not decode rather than drawing half a line', async () => {
    const event = seedEventWithRuns([
      { distanceKm: 6.7, runner: ANA, route: route(JARUN) },
      // Junk from a hand-edited row: unreachable through the API, which validates
      // on write, but drawing part of it would claim Bruno went somewhere he did
      // not.
      { distanceKm: 3.3, runner: BRUNO, route: route('not-a-polyline!!') },
    ]);

    render(<EventDetailView eventId={event.id} />);
    await screen.findByTestId('event-routes-map');

    expect(leafletState().polylines).toHaveLength(1);
    expect(legendNames()).toEqual(['Ana Horvat']);
  });
});

// The colour handout, unit-tested where the wrap is reachable: putting nine
// runners on one event page would be a fixture with nothing to say about the rest
// of the screen.
describe('eventRouteLines colour handout', () => {
  const runFor = (index: number): EventRun => ({
    id: `run-${index}`,
    date: '2026-08-12',
    distanceKm: 5,
    durationSeconds: 1500,
    route: { polyline: JARUN },
    runner: { id: `user-${index}`, firstName: `Runner${index}`, lastName: 'X' },
  });

  it('hands out the palette in order and wraps past its length', () => {
    const runners = EVENT_ROUTE_COLORS.length + 1;
    const lines = eventRouteLines(Array.from({ length: runners }, (_, index) => runFor(index)));

    expect(lines).toHaveLength(runners);
    expect(lines.slice(0, EVENT_ROUTE_COLORS.length).map((line) => line.color)).toEqual([
      ...EVENT_ROUTE_COLORS,
    ]);
    // The ninth runner reuses the first colour. Accepted rather than prevented:
    // the ticket's decision 4 puts the expected scale at about five routes, and
    // the demo seeder prepares exactly as many distinct routes as its event has
    // visible participants.
    expect(lines[runners - 1].color).toBe(EVENT_ROUTE_COLORS[0]);
  });
});

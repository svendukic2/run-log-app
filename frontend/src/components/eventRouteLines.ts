// What the event map draws, derived from the event's run feed (RUN-77 AC1).
//
// Its own module, and a PURE one - no 'use client', no Leaflet, no React - for
// the reason the ticket names: the map and the legend must agree about which
// colour belongs to which runner, and they are two different pieces of markup.
// Deriving the mapping once, here, is what makes "the legend names the runner
// each colour belongs to" true by construction rather than by two components
// happening to iterate the same way.
//
// It is also where every undrawable run is dropped, so neither the map nor the
// card has to think about a polyline that will not decode.
import { type EventRun } from '@/lib/events';
import { decodePolyline } from '@/lib/polyline';
import { type RouteWaypoint } from '@/lib/runMath';
import { EVENT_ROUTE_COLORS } from './routeMapStyle';

// One line to draw: one tagged run's decoded geometry, with the colour and the
// name its runner was given.
export interface EventRouteLine {
  runId: string;
  runnerId: string;
  runnerName: string;
  color: string;
  points: RouteWaypoint[];
}

// One row of the legend. Per RUNNER, not per line: a runner who tagged two runs
// gets two lines in one colour and one legend entry, which is more honest than
// the same name twice.
export interface EventRouteLegendEntry {
  runnerId: string;
  runnerName: string;
  color: string;
}

// A line needs at least two points to be a line. decodePolyline already returns
// [] for anything it cannot decode - a truncated string, a 3-D polyline, junk
// from a hand-edited row - so this one check covers both "undecodable" and
// "decoded to a single point".
const MIN_DRAWABLE_POINTS = 2;

// The feed's runs, as drawable lines. Runs with no route, no readable route, or
// a route the server withheld are simply absent: the map draws what it can draw
// and says nothing about what it cannot, which is the same rule RUN-55 applies
// to a single route (`route: null` never says "there is one you may not see").
//
// COLOUR IS PER RUNNER, assigned in the order runners first appear in the feed.
// The feed is server-ordered (newest run first), so the assignment is stable for
// a given response and does not shuffle between renders. Past
// EVENT_ROUTE_COLORS.length runners it wraps - see that constant for why that is
// an accepted limit rather than a bug.
export function eventRouteLines(runs: EventRun[]): EventRouteLine[] {
  const colorByRunner = new Map<string, string>();
  const lines: EventRouteLine[] = [];

  for (const run of runs) {
    const polyline = run.route?.polyline;
    if (!polyline) continue;
    const points = decodePolyline(polyline);
    if (points.length < MIN_DRAWABLE_POINTS) continue;

    let color = colorByRunner.get(run.runner.id);
    if (color === undefined) {
      // Keyed on the count of runners already seen, not on the run's index in the
      // feed: two runs by the same runner must not consume two colours.
      color = EVENT_ROUTE_COLORS[colorByRunner.size % EVENT_ROUTE_COLORS.length];
      colorByRunner.set(run.runner.id, color);
    }

    lines.push({
      runId: run.id,
      runnerId: run.runner.id,
      runnerName: `${run.runner.firstName} ${run.runner.lastName}`,
      color,
      points,
    });
  }

  return lines;
}

// The legend for those lines: one entry per runner, in the order their colours
// were handed out, so reading the legend top to bottom matches the order the
// lines were drawn.
export function eventRouteLegend(lines: EventRouteLine[]): EventRouteLegendEntry[] {
  const seen = new Set<string>();
  const entries: EventRouteLegendEntry[] = [];
  for (const line of lines) {
    if (seen.has(line.runnerId)) continue;
    seen.add(line.runnerId);
    entries.push({
      runnerId: line.runnerId,
      runnerName: line.runnerName,
      color: line.color,
    });
  }
  return entries;
}

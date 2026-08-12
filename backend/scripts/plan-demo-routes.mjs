// Regenerates src/seed/demo-routes.ts (RUN-77 decision 5). Run by hand, never
// by the app, never by CI:
//
//     node scripts/plan-demo-routes.mjs          # print what it would write
//     node scripts/plan-demo-routes.mjs --write  # rewrite demo-routes.ts
//
// WHY THIS EXISTS AS A SCRIPT rather than as a paragraph describing how the
// polylines were made. The seeder must not call a routing provider - it has to
// stay deterministic and work offline on a fresh clone with no API key - so the
// geometry is checked in as constants. Constants nobody can regenerate rot: the
// next person who wants a ninth Zagreb route would have to hand-encode a
// polyline. Adding an entry to ROUTES below and re-running is the supported way.
//
// It is deliberately dependency-free plain ESM: no TypeScript, no imports from
// src/, nothing from node_modules. It is not linted (backend lint covers
// {src,apps,libs,test}/**/*.ts) and not compiled, so it cannot break the build
// or the deploy.
//
// THE PROVIDER is the OpenStreetMap community Valhalla instance on its
// `pedestrian` costing. Not this app's own openrouteservice proxy, only because
// that needs ROUTING_API_KEY and RUN-53 deliberately kept that optional - a
// clone with no key must still be able to regenerate this. Not the public OSRM
// demo server, because RUN-53 proved it answers with CAR results for every
// profile including the foot one, which would route the Jarun lake loop onto the
// surrounding streets instead of the lakeside path. Pedestrian costing walks
// footways, which is what these routes actually are.
//
// Valhalla encodes at PRECISION 6. This app decodes at 5 (route-trim.ts,
// frontend/src/lib/polyline.ts), so every shape is decoded at 6 and re-encoded
// at 5 HERE, once, rather than at runtime.

import { writeFileSync } from 'node:fs';

const VALHALLA = 'https://valhalla1.openstreetmap.de/route';
const OUTPUT = new URL('../src/seed/demo-routes.ts', import.meta.url);

// Polite pacing on a free community service. Eight routes, so this costs ten
// seconds and nothing else.
const PAUSE_MS = 1200;

// The box AC7 means by "the Zagreb area", generous enough to hold Sljeme on
// Medvednica in the north and the Sava embankment east to Zitnjak.
const ZAGREB_BOUNDS = { minLat: 45.65, maxLat: 45.95, minLng: 15.75, maxLng: 16.2 };

// Each route is the 2-5 points a runner could have tapped in the app's own
// picker (MIN_ROUTE_POINTS..MAX_ROUTE_POINTS), plus the name and the one-line
// description of where it goes that AC7 asks a reader to be able to check.
//
// Loops END BESIDE their start rather than exactly on it, so the router returns
// a loop instead of collapsing the leg to nothing.
const ROUTES = [
  {
    name: 'Bundek loop',
    where: 'the path around the Bundek lake, south of the Sava',
    points: [
      { lat: 45.78, lng: 15.988 },
      { lat: 45.7778, lng: 15.9905 },
      { lat: 45.7775, lng: 15.9965 },
      { lat: 45.7805, lng: 15.9955 },
      { lat: 45.7803, lng: 15.9885 },
    ],
  },
  {
    name: 'Maksimir park loop',
    where: "the park's outer paths, from the main entrance and back",
    points: [
      { lat: 45.818, lng: 16.015 },
      { lat: 45.823, lng: 16.014 },
      { lat: 45.8265, lng: 16.02 },
      { lat: 45.8215, lng: 16.0235 },
      { lat: 45.8183, lng: 16.0157 },
    ],
  },
  {
    name: 'Tuškanac forest trail',
    where: 'up through the Tuškanac woods above Ilica and back down',
    points: [
      { lat: 45.8155, lng: 15.972 },
      { lat: 45.823, lng: 15.967 },
      { lat: 45.832, lng: 15.969 },
      { lat: 45.825, lng: 15.976 },
      { lat: 45.816, lng: 15.973 },
    ],
  },
  {
    name: 'Jarun lake loop',
    where: 'the lakeside path all the way round Malo and Veliko jezero',
    points: [
      { lat: 45.7838, lng: 15.906 },
      { lat: 45.78, lng: 15.913 },
      { lat: 45.7805, lng: 15.928 },
      { lat: 45.7855, lng: 15.929 },
      { lat: 45.7845, lng: 15.907 },
    ],
  },
  {
    name: 'Sava embankment out and back',
    where: 'the levee path east along the north bank, turning at Most mladosti',
    points: [
      { lat: 45.785, lng: 15.931 },
      { lat: 45.7875, lng: 15.962 },
      { lat: 45.7885, lng: 15.99 },
      { lat: 45.7875, lng: 15.962 },
      { lat: 45.7852, lng: 15.9315 },
    ],
  },
  {
    name: 'Sljeme hill climb',
    where: 'the classic climb from Gračani up to the Sljeme peak, one way',
    points: [
      { lat: 45.848, lng: 15.974 },
      { lat: 45.87, lng: 15.97 },
      { lat: 45.9075, lng: 15.9635 },
    ],
  },
  {
    name: 'Sava bridges loop',
    where: 'east on the north bank, back west on the south, crossing twice',
    points: [
      { lat: 45.785, lng: 15.931 },
      { lat: 45.788, lng: 15.986 },
      { lat: 45.779, lng: 15.988 },
      { lat: 45.777, lng: 15.93 },
      { lat: 45.7852, lng: 15.9315 },
    ],
  },
  {
    name: 'Sava embankment long run',
    where: 'the levee path from Jarun west out towards Žitnjak and back',
    points: [
      { lat: 45.783, lng: 15.885 },
      { lat: 45.787, lng: 15.94 },
      { lat: 45.789, lng: 15.985 },
      { lat: 45.787, lng: 15.94 },
      { lat: 45.7835, lng: 15.886 },
    ],
  },
];

/* Polyline codecs, at whatever precision the caller names ------------------- */

function decodePolyline(encoded, precision) {
  const factor = 10 ** precision;
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const deltas = [];
    for (let axis = 0; axis < 2; axis += 1) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        if (index >= encoded.length) throw new Error('truncated polyline');
        byte = encoded.charCodeAt(index) - 63;
        index += 1;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      deltas.push(result & 1 ? ~(result >> 1) : result >> 1);
    }
    lat += deltas[0];
    lng += deltas[1];
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

function encodePolyline(points, precision) {
  const factor = 10 ** precision;
  const out = [];
  const push = (value) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63));
      v >>= 5;
    }
    out.push(String.fromCharCode(v + 63));
  };
  let lastLat = 0;
  let lastLng = 0;
  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lng = Math.round(point.lng * factor);
    push(lat - lastLat);
    push(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return out.join('');
}

const EARTH_RADIUS_KM = 6371;

function lengthKm(points) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const dLat = toRadians(to.lat - from.lat);
    const dLng = toRadians(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(from.lat)) *
        Math.cos(toRadians(to.lat)) *
        Math.sin(dLng / 2) ** 2;
    total += 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return total;
}

/* Planning ------------------------------------------------------------------ */

async function plan(route) {
  const response = await fetch(VALHALLA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: route.points.map((point) => ({
        lat: point.lat,
        lon: point.lng,
        type: 'break',
      })),
      costing: 'pedestrian',
      directions_options: { units: 'kilometers' },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`${route.name}: HTTP ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  const legs = body.trip?.legs ?? [];
  if (legs.length === 0) throw new Error(`${route.name}: provider returned no legs`);

  // Every leg but the first repeats the previous leg's last point.
  const points = legs.flatMap((leg, index) => {
    const decoded = decodePolyline(leg.shape, 6);
    return index === 0 ? decoded : decoded.slice(1);
  });
  const polyline = encodePolyline(points, 5);

  // The distance the constants file states is the DECODED line's own geodesic
  // length, not the provider's summary: the file's consumers decode the string,
  // so the number has to describe what they get, after the precision-5 rounding.
  return {
    name: route.name,
    where: route.where,
    distanceKm: Math.round(lengthKm(decodePolyline(polyline, 5)) * 10) / 10,
    waypoints: route.points,
    polyline,
    pointCount: points.length,
  };
}

/* Checks, run before anything is written ----------------------------------- */

const MAX_POLYLINE_CHARS = 20_000; // ROUTE_POLYLINE_MAX_LENGTH
const MIN_WAYPOINTS = 2; // MIN_ROUTE_POINTS
const MAX_WAYPOINTS = 5; // MAX_ROUTE_POINTS

function check(planned) {
  const problems = [];
  const names = new Set();
  for (const route of planned) {
    const label = route.name;
    if (names.has(label)) problems.push(`${label}: duplicate name`);
    names.add(label);
    if (route.polyline.length > MAX_POLYLINE_CHARS) {
      problems.push(`${label}: polyline is ${route.polyline.length} chars`);
    }
    if (
      route.waypoints.length < MIN_WAYPOINTS ||
      route.waypoints.length > MAX_WAYPOINTS
    ) {
      problems.push(`${label}: ${route.waypoints.length} waypoints`);
    }
    const points = decodePolyline(route.polyline, 5);
    // The two properties every consumer actually depends on, checked here as well
    // as in demo-data.spec.ts: a script whose stated job is to refuse to write bad
    // output should not leave its own two load-bearing invariants to a test suite
    // that runs later (review finding).
    if (points.length < 2) {
      problems.push(`${label}: decodes to ${points.length} point(s), not a line`);
    }
    if (!(route.distanceKm > 0)) {
      problems.push(`${label}: distanceKm is ${route.distanceKm}`);
    }
    const outside = points.filter(
      (point) =>
        point.lat < ZAGREB_BOUNDS.minLat ||
        point.lat > ZAGREB_BOUNDS.maxLat ||
        point.lng < ZAGREB_BOUNDS.minLng ||
        point.lng > ZAGREB_BOUNDS.maxLng,
    );
    if (outside.length) problems.push(`${label}: ${outside.length} points outside Zagreb`);
    if (!route.where) problems.push(`${label}: no "where" line`);
  }
  return problems;
}

/* Emitting ------------------------------------------------------------------ */

// Chr 92 (backslash) is inside the polyline alphabet (63..126) and does occur in
// real geometry; a single-quoted TS literal would silently eat it and corrupt the
// line. The single quote is chr 39, below that range, so a polyline cannot contain
// one - but a NAME can ("St. Mark's loop"), so both go through the same escaping
// rather than only the one that needs it today.
const quote = (value) => value.split('\\').join('\\\\').split("'").join("\\'");

function emit(planned) {
  const entries = planned
    .map((route) => {
      const waypoints = route.waypoints
        .map((point) => `      { lat: ${point.lat}, lng: ${point.lng} },`)
        .join('\n');
      return `  {
    // ${route.where}.
    name: '${quote(route.name)}',
    distanceKm: ${route.distanceKm},
    waypoints: [
${waypoints}
    ],
    polyline:
      '${quote(route.polyline)}',
  },`;
    })
    .join('\n');

  return `// The demo seeder's route geometry (RUN-77 decision 5): ${planned.length} real Zagreb
// running routes as encoded polylines, checked in as constants.
//
// GENERATED, and regenerable: \`node scripts/plan-demo-routes.mjs --write\`. That
// script holds the coordinates, the provider choice and the reasoning behind
// both; add a route there rather than hand-encoding a polyline here.
//
// WHY CONSTANTS AND NOT A ROUTING CALL. RUN-71's seeder has two hard properties
// - it is deterministic (same \`today\`, same dataset, down to the last note) and
// it works offline on a fresh clone with no API key. A call to openrouteservice
// from the seeder would break both, and would make ROUTING_API_KEY required for
// seeding when RUN-53 deliberately kept it optional. So the routing happened
// once, at authoring time, and this is its output.
//
// WHAT EVERY ENTRY HAS TO SATISFY, because nothing at runtime re-checks it - the
// seeder writes rows straight through Prisma, bypassing RunRouteDto entirely:
//   - the polyline decodes at PRECISION 5 (runs/route-trim.ts) and is at most
//     ROUTE_POLYLINE_MAX_LENGTH (20 000) characters
//   - waypoints number MIN_ROUTE_POINTS..MAX_ROUTE_POINTS (2-5)
//   - every decoded point is inside ZAGREB_BOUNDS (AC7)
//   - \`name\` describes where the geometry actually goes (AC7 again - the comment
//     on each entry is there so a reader can check that claim without decoding
//     anything)
//   - \`distanceKm\` is the decoded line's OWN length, which is why a run that
//     gets a route takes its distance from here rather than keeping the
//     generated one (demo-data.ts withRoute)
// demo-data.spec.ts asserts all of it, so a ninth route that breaks any of them
// fails the suite rather than the demo.
//
// Ordered by distance, shortest first: demo-data.ts hands them out in this order
// so the shorter routes land on the beginner accounts, and a sorted table makes
// that - and the spread it depends on - readable.

// One prepared route. Deliberately mirrors the three Run route columns plus the
// two things a run needs, and nothing else: this is data, and every decision
// about which run gets which route lives in demo-data.ts.
export interface DemoRoute {
  // Becomes Run.routeName as well as the event map's legend label, so it is the
  // one string that has to agree with the geometry.
  name: string;
  // The decoded line's own length in km, rounded to one decimal - the same
  // precision Run.distanceKm carries.
  distanceKm: number;
  // Encoded, precision 5. Becomes Run.routePolyline.
  polyline: string;
  // The tapped points: [0] is Start, the last is Finish. Becomes
  // Run.routeWaypoints (a JSONB column).
  waypoints: readonly { readonly lat: number; readonly lng: number }[];
}

// The box AC7 means by "the Zagreb area" - generous enough to hold Sljeme on
// Medvednica in the north and the Sava embankment out east. Exported because the
// constraint belongs to the data rather than to the test that checks it.
export const ZAGREB_BOUNDS = {
  minLat: ${ZAGREB_BOUNDS.minLat},
  maxLat: ${ZAGREB_BOUNDS.maxLat},
  minLng: ${ZAGREB_BOUNDS.minLng},
  maxLng: ${ZAGREB_BOUNDS.maxLng},
} as const;

export const DEMO_ROUTES: readonly DemoRoute[] = [
${entries}
];
`;
}

/* Main ---------------------------------------------------------------------- */

const write = process.argv.includes('--write');
const planned = [];

for (const route of ROUTES) {
  const result = await plan(route);
  planned.push(result);
  console.log(
    `${result.name.padEnd(30)} ${String(result.distanceKm).padStart(5)} km  ` +
      `${String(result.pointCount).padStart(4)} pts  ` +
      `${String(result.polyline.length).padStart(5)} chars`,
  );
  if (route !== ROUTES[ROUTES.length - 1]) {
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
}

planned.sort((a, b) => a.distanceKm - b.distanceKm);

const problems = check(planned);
if (problems.length) {
  console.error(`\nRefusing to write, ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else if (write) {
  writeFileSync(OUTPUT, emit(planned));
  console.log(`\nWrote ${planned.length} routes to src/seed/demo-routes.ts`);
} else {
  console.log(`\n${planned.length} routes planned and checked. Re-run with --write.`);
}

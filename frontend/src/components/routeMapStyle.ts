// The handful of values the three Leaflet maps need: the picker in the Add/Edit
// modal (RouteMapPicker, RUN-54), the display map on run detail (RouteMap,
// RUN-55) and the event's multi-route map (EventRoutesMap, RUN-77).
//
// They live in their own module rather than in any one map because Leaflet takes
// colours and URLs as VALUES, not as classes: they cannot come from globals.css
// the way the rest of the app's styling does, so the one thing left to do is
// make sure every map reads the same literal. A route line that is a slightly
// different blue on two screens is exactly the kind of drift nobody notices
// until a designer does.
//
// Deliberately plain constants with no 'use client' and no Leaflet import, so a
// server-rendered card can name a colour without pulling in a map.

// Mirrors --color-route in globals.css. See the token's comment there for why
// the route line is not the coral accent.
export const ROUTE_LINE_COLOR = '#2f6fdb';

// One colour per runner on the event map (RUN-77 AC1), which draws several
// routes at once. Here rather than inside that map because the LEGEND needs the
// identical mapping: a legend and a map that each picked their own colours would
// be a legend that lies, and the two live in different components.
//
// Eight, which is not arbitrary - it is the number of routes the demo seeder
// prepares and the number of participants its event puts on the board. Past eight
// runners the assignment wraps and two of them share a colour, which the ticket's
// decision 4 explicitly allows the implementation to rely on ("about 5 routes").
// If events ever grow, this is one of the two places to revisit (the other is the
// payload size).
//
// Chosen to stay legible against OSM tiles, which are pale beige, grey and
// green: no yellows, nothing pastel, and no second blue close enough to
// ROUTE_LINE_COLOR to be mistaken for it. First is that same blue, so a
// single-route event map matches the run detail map exactly.
export const EVENT_ROUTE_COLORS = [
  ROUTE_LINE_COLOR, // blue
  '#d6453c', // red
  '#1c8c4a', // green
  '#8a4fd8', // purple
  '#d97706', // amber
  '#0f8b9e', // teal
  '#c0348a', // magenta
  '#4a5568', // slate
] as const;

// OSM's tile usage policy REQUIRES this attribution to be visible. It is not
// decoration; removing it is a licence violation, not a style choice.
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// The zoom OSM tiles stop at, so Leaflet does not request tiles that 404.
export const OSM_MAX_ZOOM = 19;

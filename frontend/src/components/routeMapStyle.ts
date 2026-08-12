// The handful of values both Leaflet maps need: the picker in the Add/Edit
// modal (RouteMapPicker, RUN-54) and the display map on run detail (RouteMap,
// RUN-55).
//
// They live in their own module rather than in either map because Leaflet takes
// colours and URLs as VALUES, not as classes: they cannot come from globals.css
// the way the rest of the app's styling does, so the one thing left to do is
// make sure the two maps read the same literal. A route line that is a slightly
// different blue on the two screens is exactly the kind of drift nobody notices
// until a designer does.
//
// Deliberately plain constants with no 'use client' and no Leaflet import, so a
// server-rendered card can name a colour without pulling in a map.

// Mirrors --color-route in globals.css. See the token's comment there for why
// the route line is not the coral accent.
export const ROUTE_LINE_COLOR = '#2f6fdb';

// OSM's tile usage policy REQUIRES this attribution to be visible. It is not
// decoration; removing it is a licence violation, not a style choice.
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// The zoom OSM tiles stop at, so Leaflet does not request tiles that 404.
export const OSM_MAX_ZOOM = 19;

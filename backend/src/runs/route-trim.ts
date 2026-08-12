// The privacy trim (RUN-55 AC4): a route served to somebody other than its
// owner loses its first and last ~300 metres.
//
// WHY THIS IS A SERVER CONCERN. A route drawn from a runner's front door is
// their home address. `showRoutes` grants a stranger the shape of the run, not
// where it starts, so the ends are cut out of the PAYLOAD - the same rule the
// rest of this app already follows for gated data (RUN-63, RUN-54): what the
// viewer may not see is never sent, so there is nothing a devtools tab, a
// zoomed screenshot or a future client bug can un-hide.
//
// TRIMS AT LEAST 300 m, never less. Points are dropped whole rather than
// interpolated to an exact 300 m mark: interpolating would put the visible end
// exactly 300 m from the real one, which is a smaller circle to search than the
// "somewhere past 300 m" this produces. A polyline point every few metres makes
// the difference invisible on a map and meaningful to somebody triangulating.
//
// The decoder below MIRRORS frontend/src/lib/polyline.ts. The two cannot share
// a module (separate apps, separate node_modules - see CLAUDE.md on the
// hand-mirrored contract), so the constant that matters, precision 5, is named
// in both places and asserted by the round-trip test here.

// Google encoded-polyline precision. 5 is what the routing provider returns
// with elevation off (RUN-53); a 3-D polyline read at 5 decodes to nonsense
// rather than failing, which is why this is a named constant and not a 5.
export const POLYLINE_PRECISION = 5;

export const ROUTE_TRIM_METERS = 300;

const EARTH_RADIUS_M = 6_371_000;

interface Point {
  lat: number;
  lng: number;
}

// Decodes to coordinates, or [] for anything that is not a decodable polyline:
// a truncated string, a 3-D one, junk from a hand-edited row. Drawing nothing
// is the honest outcome, since a partial line claims the runner went somewhere
// they did not.
export function decodePolyline(
  encoded: string,
  precision = POLYLINE_PRECISION,
): Point[] {
  const factor = 10 ** precision;
  const points: Point[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const deltas: number[] = [];
    // Each coordinate is a chunked, zig-zag encoded delta from the previous
    // one: five bits per character, the high bit meaning "another follows".
    for (let axis = 0; axis < 2; axis += 1) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        if (index >= encoded.length) return [];
        byte = encoded.charCodeAt(index) - 63;
        index += 1;
        // Outside the printable range the format uses: not a polyline.
        if (byte < 0 || byte > 63) return [];
        result |= (byte & 0x1f) << shift;
        shift += 5;
        // A 32-bit delta is already an impossible coordinate.
        if (shift > 30) return [];
      } while (byte >= 0x20);
      deltas.push(result & 1 ? ~(result >> 1) : result >> 1);
    }

    lat += deltas[0];
    lng += deltas[1];
    const point = { lat: lat / factor, lng: lng / factor };
    if (
      point.lat < -90 ||
      point.lat > 90 ||
      point.lng < -180 ||
      point.lng > 180
    ) {
      return [];
    }
    points.push(point);
  }

  return points;
}

function encodeValue(delta: number): string {
  // Zig-zag: the sign goes into the low bit so small negatives stay short.
  let value = delta < 0 ? ~(delta << 1) : delta << 1;
  let out = '';
  while (value >= 0x20) {
    out += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>>= 5;
  }
  return out + String.fromCharCode(value + 63);
}

// The inverse of the decoder. Rounding to the integer grid first is what makes
// decode -> encode exact rather than one-ulp lossy: the decoded value is an
// integer divided by the factor, so multiplying back lands on that integer.
export function encodePolyline(
  points: Point[],
  precision = POLYLINE_PRECISION,
): string {
  const factor = 10 ** precision;
  let previousLat = 0;
  let previousLng = 0;
  let out = '';
  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lng = Math.round(point.lng * factor);
    out += encodeValue(lat - previousLat) + encodeValue(lng - previousLng);
    previousLat = lat;
    previousLng = lng;
  }
  return out;
}

function metresBetween(from: Point, to: Point): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

// The polyline with its ends cut off, or null when there is nothing honest left
// to serve. null covers three cases the caller treats identically, because a
// viewer must not be able to tell them apart:
//   - the stored string is not a decodable polyline;
//   - the route is shorter than two trims, so the middle is empty;
//   - the middle is a single point, which is not a line.
// A route too short to trim is therefore NOT SERVED rather than served whole:
// "no map" leaks nothing, a 500 m loop from somebody's door leaks everything.
//
// KNOWN LIMITATION, recorded rather than hidden: this cuts the ENDS, which is
// what the ticket asks for. A route that comes back past its own start in the
// MIDDLE - laps, or a figure-of-eight with a waypoint dropped at home - still
// carries that point, and no amount of end-trimming fixes it. Closing that would
// mean excising a radius around the start and finish, which splits the line into
// pieces this single-polyline contract cannot carry, so it is a decision for
// whoever owns the privacy story rather than something to slip in here. Note
// these polylines are reconstructions from 2-5 tapped points, so it takes a
// deliberate waypoint at home to produce one.
export function trimPolylineEnds(
  polyline: string,
  trimMetres = ROUTE_TRIM_METERS,
): string | null {
  const points = decodePolyline(polyline);
  if (points.length < 2) return null;

  // Distance walked along the line to each point, so both ends are measured
  // the same way and a wiggly route is not over-trimmed by straight-line
  // distance from its endpoints.
  const walked: number[] = [0];
  for (let index = 1; index < points.length; index += 1) {
    walked.push(
      walked[index - 1] + metresBetween(points[index - 1], points[index]),
    );
  }
  const total = walked[walked.length - 1];

  const middle = points.filter(
    (_point, index) =>
      walked[index] >= trimMetres && total - walked[index] >= trimMetres,
  );

  // Then keep cutting while the surviving end is still NEAR the real one.
  // Walking 300 m is not the same as being 300 m away: a lap of the block, or a
  // switchback out of a driveway, can spend 300 m of route within 50 m of the
  // front door, and cutting by distance walked alone would leave that visible
  // while the map's caption claims otherwise. Both real ends are checked
  // against both surviving ones, because on a loop they are the same place.
  const realEnds = [points[0], points[points.length - 1]];
  const nearARealEnd = (point: Point) =>
    realEnds.some((end) => metresBetween(point, end) < trimMetres);

  let first = 0;
  let last = middle.length - 1;
  while (first <= last && nearARealEnd(middle[first])) first += 1;
  while (last >= first && nearARealEnd(middle[last])) last -= 1;

  const kept = middle.slice(first, last + 1);
  if (kept.length < 2) return null;

  return encodePolyline(kept);
}

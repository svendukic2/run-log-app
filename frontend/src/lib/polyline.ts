// Google encoded-polyline decoding. Pure and dependency-free: the routing
// provider hands us the geometry as one string (RUN-53) and both the picker
// (RUN-54) and the display map (RUN-55) need it as coordinates.
//
// PRECISION 5, not 6. The provider's JSON default with elevation off is 5;
// asking for elevation would return a three-dimensional polyline that a 2-D
// decoder silently MANGLES rather than rejects, which is why RUN-53 documents
// the number on its response type and why it is a named constant here.
import { type RouteWaypoint } from './runMath';

export const POLYLINE_PRECISION = 5;

// Returns [] for anything that is not a decodable polyline - a truncated
// string, a 3-D one, junk from a hand-edited row. The callers draw a line from
// this, and drawing nothing is the honest outcome: a partial line would claim
// the runner went somewhere they did not.
export function decodePolyline(
  encoded: string,
  precision: number = POLYLINE_PRECISION,
): RouteWaypoint[] {
  const factor = 10 ** precision;
  const points: RouteWaypoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Each coordinate is a chunked, zig-zag encoded delta from the previous
    // one: five bits per character, the high bit meaning "another follows".
    let result = 0;
    let shift = 0;
    let byte: number;
    const deltas: number[] = [];

    for (let axis = 0; axis < 2; axis += 1) {
      result = 0;
      shift = 0;
      do {
        if (index >= encoded.length) return [];
        byte = encoded.charCodeAt(index) - 63;
        index += 1;
        // Outside the printable range the format uses: not a polyline.
        if (byte < 0 || byte > 63) return [];
        result |= (byte & 0x1f) << shift;
        shift += 5;
        // A 32-bit delta is already an impossible coordinate; more than that
        // means the string is not what it claims to be.
        if (shift > 30) return [];
      } while (byte >= 0x20);
      deltas.push(result & 1 ? ~(result >> 1) : result >> 1);
    }

    lat += deltas[0];
    lng += deltas[1];
    const point = { lat: lat / factor, lng: lng / factor };
    // A decoder fed a 3-D polyline drifts off the globe within a few points;
    // bailing keeps a mangled line from being drawn as a real one.
    if (point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) {
      return [];
    }
    points.push(point);
  }

  return points;
}

const EARTH_RADIUS_KM = 6371;

// The length of a decoded line, in km. Used for ONE thing: the mismatch hint
// when Edit restored a route from storage, where the provider's own distance is
// not available (it is not a stored column - the entered distance is the source
// of truth, so there was no reason to keep it). A freshly planned route always
// uses the provider's number instead. The two agree to within metres at
// precision 5, which is far inside the 20% the hint tests.
export function polylineDistanceKm(points: RouteWaypoint[]): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    // Haversine: over the tens of metres between two polyline points a flat
    // approximation would do, but the sum runs over hundreds of them and the
    // error would accumulate in one direction.
    const dLat = toRadians(to.lat - from.lat);
    const dLng = toRadians(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
    total += 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return total;
}

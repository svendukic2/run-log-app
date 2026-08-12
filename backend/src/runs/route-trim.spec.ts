import {
  ROUTE_TRIM_METERS,
  decodePolyline,
  encodePolyline,
  trimPolylineEnds,
} from './route-trim';

// The codec first, because the trim is only trustworthy if the round trip is:
// a trimmed route is re-encoded before it is sent, so an encoder that drifts
// would move a stranger's map instead of shortening it.
describe('polyline codec', () => {
  // Google's own documented example for the encoding, so this asserts against
  // the format rather than against our own encoder.
  const GOOGLE_EXAMPLE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

  it('decodes the reference example', () => {
    expect(decodePolyline(GOOGLE_EXAMPLE)).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it('round-trips exactly at precision 5', () => {
    expect(encodePolyline(decodePolyline(GOOGLE_EXAMPLE))).toBe(GOOGLE_EXAMPLE);
  });

  it.each([
    ['a truncated string', '_p~iF'],
    ['characters outside the format', 'not a polyline!'],
    ['coordinates off the globe', '_p~iF~ps|U_p~iF~ps|U_p~iF~ps|U'],
  ])('decodes %s to nothing rather than a partial line', (_case, encoded) => {
    expect(decodePolyline(encoded)).toEqual([]);
  });
});

// A straight north-south line of points 100 m apart, so the arithmetic in each
// test below is checkable by hand: point n is n * 100 m from the start.
// 0.0009 degrees of latitude is ~100.07 m, which is why the assertions allow a
// metre of slack rather than pinning exact counts.
function ladder(pointCount: number): string {
  return encodePolyline(
    Array.from({ length: pointCount }, (_unused, index) => ({
      lat: 45.815 + index * 0.0009,
      lng: 15.9819,
    })),
  );
}

// Straight-line metres between two points, flat-earth with the longitude
// squeezed by the latitude. Good to well under a metre over the kilometre these
// tests span, and independent of the module's own haversine, which is the point
// of writing it out rather than exporting that.
function metresApart(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const metresPerDegree = 111_320;
  return Math.hypot(
    (a.lat - b.lat) * metresPerDegree,
    (a.lng - b.lng) * metresPerDegree * Math.cos((a.lat * Math.PI) / 180),
  );
}

// A closed loop of `radius` metres around one point: every point on it is at
// most one diameter from the start, however long the loop itself is.
function loop(radiusMetres: number, pointCount = 24): string {
  const centreLat = 45.815;
  const centreLng = 15.9819;
  const metresPerDegree = 111_320;
  return encodePolyline(
    Array.from({ length: pointCount }, (_unused, index) => {
      const angle = (2 * Math.PI * index) / (pointCount - 1);
      return {
        lat: centreLat + (radiusMetres / metresPerDegree) * Math.cos(angle),
        lng:
          centreLng +
          (radiusMetres /
            (metresPerDegree * Math.cos((centreLat * Math.PI) / 180))) *
            Math.sin(angle),
      };
    }),
  );
}

describe('trimPolylineEnds', () => {
  it('cuts at least the trim distance off each end and leaves the middle alone', () => {
    const stored = ladder(21); // ~2 km end to end
    const all = decodePolyline(stored);

    // 0 m, 100 m and 200 m are inside the trim, so the first survivor is the
    // point at ~300.2 m and the far end mirrors it: at least 300 m goes from
    // each side, never less. Compared as ENCODED strings on purpose - what
    // survives has to be the stored geometry byte for byte, because a trim
    // that resampled or smoothed would be drawing a route nobody ran.
    expect(trimPolylineEnds(stored)).toBe(encodePolyline(all.slice(3, -3)));
  });

  it.each([
    ['shorter than one trim (~100 m)', 2],
    ['shorter than two trims (~300 m)', 4],
    ['exactly two trims long (~600 m), leaving one point', 7],
  ])('serves nothing for a route %s', (_case, pointCount) => {
    // The last case is the interesting one: at exactly 2 x 300 m the only
    // candidate is the midpoint, and one point is not a line. This is the case
    // the ticket does not mention and the reason the return type is nullable -
    // a 500 m loop from somebody's door is exactly the route that must not be
    // served whole because it was too short to cut.
    expect(trimPolylineEnds(ladder(pointCount))).toBeNull();
  });

  // The case the along-the-line measurement alone gets wrong, and the review
  // found: a 750 m lap of the block never gets more than ~240 m from the front
  // door, so cutting 300 m of ROUTE off each end would still leave every
  // surviving point within shouting distance of it - while the map caption
  // claims the ends are hidden.
  it('serves nothing for a loop that never gets a trim away from its start', () => {
    expect(trimPolylineEnds(loop(120))).toBeNull();
  });

  it('serves the far side of a loop that does get away from its start', () => {
    // Same shape, 1 km across: the ends are cut, and what survives is genuinely
    // more than 300 m from the door rather than merely 300 m of running from it.
    const kept = decodePolyline(trimPolylineEnds(loop(500)) ?? '');
    const start = decodePolyline(loop(500))[0];

    expect(kept.length).toBeGreaterThan(1);
    expect(
      kept.every((point) => metresApart(point, start) >= ROUTE_TRIM_METERS),
    ).toBe(true);
  });

  it('serves nothing for an undecodable stored polyline', () => {
    expect(trimPolylineEnds('not a polyline!')).toBeNull();
  });

  it('honours a caller-supplied trim distance', () => {
    // Same 2 km line, a 900 m trim: far fewer points survive than at the
    // default, which is what proves the distance is really the threshold and
    // not a fixed number of points.
    const wide = decodePolyline(trimPolylineEnds(ladder(21), 900) ?? '');
    const narrow = decodePolyline(
      trimPolylineEnds(ladder(21), ROUTE_TRIM_METERS) ?? '',
    );

    expect(wide.length).toBeLessThan(narrow.length);
    expect(wide.length).toBeGreaterThan(1);
  });
});

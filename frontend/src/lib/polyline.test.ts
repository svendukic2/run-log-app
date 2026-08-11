import { decodePolyline, polylineDistanceKm } from './polyline';
import { routeMismatchHint } from './runMath';

describe('decodePolyline (RUN-54)', () => {
  it('decodes the algorithm reference example at precision 5', () => {
    // From Google's own encoded-polyline documentation, so a decoder that
    // passes this is right rather than merely self-consistent.
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it.each([
    ['an empty string', ''],
    // Cut mid-coordinate, which is what a stored polyline truncated by a
    // column limit or a copy-paste looks like.
    ['a truncated polyline', '_p~iF~ps|U_ulL'],
    ['characters outside the format', '_p~iF~ps|U\u0001\u0002'],
  ])('returns nothing for %s rather than a partial line', (_case, encoded) => {
    // Drawing half a line would claim the runner went somewhere they did not,
    // so the honest answer is to draw nothing.
    expect(decodePolyline(encoded)).toEqual([]);
  });

  it('measures the decoded line in kilometres', () => {
    // Two points ~1.9 km apart in central Berlin (the pair RUN-53's own probe
    // used, where the provider reported 1.888 km for the walking route).
    const km = polylineDistanceKm([
      { lat: 52.516275, lng: 13.377704 },
      { lat: 52.520008, lng: 13.404954 },
    ]);
    expect(km).toBeCloseTo(1.9, 1);
    // One point is no distance, not NaN.
    expect(polylineDistanceKm([{ lat: 52.5, lng: 13.4 }])).toBe(0);
  });
});

describe('routeMismatchHint (RUN-54 AC2)', () => {
  it('stays quiet up to 20% and speaks past it', () => {
    // Exactly 20% off is still "approximate", which is what a reconstruction
    // from five points is expected to be.
    expect(routeMismatchHint(8, 10)).toBeNull();
    expect(routeMismatchHint(12, 10)).toBeNull();
    expect(routeMismatchHint(7.9, 10)).toContain('Routed distance is 7.9 km');
    // Both directions: a route much LONGER than the log is just as suspect.
    expect(routeMismatchHint(13, 10)).toContain('but you logged 10.0 km');
  });

  it('says nothing when there is no distance to compare against', () => {
    expect(routeMismatchHint(5, 0)).toBeNull();
    expect(routeMismatchHint(Number.NaN, 10)).toBeNull();
  });
});

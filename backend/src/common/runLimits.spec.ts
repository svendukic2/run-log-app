import { isOutlierRun, runLimitViolation } from './runLimits';

// AC4 is the whole point of this suite: each hard limit is checked at its
// boundary from both sides, so a future edit that turns an inclusive limit
// exclusive (or moves a number) fails here rather than in production. One
// table instead of eight tests, because every case asks the same question.
describe('runLimitViolation (RUN-72 hard limits)', () => {
  it.each([
    // [what, distanceKm, durationSeconds, legal?]
    ['exactly 150 km, at 6:00 /km', 150, 54_000, true],
    ['just over 150 km', 150.1, 54_036, false],
    ['exactly 24 h, at 14:24 /km', 100, 86_400, true],
    ['just over 24 h', 100, 86_401, false],
    ['exactly 2:30 /km', 10, 1_500, true],
    ['just faster than 2:30 /km', 10, 1_499, false],
    ['exactly 20:00 /km', 10, 12_000, true],
    ['just slower than 20:00 /km', 10, 12_001, false],
  ])('%s', (_case, distanceKm, durationSeconds, legal) => {
    const violation = runLimitViolation({
      distanceKm: distanceKm,
      durationSeconds: durationSeconds,
    });
    if (legal) {
      expect(violation).toBeNull();
    } else {
      // The message has to name what to fix; an empty or generic string
      // would satisfy "not null" while telling the runner nothing.
      expect(violation).toEqual(expect.stringMatching(/distanceKm|duration/));
    }
  });
});

// The soft threshold reads the other way round: exactly at it is ordinary,
// past it is flagged. Same table shape, both sides of both thresholds.
describe('isOutlierRun (RUN-72 leaderboard marker)', () => {
  it.each([
    ['exactly 60 km', 60, 21_600, false],
    ['just over 60 km', 60.1, 21_636, true],
    ['exactly 3:30 /km', 10, 2_100, false],
    ['just faster than 3:30 /km', 10, 2_099, true],
  ])('%s', (_case, distanceKm, durationSeconds, flagged) => {
    expect(
      isOutlierRun({
        distanceKm: distanceKm,
        durationSeconds: durationSeconds,
      }),
    ).toBe(flagged);
  });
});

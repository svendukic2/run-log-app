import { rankByDistance } from './ranking';

// Written for the event board in RUN-69, moved here with the function in
// RUN-70: both leaderboards rank through it, so the rule is tested once.
describe('rankByDistance', () => {
  it('shares a place between tied distances and skips the places they took', () => {
    const ranks = rankByDistance([
      { id: 'a', totalKm: 30, showOnLeaderboard: true },
      { id: 'b', totalKm: 42, showOnLeaderboard: true },
      { id: 'c', totalKm: 42, showOnLeaderboard: true },
      { id: 'hidden', totalKm: 99, showOnLeaderboard: false },
    ]);

    expect([...ranks]).toEqual([
      ['b', 1],
      ['c', 1],
      ['a', 3],
    ]);
  });
});

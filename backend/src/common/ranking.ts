// The ranking rules every leaderboard shares. Written for the event board
// in RUN-69, moved here in RUN-70 the moment the global weekly board became
// the second caller: the two must agree on what a tie is and on how many
// decimals a distance has, and one copy is how that stays true.
//
// Pure and dependency-free apart from the opt-in gate, so both boards are
// tested without a database.
import { appearsOnLeaderboard } from './privacy';

// Competition ranking: only opted-in runners are ranked at all, equal
// distances share a place, and the next distinct distance skips the places
// they consumed (1, 1, 3). The id tiebreak only fixes the sort's order
// among tied rows - they get the same rank either way - so the output is
// deterministic rather than dependent on the sort's stability.
export function rankByDistance(
  rows: Array<{ id: string; totalKm: number; showOnLeaderboard: boolean }>,
): Map<string, number> {
  const contenders = rows
    // The opt-in gate itself lives in common/privacy.ts since RUN-64, so
    // the event board and the global one read the same rule.
    .filter((row) => appearsOnLeaderboard(row))
    .sort((a, b) => b.totalKm - a.totalKm || a.id.localeCompare(b.id));

  const ranks = new Map<string, number>();
  let previousKm: number | null = null;
  let previousRank = 0;
  contenders.forEach((row, index) => {
    const rank = row.totalKm === previousKm ? previousRank : index + 1;
    ranks.set(row.id, rank);
    previousKm = row.totalKm;
    previousRank = rank;
  });
  return ranks;
}

// Distances were Floats until RUN-78, so summing them accumulated
// binary-fraction noise (0.1 + 0.2 = 0.30000000000000004) that both printed
// as 30.000000000000004 km and ordered two genuinely equal totals. That half
// of the reason is gone: the column is NUMERIC(5, 2) and Postgres sums it
// exactly. The half below is not, and it is the one that matters.
//
// One decimal, not two (RUN-69 review fix): the app renders distances to one
// decimal everywhere (frontend formatKm), so ranking on a finer number than
// the one on screen produces a leaderboard that reads as a bug - 12.34 km
// above 12.29 km, both printed "12.3 km". Rounding here makes the order and
// the rendered number agree, and two runners the UI shows as equal genuinely
// tie.
export function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

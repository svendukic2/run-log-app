// Pure types, guards and week arithmetic for the global weekly leaderboard
// (RUN-70), stateless by construction: no store, no window, no React. Split
// from the API-backed store (leaderboard.ts) for the same reason runMath.ts
// is split from runs.ts - request-independent pure helpers must never share
// a module with process-lifetime mutable state. Import from './leaderboard'
// (it re-exports everything here).

import { fromIsoDate, startOfWeek, toIsoDate, todayIso } from './runMath';

// The shared formatters the page leans on, so components importing from
// './leaderboard' need no second lib import for a number or a name.
export { formatKm } from './runMath';
export { initialsOf, formatRunCount } from './eventMath';

// A week IS a date window, so it prints through the same formatter the
// event cards use ("Aug 10 - Aug 16, 2026", both years spelled out across a
// year boundary). Aliased rather than re-implemented: two range formatters
// would drift on exactly that boundary rule.
export { formatEventWindow as formatWeekRange } from './eventMath';

// One runner's standing in one week, as GET /api/leaderboard serves it
// (LeaderboardRow in the backend's leaderboard.service.ts, the source of
// truth this hand-mirrors like every response shape). Nothing is nullable,
// unlike the event board's row: a runner who is off leaderboards is absent
// from this board entirely rather than present with withheld numbers.
// `me` is the caller's own row, answered by the API because the
// device-session frontend does not track its own user id.
export interface LeaderboardEntry {
  id: string;
  firstName: string;
  lastName: string;
  rank: number;
  totalKm: number;
  runCount: number;
  me: boolean;
  // RUN-72: at least one run behind this total is legal but unusual (very
  // fast or very long). The row draws a subtle marker for it; the server
  // decides, because the client is never sent the individual runs.
  unverified: boolean;
}

// One week of the board. `items` is the served top slice, `total` how many
// runners are ranked in the whole week, and `me` the caller's own row -
// repeated outside `items` so the page can pin it even when the caller
// ranks far below the slice (AC2). `me` is null exactly when the caller is
// off leaderboards (AC3).
export interface WeeklyLeaderboard {
  weekStart: string;
  weekEnd: string;
  items: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  total: number;
}

export function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  const row = value as LeaderboardEntry;
  return (
    typeof row?.id === 'string' &&
    typeof row.firstName === 'string' &&
    typeof row.lastName === 'string' &&
    typeof row.rank === 'number' &&
    typeof row.totalKm === 'number' &&
    typeof row.runCount === 'number' &&
    typeof row.me === 'boolean' &&
    typeof row.unverified === 'boolean'
  );
}

// Runtime guard for the whole envelope: a malformed body is an error with a
// name, never a silently empty board (the isRun precedent).
export function isWeeklyLeaderboard(value: unknown): value is WeeklyLeaderboard {
  const board = value as WeeklyLeaderboard;
  return (
    typeof board?.weekStart === 'string' &&
    typeof board.weekEnd === 'string' &&
    typeof board.total === 'number' &&
    Array.isArray(board.items) &&
    board.items.every(isLeaderboardEntry) &&
    (board.me === null || isLeaderboardEntry(board.me))
  );
}

// The Monday identifying the week the switcher opens on.
export function currentWeekStart(): string {
  return startOfWeek(todayIso());
}

// The Monday `weeks` weeks away, negative for the past. Calendar arithmetic
// through Date, so month and year boundaries need no special case.
export function shiftWeek(weekStart: string, weeks: number): string {
  const monday = fromIsoDate(weekStart);
  monday.setDate(monday.getDate() + 7 * weeks);
  return toIsoDate(monday);
}

// The Sunday closing the week. Derived on the client as well as served in
// the response, so the switcher can label a week before its board lands.
export function weekEndOf(weekStart: string): string {
  const sunday = fromIsoDate(weekStart);
  sunday.setDate(sunday.getDate() + 6);
  return toIsoDate(sunday);
}

// The switcher walks backwards only: a future week has no runs in it by
// definition, so offering one would be a guaranteed empty board (AC4 asks
// for previous weeks).
export function hasNextWeek(weekStart: string): boolean {
  return weekStart < currentWeekStart();
}

// The caller's row when it is NOT already among the served rows: exactly
// what the page pins below the table (AC2). Null when the caller is off
// leaderboards, and null when their row is already on screen - pinning a
// duplicate of a visible row would just read as a rendering bug.
export function pinnedSelfRow(board: WeeklyLeaderboard): LeaderboardEntry | null {
  if (!board.me) return null;
  return board.items.some((row) => row.me) ? null : board.me;
}

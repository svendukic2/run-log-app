'use client';

// The global weekly leaderboard's store (RUN-70), following the RUN-48
// pattern like every other store: an in-memory cache behind
// useSyncExternalStore, so the page reads synchronously.
//
// Shaped like eventParticipants.ts rather than runs.ts, and for the same
// reason: this is data keyed by ONE thing the screen has open - here the
// week, there the event - not app-wide data every screen shares. So the
// cache is a SINGLE SLOT holding whichever week is on screen rather than a
// map, and the loading and error states live in the board itself instead of
// a screen-level boundary. A map would only grow for the lifetime of the
// tab as the switcher walks backwards, and every week it held would be
// staler than a re-read.
//
// The slot is a render cache, not a source of truth: it is re-read on every
// visit and on every week change, because nothing here can know that
// someone (the caller included) logged a run since it filled.
import { useEffect, useSyncExternalStore } from 'react';
import { isWeeklyLeaderboard, type WeeklyLeaderboard } from './leaderboardMath';
import { ApiError, apiFetch } from './session';

export * from './leaderboardMath';

const LEADERBOARD_CHANGED_EVENT = 'runlog:leaderboard-changed';

export type LeaderboardStatus = 'loading' | 'ready' | 'error';

interface LeaderboardSnapshot {
  // Which week the cache currently describes; null before the first load.
  weekStart: string | null;
  status: LeaderboardStatus;
  board: WeeklyLeaderboard | null;
  error: string | null;
}

const INITIAL_SNAPSHOT: LeaderboardSnapshot = Object.freeze({
  weekStart: null,
  status: 'loading' as const,
  board: null,
  error: null,
});

let snapshot: LeaderboardSnapshot = INITIAL_SNAPSHOT;
// The week a load is currently running for, or null when none is. Read only
// to collapse React's double effect in development.
let inFlightFor: string | null = null;
// Bumped by every load, so a resolving answer can tell whether it is still
// the newest one. The week alone is not enough: clicking the switcher twice
// quickly races two loads, and without this the slower one wins simply by
// landing last - which is how a board ends up showing last week's rows
// under this week's heading.
let loadToken = 0;

function publish(next: LeaderboardSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new Event(LEADERBOARD_CHANGED_EVENT));
}

async function fetchBoard(weekStart: string): Promise<WeeklyLeaderboard> {
  const response = await apiFetch(`/api/leaderboard?weekStart=${weekStart}`);
  if (!response.ok) {
    throw new ApiError(`Loading the leaderboard failed (${response.status}).`, response.status);
  }
  const body: unknown = await response.json();
  // A malformed body is an error, not an empty week: an empty board would
  // claim nobody ran, which is a different and much more believable lie.
  if (!isWeeklyLeaderboard(body)) {
    throw new ApiError('The server returned a leaderboard in an unexpected shape.');
  }
  return body;
}

async function load(weekStart: string): Promise<void> {
  const token = (loadToken += 1);
  inFlightFor = weekStart;
  // Re-reading the week already on screen keeps its rows visible while the
  // fresh ones arrive: the same board, seconds older. Only a first read, a
  // different week, or a retry after failure blanks to 'loading'.
  const refreshingInPlace = snapshot.weekStart === weekStart && snapshot.status === 'ready';
  if (!refreshingInPlace) {
    publish({ weekStart, status: 'loading', board: null, error: null });
  }
  try {
    const board = await fetchBoard(weekStart);
    if (token !== loadToken) return;
    publish({ weekStart, status: 'ready', board, error: null });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Loading the leaderboard failed', error);
    }
    // A failed refresh must not throw away rows that were true a moment
    // ago; the next visit or the next week change corrects them.
    if (token !== loadToken || refreshingInPlace) return;
    publish({
      weekStart,
      status: 'error',
      board: null,
      error:
        error instanceof ApiError ? error.message : 'Something went wrong loading the leaderboard.',
    });
  } finally {
    if (token === loadToken) inFlightFor = null;
  }
}

// Reads one week, from an effect and never during render. Deliberately not
// "unless the cache already holds this week": a cache that skipped the read
// would keep serving the board from the first visit, so runs logged in
// between would never show up. One read per visit and per week change is
// the honest refresh, and it costs no spinner when the week is unchanged.
// The guard below only collapses React's double effect.
function ensureLoaded(weekStart: string): void {
  if (inFlightFor === weekStart) return;
  void load(weekStart);
}

// The retry handle for the board's own error card.
export function reloadLeaderboard(weekStart: string): void {
  void load(weekStart);
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(LEADERBOARD_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(LEADERBOARD_CHANGED_EVENT, onStoreChange);
  };
}

// The store for one week. While the cache still describes a DIFFERENT week
// (the beat between the switcher's click and the effect below), callers see
// 'loading' rather than the previous week's rows - a board under the wrong
// heading is worse than a spinner.
export function useWeeklyLeaderboard(weekStart: string): {
  status: LeaderboardStatus;
  board: WeeklyLeaderboard | null;
  error: string | null;
} {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  );

  useEffect(() => {
    ensureLoaded(weekStart);
  }, [weekStart]);

  if (current.weekStart !== weekStart) {
    return { status: 'loading', board: null, error: null };
  }
  return { status: current.status, board: current.board, error: current.error };
}

// Test-only: puts the cache into a known state without a fetch. Passing
// null re-arms the load (jest.setup.ts wires this up via leaderboardApiMock).
export function __resetLeaderboardForTests(board: WeeklyLeaderboard | null = null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetLeaderboardForTests is not available in production');
  }
  inFlightFor = null;
  loadToken += 1;
  snapshot =
    board === null
      ? INITIAL_SNAPSHOT
      : { weekStart: board.weekStart, status: 'ready', board, error: null };
}

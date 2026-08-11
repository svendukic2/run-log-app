// The test double for the global leaderboard API (RUN-70), a sibling of
// eventsApiMock: jest.setup.ts installs it before every test, and
// runsApiMock's fetch handler delegates /api/leaderboard requests here
// (after its own auth check), so every mock shares one fetch mock and one
// Bearer handshake. Tests seed synchronously through seedLeaderboard(),
// which also primes the store cache - assertions right after render() see
// the seeded week.
import {
  __resetLeaderboardForTests,
  currentWeekStart,
  weekEndOf,
  type LeaderboardEntry,
  type WeeklyLeaderboard,
} from '@/lib/leaderboard';
import { jsonResponse } from './apiMockShared';

// One board per week start, exactly what the endpoint serves.
let db = new Map<string, WeeklyLeaderboard>();

// Everything /api/leaderboard, called by runsApiMock's shared fetch handler
// AFTER the Bearer check passed. Unknown shapes fall through to the
// caller's loud throw.
export function handleLeaderboardRequest(url: string, method: string): Promise<Response> | null {
  if (!url.startsWith('/api/leaderboard') || method !== 'GET') return null;
  const weekStart =
    new URLSearchParams(url.split('?')[1] ?? '').get('weekStart') ?? currentWeekStart();
  return Promise.resolve(jsonResponse(200, db.get(weekStart) ?? emptyBoard(weekStart)));
}

// A week nobody ran in (and nobody is ranked in), the shape the real
// endpoint answers when it finds no opted-in runners.
function emptyBoard(weekStart: string): WeeklyLeaderboard {
  return { weekStart, weekEnd: weekEndOf(weekStart), items: [], me: null, total: 0 };
}

// Called from jest.setup.ts before every test: fresh backend, store re-armed.
export function installLeaderboardApiMock(): void {
  db = new Map();
  __resetLeaderboardForTests(null);
}

// Seeds one week's board in the in-memory backend AND primes the store
// cache. Ranks and totals are given, not derived: the server computes them,
// and a mock that re-derived them would be testing itself. `me` defaults to
// whichever seeded row is flagged - pass it explicitly for the row that is
// pinned from outside the served rows (AC2), and null for a caller who is
// off leaderboards (AC3).
export function seedLeaderboard(
  weekStart: string,
  drafts: Array<Partial<LeaderboardEntry> & { firstName: string }>,
  options: { me?: LeaderboardEntry | null; total?: number } = {},
): WeeklyLeaderboard {
  const items = drafts.map((draft, index) => ({
    id: `user-${draft.firstName.toLowerCase()}`,
    lastName: 'Tester',
    rank: index + 1,
    totalKm: 0,
    runCount: 0,
    me: false,
    ...draft,
  })) as LeaderboardEntry[];
  const board: WeeklyLeaderboard = {
    weekStart,
    weekEnd: weekEndOf(weekStart),
    items,
    me: 'me' in options ? (options.me ?? null) : (items.find((row) => row.me) ?? null),
    total: options.total ?? items.length,
  };
  db.set(weekStart, board);
  __resetLeaderboardForTests(board);
  return board;
}

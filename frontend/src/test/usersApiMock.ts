// The test double for the users API (RUN-63's GET /api/users/:id, plus the
// RUN-61 follow verbs the profile header calls), a sibling of eventsApiMock
// and notificationsApiMock: jest.setup.ts installs it before every test, and
// runsApiMock's fetch handler delegates /api/users requests here after its
// own Bearer check, so every mock shares one fetch mock and one auth
// handshake. Tests seed synchronously through seedPublicProfile(), which
// also primes the store cache.
//
// The mock applies the gate exactly where the real server does: seeds
// declare a runner's privacy settings and their runs, and this module
// decides what the response carries. A test therefore cannot accidentally
// prove the gate by seeding an already-gated payload.
import { __resetPublicProfileForTests, type PublicProfile } from '@/lib/publicProfile';
import { type Run } from '@/lib/runs';
import { __resetUserSearchForTests, type UserSearchResult } from '@/lib/userSearch';
import { jsonResponse } from './apiMockShared';

// One seeded account, as the backend stores it: identity, privacy settings,
// follow state and the full run log. The response is derived from this.
interface SeededUser {
  id: string;
  firstName: string;
  lastName: string;
  profilePublic: boolean;
  showRoutes: boolean;
  me: boolean;
  following: boolean;
  followers: number;
  followingCount: number;
  runs: Run[];
}

let db = new Map<string, SeededUser>();
// When set, matching /api/users requests fail with the given status before
// reaching the in-memory backend (failUsersApi below).
let failure: { method: string; status: number } | null = null;
// The caller's own follower count, which no seeded row implies (seeding
// someone does not make them follow you). seedRunners sets it.
let myFollowerCount = 0;
// When set, the NEXT search request is parked until the test lets it go
// (holdNextSearch below), so an out-of-order answer can be staged.
let holdNextSearch_ = false;
let releaseHeld: (() => void) | null = null;

// A stand-in for the middle of a stored polyline, as the server sends it to a
// granted stranger (RUN-55 AC4).
//
// The real trim is geometry: decode the line, drop every point within 300 m of
// either end, re-encode what is left (backend/src/runs/route-trim.ts, where it
// is unit-tested). A frontend mock has no business re-implementing that, and a
// second implementation would only be a second thing to get wrong. What a
// frontend test does need to know is that a visitor's payload carries a
// DIFFERENT, shorter polyline and no waypoints at all - so that is what this
// produces, the same value whatever was stored. Exported so a test can assert
// the map drew the trimmed line rather than the stored one.
export const TRIMMED_POLYLINE = 'kip_I{}tpAcG{h@';

// What one run looks like to this viewer. Applied here rather than left to the
// seed for the same reason the gate above is: a test must not be able to prove
// the trim by seeding an already-trimmed route.
function gateRoute(run: Run, isOwner: boolean, granted: boolean): Run {
  if (!run.route || !granted) return { ...run, route: null };
  if (isOwner) return run;
  return {
    ...run,
    route: { ...run.route, polyline: TRIMMED_POLYLINE, waypoints: [], trimmed: true },
  };
}

// The server stamps createdAt on every run it serves, this profile's included
// (RUN-78), and publicProfile.ts validates the body with isRun, which refuses
// one without it. Filled in here rather than in every seeded fixture, for the
// same reason the route gate lives here: what the API sends is the mock's job,
// not the test's. A seeded value wins, so a test can still pin an order.
function withCreatedAt(run: Run, index: number): Run {
  if (run.createdAt) return run;
  return {
    ...run,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  };
}

// The server-side gate, mirrored: a private profile answers 200 with no
// body below the header, and only the owner overrides it.
function toResponse(user: SeededUser): PublicProfile {
  const visible = user.me || user.profilePublic;
  const routesGranted = user.me || (visible && user.showRoutes);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    me: user.me,
    following: user.following,
    counts: { followers: user.followers, following: user.followingCount },
    visible,
    showRoutes: routesGranted,
    runs: visible
      ? user.runs.map((run, index) =>
          withCreatedAt(gateRoute(run, user.me, routesGranted), index),
        )
      : null,
  };
}

// The caller's own follow counts, as the search envelope carries them. The
// "following" half is DERIVED from the seeded rows rather than stored, so a
// follow issued through the mock moves it exactly like the real one does.
function myCounts(): { followers: number; following: number } {
  return {
    followers: myFollowerCount,
    following: [...db.values()].filter((user) => !user.me && user.following).length,
  };
}

// The server-side search (RUN-62), mirrored: every whitespace-separated
// term must appear in one half of the name or the other, case-insensitively,
// and the caller is never a row.
function searchRows(rawQuery: string): UserSearchResult['items'] {
  const terms = rawQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return [...db.values()]
    .filter((user) => !user.me)
    .filter((user) =>
      terms.every((term) =>
        [user.firstName, user.lastName].some((name) => name.toLowerCase().includes(term)),
      ),
    )
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.id.localeCompare(b.id))
    .map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      following: user.following,
    }));
}

// Everything /api/users, called by runsApiMock's shared fetch handler AFTER
// the Bearer check passed. Unknown shapes fall through to the caller's loud
// throw.
export function handleUsersRequest(url: string, method: string): Promise<Response> | null {
  if (failure && failure.method === method) {
    return Promise.resolve(jsonResponse(failure.status, { message: 'Simulated failure' }));
  }

  // The search, before the /:id match below: '/api/users?search=' is the
  // collection, not a user whose id starts with a question mark.
  if (url.startsWith('/api/users?') && method === 'GET') {
    const search = new URLSearchParams(url.split('?')[1] ?? '').get('search') ?? '';
    const items = searchRows(search);
    const body: UserSearchResult = {
      items,
      total: items.length,
      page: 1,
      pageSize: 20,
      counts: myCounts(),
    };
    // A held request answers only when the test releases it, with the body
    // as it was AT REQUEST TIME - which is what makes a released answer a
    // genuinely stale one. One shot: everything after it is served normally.
    if (holdNextSearch_) {
      holdNextSearch_ = false;
      return new Promise<Response>((resolve) => {
        releaseHeld = () => resolve(jsonResponse(200, body));
      });
    }
    return Promise.resolve(jsonResponse(200, body));
  }

  const follow = url.match(/^\/api\/users\/([^/]+)\/follow$/);
  if (follow && (method === 'POST' || method === 'DELETE')) {
    const user = db.get(follow[1]);
    if (!user) return Promise.resolve(jsonResponse(404, { message: 'Not found' }));
    // Idempotent both ways, like the real endpoint: the count only moves on
    // a genuine flip.
    const next = method === 'POST';
    if (user.following !== next) {
      user.following = next;
      user.followers += next ? 1 : -1;
    }
    return Promise.resolve(
      method === 'POST' ? jsonResponse(200, { following: true }) : jsonResponse(204, null),
    );
  }

  const byId = url.match(/^\/api\/users\/([^/]+)$/);
  if (byId && method === 'GET') {
    const user = db.get(byId[1]);
    // Only an unknown id is 404; a private account is a normal 200 above.
    return Promise.resolve(
      user ? jsonResponse(200, toResponse(user)) : jsonResponse(404, { message: 'Not found' }),
    );
  }

  return null;
}

// Called from jest.setup.ts before every test: fresh backend, both stores
// re-armed (the profile's and the People search's).
export function installUsersApiMock(): void {
  db = new Map();
  failure = null;
  myFollowerCount = 0;
  holdNextSearch_ = false;
  releaseHeld = null;
  __resetPublicProfileForTests(null);
  __resetUserSearchForTests(null);
}

// Parks the next search response and hands back its release, so a test can
// let a SLOW answer land after a newer one and prove the store's load token
// discards it.
export function holdNextSearch(): () => void {
  holdNextSearch_ = true;
  return () => {
    releaseHeld?.();
    releaseHeld = null;
  };
}

// Seeds runners the People search can find (RUN-62). Unlike
// seedPublicProfile it primes no store cache: the search always runs
// through a real request, because the debounce and the query are what the
// tests are watching.
export function seedRunners(
  drafts: Array<Partial<SeededUser> & { firstName: string }>,
  options: { myFollowers?: number } = {},
): void {
  for (const draft of drafts) {
    const user: SeededUser = {
      id: `user-${draft.firstName.toLowerCase()}`,
      lastName: 'Tester',
      profilePublic: false,
      showRoutes: false,
      me: false,
      following: false,
      followers: 0,
      followingCount: 0,
      runs: [],
      ...draft,
    };
    db.set(user.id, user);
  }
  myFollowerCount = options.myFollowers ?? myFollowerCount;
}

// Seeds one runner in the mock backend AND primes the store cache, so the
// profile is on screen from the first render. Defaults are the safe ones a
// fresh account really has: private on every count, nobody following.
export function seedPublicProfile(
  draft: Partial<SeededUser> & { firstName: string },
): PublicProfile {
  const user: SeededUser = {
    id: `user-${draft.firstName.toLowerCase()}`,
    lastName: 'Tester',
    profilePublic: false,
    showRoutes: false,
    me: false,
    following: false,
    followers: 0,
    followingCount: 0,
    runs: [],
    ...draft,
  };
  db.set(user.id, user);
  const response = toResponse(user);
  __resetPublicProfileForTests(response);
  return response;
}

// Re-arms the initial load against a failing GET: the store lands in
// 'error' once the profile view mounts.
export function makeProfileReadFail(status = 500): void {
  failure = { method: 'GET', status };
  __resetPublicProfileForTests(null);
}

// Makes the follow verbs fail, so the header's inline role="alert" line has
// something to report.
export function failFollowApi(method: 'POST' | 'DELETE', status = 500): void {
  failure = { method, status };
}

// Re-arms the initial load without seeding anyone: the next read 404s and
// the page shows its not-found state (AC5).
export function armProfileLoad(): void {
  __resetPublicProfileForTests(null);
}

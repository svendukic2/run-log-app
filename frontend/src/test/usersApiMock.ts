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

// The server-side gate, mirrored: a private profile answers 200 with no
// body below the header, and only the owner overrides it.
function toResponse(user: SeededUser): PublicProfile {
  const visible = user.me || user.profilePublic;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    me: user.me,
    following: user.following,
    counts: { followers: user.followers, following: user.followingCount },
    visible,
    showRoutes: user.me || (visible && user.showRoutes),
    runs: visible ? user.runs : null,
  };
}

// Everything /api/users, called by runsApiMock's shared fetch handler AFTER
// the Bearer check passed. Unknown shapes fall through to the caller's loud
// throw.
export function handleUsersRequest(url: string, method: string): Promise<Response> | null {
  if (failure && failure.method === method) {
    return Promise.resolve(jsonResponse(failure.status, { message: 'Simulated failure' }));
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

// Called from jest.setup.ts before every test: fresh backend, store re-armed.
export function installUsersApiMock(): void {
  db = new Map();
  failure = null;
  __resetPublicProfileForTests(null);
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

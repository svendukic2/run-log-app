// The test double for the app API (runs since RUN-48; profile, goal and
// week targets since RUN-50). jest.setup.ts installs it before every test,
// so component tests run against an in-memory backend with the same
// contract as /api/*, including the auth handshake: the guarded endpoints
// demand a Bearer token this mock itself issued, so the session layer is
// exercised (and can be expired) rather than waved through. Tests seed
// synchronously through seedRuns()/seedProfile()/seedGoal(), which also
// prime the store caches - assertions right after render() keep working
// exactly as they did when the stores were localStorage.
import { type ProfileRecord, type WeekTarget } from '@/lib/accountApi';
import { __resetGoalStoreForTests, todayIso, type Goal } from '@/lib/goal';
import { __resetProfileStoreForTests } from '@/lib/onboarding';
import { __resetRunsStoreForTests, startOfWeek, type Run } from '@/lib/runs';
import { __resetSessionForTests, __setHardNavigateForTests, hasStoredSession } from '@/lib/session';
import { jsonResponse } from './apiMockShared';
import { handleEventsRequest } from './eventsApiMock';
import { handleNotificationsRequest } from './notificationsApiMock';

let db: Run[] = [];
let idCounter = 0;
let tokenCounter = 0;
let validTokens = new Set<string>();
// When set, matching requests fail with the given status before reaching
// the in-memory backend (failRunsApi below).
let failure: { method: string; status: number } | null = null;
// Route names whose POST the mock rejects with 400, like the real DTO
// validation would (rejectRunsNamed below).
let rejectedNames = new Set<string>();
// When true, the auth endpoints behave like an identity that cannot
// authenticate: login 401, signup 409.
let authBroken = false;
// When true, GET /api/runs never resolves (until its AbortSignal fires):
// holds the store in 'loading'.
let holdLoading = false;
// The account resources (RUN-50). One implicit account: the mock does not
// model multi-user isolation, only the contract shapes.
let profileDb: ProfileRecord | null = null;
let goalDb: Goal | null = null;
let weekTargetsDb = new Map<string, number>();
// Statuses to fail the account GETs with (makeProfileLoadFail and friends).
let profileFailure: number | null = null;
let goalFailure: number | null = null;
// Statuses to fail the account PUTs with (failProfileApi / failWeekTargetApi):
// the pessimistic-save error paths in Settings and on the plan card.
let profilePutFailure: number | null = null;
let weekTargetPutFailure: number | null = null;

function nextId(): string {
  idCounter += 1;
  // Padded so lexicographic id order equals insertion order ('run-000010'
  // sorts after 'run-000009', unlike 'run-10' vs 'run-9').
  return `run-${String(idCounter).padStart(6, '0')}`;
}

function mintToken(): string {
  tokenCounter += 1;
  const token = `test-token-${tokenCounter}`;
  validTokens.add(token);
  return token;
}

// Newest first: date descending, id descending, matching the real endpoint
// (and compareRunsNewestFirst on the client).
function sorted(): Run[] {
  return [...db].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

// What a fresh week's target snapshots to: the same seed order as the real
// server (backend snapshotKm).
function seedKm(): number {
  return profileDb?.defaultWeeklyGoalKm ?? goalDb?.km ?? 20;
}

// jsonResponse now lives in apiMockShared (imported above), so the events
// mock mints identical fake Responses instead of keeping a second copy.
function authorized(init: RequestInit): boolean {
  const header = (init.headers as Record<string, string> | undefined)?.Authorization ?? '';
  const token = header.replace(/^Bearer /, '');
  return validTokens.has(token);
}

function handle(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init.method ?? 'GET').toUpperCase();

  if (url === '/api/auth/login' || url === '/api/auth/signup') {
    // CONTRACT (RUN-56, load-bearing for RUN-50): signup creates a User row
    // and NOTHING else - deliberately no profileDb write here, because
    // "onboarding complete" is derived from the profile's existence
    // (onboarding.ts header). If the real signup ever starts creating
    // profile rows, this mock must change WITH it or the frontend tests go
    // green while production routes every fresh device to the dashboard.
    if (authBroken) {
      return Promise.resolve(
        jsonResponse(url.endsWith('signup') ? 409 : 401, { message: 'Invalid credentials' }),
      );
    }
    return Promise.resolve(
      jsonResponse(url.endsWith('signup') ? 201 : 200, {
        token: mintToken(),
        user: {
          id: 'user-test',
          email: 'runner@device.runlog',
          firstName: 'Test',
          lastName: 'Runner',
        },
      }),
    );
  }

  if (url.startsWith('/api/runs')) {
    if (!authorized(init)) {
      return Promise.resolve(jsonResponse(401, { message: 'Missing bearer token' }));
    }
    if (failure && failure.method === method) {
      return Promise.resolve(jsonResponse(failure.status, { message: 'Simulated failure' }));
    }
  }

  // The account endpoints (RUN-49 contract, consumed since RUN-50). Guarded
  // like the real thing.
  if (url === '/api/profile' || url === '/api/goal' || url.startsWith('/api/week-targets')) {
    if (!authorized(init)) {
      return Promise.resolve(jsonResponse(401, { message: 'Missing bearer token' }));
    }
  }

  if (url === '/api/profile' && method === 'GET') {
    if (profileFailure)
      return Promise.resolve(jsonResponse(profileFailure, { message: 'Simulated failure' }));
    return Promise.resolve(
      profileDb
        ? jsonResponse(200, profileDb)
        : jsonResponse(404, { message: 'Profile not found' }),
    );
  }

  if (url === '/api/profile' && method === 'PUT') {
    if (profilePutFailure) {
      return Promise.resolve(jsonResponse(profilePutFailure, { message: 'Simulated failure' }));
    }
    const record = JSON.parse(String(init.body)) as ProfileRecord;
    // SET-6, as the real server does it: a changed default freezes the
    // running week under the OLD seed first (first create excluded).
    if (profileDb && profileDb.defaultWeeklyGoalKm !== record.defaultWeeklyGoalKm) {
      const week = startOfWeek(todayIso());
      if (!weekTargetsDb.has(week)) weekTargetsDb.set(week, seedKm());
    }
    profileDb = {
      ...record,
      firstName: record.firstName.trim(),
      lastName: record.lastName.trim(),
      email: record.email.trim(),
    };
    return Promise.resolve(jsonResponse(200, profileDb));
  }

  if (url === '/api/goal' && method === 'GET') {
    if (goalFailure)
      return Promise.resolve(jsonResponse(goalFailure, { message: 'Simulated failure' }));
    return Promise.resolve(
      goalDb ? jsonResponse(200, goalDb) : jsonResponse(404, { message: 'Goal not found' }),
    );
  }

  if (url === '/api/goal' && method === 'PUT') {
    const body = JSON.parse(String(init.body)) as Goal;
    if (!profileDb && goalDb && goalDb.km !== body.km) {
      // Goal is the seed while no profile exists: same freeze rule.
      const week = startOfWeek(todayIso());
      if (!weekTargetsDb.has(week)) weekTargetsDb.set(week, seedKm());
    }
    goalDb = { km: body.km, startDate: body.startDate, endDate: body.endDate ?? null };
    return Promise.resolve(jsonResponse(200, goalDb));
  }

  const weekTargetMatch = url.match(/^\/api\/week-targets\/(\d{4}-\d{2}-\d{2})$/);
  if (weekTargetMatch) {
    const weekStart = weekTargetMatch[1];
    const currentWeek = startOfWeek(todayIso());
    if (method === 'GET') {
      if (goalFailure)
        return Promise.resolve(jsonResponse(goalFailure, { message: 'Simulated failure' }));
      const existing = weekTargetsDb.get(weekStart);
      if (existing !== undefined) {
        return Promise.resolve(jsonResponse(200, { weekStart, targetKm: existing }));
      }
      // Creation only for the current week (the RUN-49 snapshot rule);
      // everything else is an honest 404.
      if (weekStart !== currentWeek) {
        return Promise.resolve(jsonResponse(404, { message: 'No target for that week' }));
      }
      const targetKm = seedKm();
      weekTargetsDb.set(weekStart, targetKm);
      return Promise.resolve(jsonResponse(200, { weekStart, targetKm }));
    }
    if (method === 'PUT') {
      if (weekTargetPutFailure) {
        return Promise.resolve(
          jsonResponse(weekTargetPutFailure, { message: 'Simulated failure' }),
        );
      }
      if (weekStart !== currentWeek) {
        return Promise.resolve(
          jsonResponse(400, { message: 'weekStart must be the current week' }),
        );
      }
      const { targetKm } = JSON.parse(String(init.body)) as { targetKm: number };
      weekTargetsDb.set(weekStart, targetKm);
      return Promise.resolve(jsonResponse(200, { weekStart, targetKm }));
    }
  }

  if (url === '/api/runs' && method === 'GET') {
    if (holdLoading) {
      // Never resolves on its own; rejects if the caller's timeout aborts,
      // like a real fetch would.
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
    }
    return Promise.resolve(jsonResponse(200, sorted()));
  }

  if (url === '/api/runs' && method === 'POST') {
    const draft = JSON.parse(String(init.body)) as Omit<Run, 'id'>;
    if (rejectedNames.has(draft.routeName)) {
      return Promise.resolve(jsonResponse(400, { message: ['routeName rejected'] }));
    }
    const run: Run = {
      ...draft,
      effort: draft.effort ?? 'Medium',
      note: draft.note ?? '',
      id: nextId(),
    };
    db.push(run);
    return Promise.resolve(jsonResponse(201, run));
  }

  // The events API (RUN-68) lives in its own module but shares this fetch
  // mock and its Bearer handshake, so the session layer is exercised for
  // both stores the same way.
  if (url.startsWith('/api/events')) {
    if (!authorized(init)) {
      return Promise.resolve(jsonResponse(401, { message: 'Missing bearer token' }));
    }
    const handled = handleEventsRequest(url, method, init);
    if (handled) return handled;
  }

  // The notifications API (RUN-65, consumed by the bell in RUN-66): same
  // arrangement as the events mock, one fetch mock and one Bearer handshake
  // for all three stores.
  if (url.startsWith('/api/me/notifications')) {
    if (!authorized(init)) {
      return Promise.resolve(jsonResponse(401, { message: 'Missing bearer token' }));
    }
    const handled = handleNotificationsRequest(url, method);
    if (handled) return handled;
  }

  const byId = url.match(/^\/api\/runs\/([^/]+)$/);
  if (byId) {
    const index = db.findIndex((run) => run.id === byId[1]);
    if (method === 'GET') {
      return Promise.resolve(
        index === -1 ? jsonResponse(404, { message: 'Not found' }) : jsonResponse(200, db[index]),
      );
    }
    if (method === 'PATCH') {
      if (index === -1) return Promise.resolve(jsonResponse(404, { message: 'Not found' }));
      db[index] = { ...db[index], ...(JSON.parse(String(init.body)) as Partial<Run>) };
      return Promise.resolve(jsonResponse(200, db[index]));
    }
    if (method === 'DELETE') {
      if (index === -1) return Promise.resolve(jsonResponse(404, { message: 'Not found' }));
      db.splice(index, 1);
      return Promise.resolve(jsonResponse(200, { deleted: true }));
    }
  }

  // Loud, so a new endpoint cannot silently pass tests against nothing.
  throw new Error(`runsApiMock: unhandled ${method} ${url}`);
}

// Called from jest.setup.ts before every test: fresh backend, fetch mock in
// place, store primed to ready-and-empty (the state the old localStorage
// store woke up in). Tests that need the loading or error path use the
// helpers below.
export function installRunsApiMock(): void {
  db = [];
  idCounter = 0;
  tokenCounter = 0;
  validTokens = new Set();
  failure = null;
  rejectedNames = new Set();
  authBroken = false;
  holdLoading = false;
  profileDb = null;
  goalDb = null;
  weekTargetsDb = new Map();
  profileFailure = null;
  goalFailure = null;
  profilePutFailure = null;
  weekTargetPutFailure = null;
  signInRedirects = 0;
  hardNavigations = [];
  // jsdom cannot navigate; the session layer's full-load navigations become
  // a recorded list (and the sign-out redirect a counter) tests assert on.
  __setHardNavigateForTests((path) => {
    hardNavigations.push(path);
    if (path === '/signin') signInRedirects += 1;
  });
  global.fetch = jest.fn(handle) as unknown as typeof fetch;
  __resetRunsStoreForTests([]);
  // Every store starts 'ready' and empty, the state a fresh device wakes up
  // in, so component tests render synchronously; seeding helpers below
  // prime data the same way.
  __resetProfileStoreForTests(null);
  __resetGoalStoreForTests({ goal: null, weekTarget: null });
  // The in-memory session outlives the localStorage wipe and would leak
  // identities (with now-invalidated tokens) between tests.
  __resetSessionForTests();
  // Every test starts SIGNED IN with an empty backend (RUN-58): the app's
  // guarded screens only ever render with a session, and write paths throw
  // without one. Tests for the signed-out state clear localStorage and
  // re-arm the stores themselves.
  plantTestSession();
}

// Seeds the in-memory backend AND primes the store cache, so the seeded
// runs are on screen from the first render with no async settling.
export function seedRuns(drafts: Array<Omit<Run, 'id'> & { id?: string }>): Run[] {
  const runs = drafts.map((draft) => ({ ...draft, id: draft.id ?? nextId() }));
  db.push(...runs);
  __resetRunsStoreForTests(sorted());
  return runs;
}

// Plants a stored session with a valid token, as a signed-in returning
// user would have (RUN-58: token and email only, never a password). The
// load path skips the network entirely without a session, so tests
// exercising the initial load call this first.
export function plantTestSession(): void {
  const token = mintToken();
  window.localStorage.setItem(
    'runlog.session',
    JSON.stringify({ email: 'test@example.com', token }),
  );
  // Warm the session layer's memory copy (memory-first, like the real app):
  // a suite-level localStorage.clear() then does NOT sign the test out,
  // mirroring how clearing storage in devtools does not sign out a live
  // tab. Tests that want the signed-out state call clearTestSession().
  hasStoredSession();
}

// Signs the test out completely: memory copy and stored key both gone.
export function clearTestSession(): void {
  __resetSessionForTests();
  try {
    window.localStorage.removeItem('runlog.session');
  } catch {
    // jsdom storage never throws; parity with the app's own guards.
  }
}

// Invalidates every token issued so far: the next guarded request 401s and
// the session layer signs out (there is no refresh endpoint, RUN-74).
export function expireRunsTokens(): void {
  validTokens.clear();
}

// How many times an expired/missing session made the session layer redirect
// to Sign in (RUN-58 AC6). Reset by installRunsApiMock.
let signInRedirects = 0;

export function signInRedirectCount(): number {
  return signInRedirects;
}

// Every full-load navigation the session layer performed (sign-out
// redirects AND post-auth landings), in order. Reset by installRunsApiMock.
let hardNavigations: string[] = [];

export function hardNavigationsMade(): string[] {
  return [...hardNavigations];
}

// Makes /api/runs requests with the given method fail. The store keeps
// whatever it already has.
export function failRunsApi(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', status = 500): void {
  failure = { method, status };
}

export function restoreRunsApi(): void {
  failure = null;
}

// Re-arms the initial load and holds it in flight: the store stays
// 'loading' until the request's own timeout aborts it.
export function holdRunsLoading(): void {
  plantTestSession();
  holdLoading = true;
  __resetRunsStoreForTests(null);
}

// Re-arms the initial load against a failing GET: the store lands in
// 'error' once a runs hook mounts.
export function makeRunsLoadFail(status = 500): void {
  plantTestSession();
  failRunsApi('GET', status);
  __resetRunsStoreForTests(null);
}

// Plants v1 localStorage data (pre-RUN-48) and re-arms the initial load, so
// a test can watch the one-time import run.
export function seedLegacyRuns(runs: Run[]): void {
  window.localStorage.setItem('runlog.runs', JSON.stringify(runs));
  __resetRunsStoreForTests(null);
}

// Makes POSTs for runs with this exact routeName 400, the way the real
// DTO validation rejects rows the v1 forms never policed.
export function rejectRunsNamed(routeName: string): void {
  rejectedNames.add(routeName);
}

// Breaks authentication: login 401s (wrong email or password) and signup
// 409s (the email already has an account).
export function breakRunsAuth(): void {
  authBroken = true;
}

/* Account resources (RUN-50) ------------------------------------------------ */

// Seeds the profile in the mock backend AND primes the profile store, so
// an onboarded account is on screen from the first render. The display
// fields are enough; level and default fill with the onboarding defaults.
export function seedProfile(
  profile: Partial<ProfileRecord> & { firstName: string; lastName: string; email: string },
): ProfileRecord {
  profileDb = {
    runningLevel: 'Beginner',
    defaultWeeklyGoalKm: 20,
    ...profile,
  };
  __resetProfileStoreForTests(profileDb);
  return profileDb;
}

// Seeds the onboarding goal and primes the goal store. The current week's
// target stays unmaterialized: useGoalTarget answers with the seed (which
// equals goal km unless a profile default overrides it), exactly like a
// fresh page load before the week's row exists.
export function seedGoal(goal: Goal): Goal {
  goalDb = goal;
  __resetGoalStoreForTests({ goal, weekTarget: null });
  return goal;
}

// Materializes the CURRENT week's target at the given km, in the backend
// and the store cache - the state after a week was displayed or a coach
// target applied.
export function seedWeekTarget(targetKm: number): WeekTarget {
  const weekTarget = { weekStart: startOfWeek(todayIso()), targetKm };
  weekTargetsDb.set(weekTarget.weekStart, targetKm);
  __resetGoalStoreForTests({ goal: goalDb, weekTarget });
  return weekTarget;
}

// Re-arms the profile store's initial load against a failing GET: the
// store lands in 'error' once a profile hook mounts (boundary tests).
export function makeProfileLoadFail(status = 500): void {
  plantTestSession();
  profileFailure = status;
  __resetProfileStoreForTests();
}

// Same for the goal store (its load also covers the week target GET).
export function makeGoalLoadFail(status = 500): void {
  plantTestSession();
  goalFailure = status;
  __resetGoalStoreForTests();
}

// Makes PUT /api/profile fail with the given status: the Settings save must
// keep the failure on screen instead of pretending anything was stored
// (failRunsApi's counterpart for the profile endpoint).
export function failProfileApi(status = 500): void {
  profilePutFailure = status;
}

// Makes PUT /api/week-targets/<week> fail: "Apply to weekly goal" resolves
// false and the plan card owns the failure inline.
export function failWeekTargetApi(status = 500): void {
  weekTargetPutFailure = status;
}

// Clear the planted profile failures again (GET and PUT alike,
// restoreRunsApi's sibling), so a test can watch a retry actually recover.
export function restoreProfileApi(): void {
  profileFailure = null;
  profilePutFailure = null;
}

// Makes the goal-side GETs (/api/goal and /api/week-targets/:weekStart)
// fail with the given status WITHOUT re-arming the store, unlike
// makeGoalLoadFail: for testing failures that hit an already-ready store
// (the week-rollover refresh).
export function failGoalApi(status = 500): void {
  goalFailure = status;
}

export function restoreGoalApi(): void {
  goalFailure = null;
}

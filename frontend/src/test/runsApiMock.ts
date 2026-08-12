// The test double for the app API (runs since RUN-48; profile, goal and
// week targets since RUN-50). jest.setup.ts installs it before every test,
// so component tests run against an in-memory backend with the same
// contract as /api/*, including the auth handshake: the guarded endpoints
// demand a Bearer token this mock itself issued, so the session layer is
// exercised (and can be expired) rather than waved through. Tests seed
// synchronously through seedRuns()/seedProfile()/seedGoal(), which also
// prime the store caches - assertions right after render() keep working
// exactly as they did when the stores were localStorage.
import {
  type AccountRecord,
  type PrivacySettings,
  type ProfileRecord,
  type WeekTarget,
} from '@/lib/accountApi';
import { __resetAccountStoreForTests } from '@/lib/account';
import { __resetGoalStoreForTests, todayIso, type Goal } from '@/lib/goal';
import { __resetProfileStoreForTests } from '@/lib/onboarding';
import { __resetPrivacyStoreForTests, PRIVACY_DEFAULTS } from '@/lib/privacy';
import {
  __resetRunsStoreForTests,
  startOfWeek,
  type Run,
  type RouteWaypoint,
  type RunDraft,
} from '@/lib/runs';
import { __resetSessionForTests, __setHardNavigateForTests, hasStoredSession } from '@/lib/session';
import { jsonResponse } from './apiMockShared';
import { resetLeafletMock } from './leafletMock';
import { handleEventsRequest } from './eventsApiMock';
import { handleLeaderboardRequest } from './leaderboardApiMock';
import { handleNotificationsRequest } from './notificationsApiMock';
import { handleUsersRequest } from './usersApiMock';

let db: Run[] = [];
let idCounter = 0;
let createdAtCounter = 0;
let tokenCounter = 0;
let validTokens = new Set<string>();

// Tokens POST /api/auth/refresh will still renew (RUN-74). A token normally
// leaves `validTokens` (the guard rejects it) long before it leaves this
// set, which is exactly the state the renewal path exists for; a token in
// neither set is a session that is over.
let refreshableTokens = new Set<string>();
// When set, POST /api/auth/refresh answers with this status instead of
// renewing (failRunsRefresh below).
let refreshFailure: number | null = null;
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
// The signed-in account's identity (RUN-59), created by signup like the
// real backend does.
let accountDb: AccountRecord = { firstName: 'Test', lastName: 'Runner', email: 'test@example.com' };
let accountFailure: number | null = null;
let accountPutFailure: number | null = null;
let profileDb: ProfileRecord | null = null;
let goalDb: Goal | null = null;
let weekTargetsDb = new Map<string, number>();
// The account's privacy settings (RUN-64). A fresh account starts at the
// schema defaults - all three false - like a real signup does.
let privacyDb: PrivacySettings = { ...PRIVACY_DEFAULTS };
let privacyPutFailure: number | null = null;
// Statuses to fail the account GETs with (makeProfileLoadFail and friends).
let profileFailure: number | null = null;
let goalFailure: number | null = null;
// Statuses to fail the account PUTs with (failProfileApi / failWeekTargetApi):
// the pessimistic-save error paths in Settings and on the plan card.
let profilePutFailure: number | null = null;
let weekTargetPutFailure: number | null = null;

/* The routing proxy (RUN-53 endpoint, RUN-54 consumer) ---------------------- */

// The provider the real endpoint echoes and the server stores in
// Run.routeSource.
const ROUTE_PLAN_SOURCE = 'openrouteservice';

// What POST /api/routes/plan answers with, and every point list it was asked
// about (in order), so a test can assert the start/waypoints/finish split the
// endpoint's request shape needs.
let routePlanResult = {
  polyline: 'wap_IsyspAsFgc@cG{h@qFe{A',
  distanceKm: 5.1,
  durationSeconds: 3800,
};
let routePlanRequests: RouteWaypoint[][] = [];
let routePlanFailure: { status: number; code: string; message: string } | null = null;
// When set, plan requests wait on this before answering (holdRoutePlan below).
let routePlanGate: Promise<void> | null = null;

// The real API's whitelist pipe (forbidNonWhitelisted) rejects any property a
// DTO does not declare, NESTED ONES INCLUDED - and RunRouteDto deliberately
// declares no `source`, because provenance is the server's to stamp. Mirroring
// that here is not pedantry: a mock that accepts whatever the client sends
// turns "every save of a routed run is a 400" into a green test suite.
function routeRejection(route: RunDraft['route']): Response | null {
  if (!route) return null;
  const unknown = Object.keys(route).filter((key) => key !== 'polyline' && key !== 'waypoints');
  if (unknown.length === 0) return null;
  return jsonResponse(400, {
    message: unknown.map((key) => `property route.${key} should not exist`),
  });
}

// What the server stores and echoes for a submitted route: the two accepted
// fields plus its own source. Never trimmed: /api/runs only ever serves the
// caller their OWN runs, and the ~300 m trim is for strangers (RUN-55 AC3).
// Somebody else's trimmed route comes from usersApiMock instead.
function storedRoute(route: RunDraft['route']): Run['route'] {
  if (!route) return null;
  return {
    polyline: route.polyline,
    waypoints: route.waypoints,
    source: ROUTE_PLAN_SOURCE,
    trimmed: false,
  };
}

function nextId(): string {
  idCounter += 1;
  // Padded so lexicographic id order equals insertion order ('run-000010'
  // sorts after 'run-000009', unlike 'run-10' vs 'run-9').
  return `run-${String(idCounter).padStart(6, '0')}`;
}

// The insertion timestamp the real server stamps (RUN-78). A counter rather
// than Date.now(): several runs seeded in one test would otherwise share a
// millisecond and stop being ordered at all, which is the very thing the
// column exists to fix. Monotonic and ISO-shaped, so it sorts as a string
// exactly like the server's.
function nextCreatedAt(): string {
  createdAtCounter += 1;
  return new Date(Date.UTC(2026, 0, 1, 0, 0, createdAtCounter)).toISOString();
}

function mintToken(): string {
  tokenCounter += 1;
  const token = `test-token-${tokenCounter}`;
  validTokens.add(token);
  refreshableTokens.add(token);
  return token;
}

// Newest first: date, then createdAt, then id, all descending - the real
// endpoint's runsNewestFirstOrder, and compareRunsNewestFirst on the client.
// All three of these have to say the same thing; a mock that sorted its own
// way would let a client/server divergence pass the whole suite.
function sorted(): Run[] {
  return [...db].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.createdAt ?? '').localeCompare(a.createdAt ?? '') ||
      b.id.localeCompare(a.id),
  );
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

  // Silent renewal (RUN-74). Mirrors the real endpoint's contract: the
  // presented token is allowed to be expired, an unrenewable one is a flat
  // 401, and success returns the same { token, user } body login does.
  if (url === '/api/auth/refresh') {
    // A backend that is up but unwell (failRunsRefresh below). Distinct from
    // a 401 on purpose: the session layer must not sign anyone out for it.
    if (refreshFailure !== null) {
      return Promise.resolve(jsonResponse(refreshFailure, { message: 'Server error' }));
    }
    const presented = (
      (init.headers as Record<string, string> | undefined)?.Authorization ?? ''
    ).replace(/^Bearer /, '');
    if (!refreshableTokens.has(presented)) {
      return Promise.resolve(jsonResponse(401, { message: 'Session ended. Sign in again.' }));
    }
    // Rotation: the presented token is spent, so a second renewal with it
    // fails exactly as it would against the real backend.
    refreshableTokens.delete(presented);
    validTokens.delete(presented);
    return Promise.resolve(
      jsonResponse(200, {
        token: mintToken(),
        user: {
          id: 'user-test',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'Runner',
        },
      }),
    );
  }

  // Server-side sign-out (RUN-74): 204 to anything, and every token this
  // mock ever issued stops working - the real endpoint bumps a per-account
  // version, which has the same effect for a single-account test world.
  if (url === '/api/auth/logout') {
    validTokens.clear();
    refreshableTokens.clear();
    return Promise.resolve(jsonResponse(204, null));
  }

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
  if (
    url === '/api/account' ||
    url === '/api/profile' ||
    url === '/api/goal' ||
    url === '/api/privacy' ||
    url.startsWith('/api/week-targets')
  ) {
    if (!authorized(init)) {
      return Promise.resolve(jsonResponse(401, { message: 'Missing bearer token' }));
    }
  }

  if (url === '/api/account' && method === 'GET') {
    if (accountFailure)
      return Promise.resolve(jsonResponse(accountFailure, { message: 'Simulated failure' }));
    return Promise.resolve(jsonResponse(200, accountDb));
  }

  if (url === '/api/account' && method === 'PUT') {
    if (accountPutFailure) {
      return Promise.resolve(jsonResponse(accountPutFailure, { message: 'Simulated failure' }));
    }
    const record = JSON.parse(String(init.body)) as AccountRecord;
    accountDb = {
      firstName: record.firstName.trim(),
      lastName: record.lastName.trim(),
      // The real DTO normalizes the login credential; mirror it so tests
      // see the same spelling the server would store.
      email: record.email.trim().toLowerCase(),
    };
    return Promise.resolve(jsonResponse(200, accountDb));
  }

  // The privacy settings (RUN-64). No 404 case: they are columns on the
  // account row, so a valid session always has them.
  if (url === '/api/privacy' && method === 'GET') {
    return Promise.resolve(jsonResponse(200, privacyDb));
  }

  if (url === '/api/privacy' && method === 'PUT') {
    if (privacyPutFailure) {
      return Promise.resolve(jsonResponse(privacyPutFailure, { message: 'Simulated failure' }));
    }
    privacyDb = JSON.parse(String(init.body)) as PrivacySettings;
    return Promise.resolve(jsonResponse(200, privacyDb));
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
    // Only the setup answers live here since RUN-59; name and email are the
    // account's (PUT /api/account above).
    profileDb = {
      runningLevel: record.runningLevel,
      defaultWeeklyGoalKm: record.defaultWeeklyGoalKm,
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
    const draft = JSON.parse(String(init.body)) as RunDraft;
    if (rejectedNames.has(draft.routeName)) {
      return Promise.resolve(jsonResponse(400, { message: ['routeName rejected'] }));
    }
    const rejection = routeRejection(draft.route);
    if (rejection) return Promise.resolve(rejection);
    const run: Run = {
      ...draft,
      effort: draft.effort ?? 'Medium',
      note: draft.note ?? '',
      // The real server stamps the source itself and answers with the key
      // present, null included (RUN-54). Mirroring that here is what keeps a
      // frontend test from passing against a shape the API never sends.
      route: storedRoute(draft.route),
      id: nextId(),
      // Server-assigned like the id and the route source (RUN-78). A draft
      // cannot carry one - RunDraft omits it and the real whitelist pipe 400s
      // a payload that sends one - so this is stamped after the spread.
      createdAt: nextCreatedAt(),
    };
    db.push(run);
    return Promise.resolve(jsonResponse(201, run));
  }

  // The routing proxy (RUN-53), consumed by the Route step (RUN-54). Answers
  // with the same typed error body the real endpoint uses, so the step's
  // switch on `code` is exercised rather than assumed.
  if (url === '/api/routes/plan') {
    if (!authorized(init)) {
      return Promise.resolve(jsonResponse(401, { message: 'Missing bearer token' }));
    }
    if (routePlanFailure) {
      return Promise.resolve(
        jsonResponse(routePlanFailure.status, {
          statusCode: routePlanFailure.status,
          code: routePlanFailure.code,
          message: routePlanFailure.message,
        }),
      );
    }
    const body = JSON.parse(String(init.body)) as {
      start: RouteWaypoint;
      waypoints?: RouteWaypoint[];
      finish: RouteWaypoint;
    };
    routePlanRequests.push([body.start, ...(body.waypoints ?? []), body.finish]);
    const answer = () =>
      jsonResponse(200, {
        ...routePlanResult,
        profile: 'foot-walking',
        source: ROUTE_PLAN_SOURCE,
      });
    // Held requests answer only when the test says so, which is how the
    // in-flight cases (save blocked, a superseded plan landing late) become
    // testable at all.
    return routePlanGate ? routePlanGate.then(answer) : Promise.resolve(answer());
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
  // for every store.
  if (url.startsWith('/api/me/notifications')) {
    if (!authorized(init)) {
      return Promise.resolve(jsonResponse(401, { message: 'Missing bearer token' }));
    }
    const handled = handleNotificationsRequest(url, method);
    if (handled) return handled;
  }

  // The global weekly leaderboard (RUN-70), delegated the same way.
  if (url.startsWith('/api/leaderboard')) {
    if (!authorized(init)) {
      return Promise.resolve(jsonResponse(401, { message: 'Missing bearer token' }));
    }
    const handled = handleLeaderboardRequest(url, method);
    if (handled) return handled;
  }

  // The users API (RUN-63's public profile read and the RUN-61 follow verbs
  // its header calls): same arrangement again, one fetch mock and one
  // Bearer handshake for every store.
  if (url.startsWith('/api/users')) {
    if (!authorized(init)) {
      return Promise.resolve(jsonResponse(401, { message: 'Missing bearer token' }));
    }
    const handled = handleUsersRequest(url, method);
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
      const patch = JSON.parse(String(init.body)) as Partial<RunDraft>;
      const rejection = routeRejection(patch.route);
      if (rejection) return Promise.resolve(rejection);
      // The route is pulled out of the spread because the submitted shape and
      // the stored one differ (no client-supplied source), and because absent /
      // null / object are three different PATCH outcomes: leave it alone, clear
      // it, replace it - exactly what the real service distinguishes.
      const { route: patchedRoute, ...fields } = patch;
      db[index] = {
        ...db[index],
        ...fields,
        ...(patchedRoute === undefined ? {} : { route: storedRoute(patchedRoute) }),
      };
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
  createdAtCounter = 0;
  tokenCounter = 0;
  validTokens = new Set();
  refreshableTokens = new Set();
  refreshFailure = null;
  failure = null;
  rejectedNames = new Set();
  authBroken = false;
  holdLoading = false;
  // The identity a fresh signup has, restored per test so a seedAccount() or
  // failAccountApi() in one test cannot leak into the next.
  accountDb = { firstName: 'Test', lastName: 'Runner', email: 'test@example.com' };
  accountFailure = null;
  accountPutFailure = null;
  profileDb = null;
  goalDb = null;
  weekTargetsDb = new Map();
  profileFailure = null;
  goalFailure = null;
  profilePutFailure = null;
  weekTargetPutFailure = null;
  privacyDb = { ...PRIVACY_DEFAULTS };
  privacyPutFailure = null;
  routePlanResult = {
    polyline: 'wap_IsyspAsFgc@cG{h@qFe{A',
    distanceKm: 5.1,
    durationSeconds: 3800,
  };
  routePlanRequests = [];
  routePlanFailure = null;
  routePlanGate = null;
  resetLeafletMock();
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
  // The signed-in identity is present from the start, like an account that
  // just signed in (RUN-59).
  __resetAccountStoreForTests(accountDb);
  __resetProfileStoreForTests(null);
  __resetGoalStoreForTests({ goal: null, weekTarget: null });
  // A fresh account is private on every count, so that is the state every
  // test starts in (seedPrivacy below opts one in).
  __resetPrivacyStoreForTests({ ...PRIVACY_DEFAULTS });
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
  const runs = drafts.map((draft) => ({
    ...draft,
    id: draft.id ?? nextId(),
    // Stamped like the server does, in the order seeded, unless the test
    // pinned one itself. This is why no existing fixture needed touching when
    // RUN-78 added the field.
    createdAt: draft.createdAt ?? nextCreatedAt(),
  }));
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

// Ends every session issued so far, renewal included: the next guarded
// request 401s, the renewal attempt 401s too, and the session layer signs
// out (RUN-58 AC6, still the contract after RUN-74). This is the helper for
// asserting the sign-out path.
export function expireRunsTokens(): void {
  validTokens.clear();
  refreshableTokens.clear();
}

// The everyday case instead: the access token is too old for the guard but
// the session is still alive, so the next guarded request 401s once and the
// session layer renews and replays it. Nothing visible should happen.
export function expireRunsAccessTokens(): void {
  validTokens.clear();
}

// A renewal that cannot complete because the SERVER is unwell - mid-deploy
// 502, a 500, anything that is not a 401. The session is still perfectly
// good and the session layer must not end it (RUN-74).
export function failRunsRefresh(status = 500): void {
  refreshFailure = status;
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

/* Account resources (RUN-50, split by RUN-59) ------------------------------- */

// Overrides the signed-in identity in the mock backend AND primes the
// account store, so a named runner is on screen from the first render.
export function seedAccount(account: Partial<AccountRecord>): AccountRecord {
  accountDb = { ...accountDb, ...account };
  __resetAccountStoreForTests(accountDb);
  return accountDb;
}

// Seeds the profile (the SETUP ANSWERS since RUN-59) in the mock backend AND
// primes the profile store, so an onboarded account is on screen from the
// first render. Both fields default to the onboarding defaults.
export function seedProfile(profile: Partial<ProfileRecord> = {}): ProfileRecord {
  profileDb = {
    runningLevel: 'Beginner',
    defaultWeeklyGoalKm: 20,
    ...profile,
  };
  __resetProfileStoreForTests(profileDb);
  return profileDb;
}

// Re-arms the account store's initial load against a failing GET: the store
// lands in 'error' once an account hook mounts (boundary tests).
export function makeAccountLoadFail(status = 500): void {
  plantTestSession();
  accountFailure = status;
  __resetAccountStoreForTests();
}

// Makes PUT /api/account fail: the Settings save must keep the failure on
// screen instead of pretending anything was stored.
export function failAccountApi(status = 500): void {
  accountPutFailure = status;
}

export function restoreAccountApi(): void {
  accountFailure = null;
  accountPutFailure = null;
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

// Seeds the account's privacy settings in the mock backend AND primes the
// privacy store, so a card renders the opted-in state from the first
// render (RUN-64).
export function seedPrivacy(settings: Partial<PrivacySettings>): PrivacySettings {
  privacyDb = { ...PRIVACY_DEFAULTS, ...settings };
  __resetPrivacyStoreForTests(privacyDb);
  return privacyDb;
}

// Makes PUT /api/privacy fail: the Settings save must keep the failure on
// screen instead of pretending a toggle was stored.
export function failPrivacyApi(status = 500): void {
  privacyPutFailure = status;
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

/* The routing proxy (RUN-54) ------------------------------------------------ */

// Overrides what a plan comes back with, so a test can set a routed distance
// that does (or does not) trip the 20% mismatch hint.
export function seedRoutePlan(plan: Partial<typeof routePlanResult>): void {
  routePlanResult = { ...routePlanResult, ...plan };
}

// Every point list POST /api/routes/plan was asked about, flattened back to
// start-first order: the step is expected to send the ends as start/finish and
// only the middle as waypoints.
export function routePlanRequestsMade(): RouteWaypoint[][] {
  return routePlanRequests.map((points) => [...points]);
}

// Makes planning fail with one of the endpoint's typed codes (RUN-53's
// ROUTE_PLAN_ERRORS), which is what the step switches on to decide whether
// retrying could ever help.
export function failRoutePlan(
  code = 'ROUTING_PROVIDER_UNAVAILABLE',
  status = 503,
  message = 'The routing provider could not be reached.',
): void {
  routePlanFailure = { code, status, message };
}

export function restoreRoutePlan(): void {
  routePlanFailure = null;
}

// Holds every subsequent plan request open until the returned function is
// called: the only way to observe the in-flight window, where a save must be
// refused and a superseded answer must be ignored.
export function holdRoutePlan(): () => void {
  let release = (): void => undefined;
  routePlanGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    routePlanGate = null;
    release();
  };
}

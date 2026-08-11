// The test double for the runs API (RUN-48). jest.setup.ts installs it
// before every test, so component tests run against an in-memory backend
// with the same contract as /api/runs, including the auth handshake: the
// guarded endpoints demand a Bearer token this mock itself issued, so the
// session layer is exercised (and can be expired) rather than waved
// through. Tests seed synchronously through seedRuns(), which also primes
// the store cache - assertions right after render() keep working exactly
// as they did when the store was localStorage.
import { __resetRunsStoreForTests, type Run } from '@/lib/runs';
import { __resetSessionForTests } from '@/lib/session';

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

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function authorized(init: RequestInit): boolean {
  const header = (init.headers as Record<string, string> | undefined)?.Authorization ?? '';
  const token = header.replace(/^Bearer /, '');
  return validTokens.has(token);
}

function handle(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init.method ?? 'GET').toUpperCase();

  if (url === '/api/auth/login' || url === '/api/auth/signup') {
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
  global.fetch = jest.fn(handle) as unknown as typeof fetch;
  __resetRunsStoreForTests([]);
  // The in-memory session outlives the localStorage wipe and would leak
  // identities (with now-invalidated tokens) between tests.
  __resetSessionForTests();
}

// Seeds the in-memory backend AND primes the store cache, so the seeded
// runs are on screen from the first render with no async settling.
export function seedRuns(drafts: Array<Omit<Run, 'id'> & { id?: string }>): Run[] {
  const runs = drafts.map((draft) => ({ ...draft, id: draft.id ?? nextId() }));
  db.push(...runs);
  __resetRunsStoreForTests(sorted());
  return runs;
}

// Plants a stored device session with a valid token, as a returning
// device would have. The load path skips the network entirely for devices
// with no session and no legacy data, so tests exercising the initial load
// call this first.
export function plantTestSession(): void {
  const token = mintToken();
  window.localStorage.setItem(
    'runlog.session',
    JSON.stringify({ email: 'runner-test@device.runlog', password: 'test-secret', token }),
  );
}

// Invalidates every token issued so far: the next guarded request 401s and
// the session layer must silently re-authenticate.
export function expireRunsTokens(): void {
  validTokens.clear();
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

// Breaks authentication terminally: login 401s and the same-credentials
// signup 409s, the "stored password no longer matches its account" case.
export function breakRunsAuth(): void {
  authBroken = true;
}
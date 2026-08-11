// The test double for the events API (RUN-68), a sibling of runsApiMock:
// jest.setup.ts installs both before every test, and runsApiMock's fetch
// handler delegates /api/events requests here (after its own auth check),
// so the two share one fetch mock and one Bearer handshake. Tests seed
// synchronously through seedEvents(), which also primes the store cache -
// assertions right after render() see the seeded community.
import { __resetEventsStoreForTests, type CommunityEvent } from '@/lib/events';
import { todayIso } from '@/lib/runs';

let db: CommunityEvent[] = [];
let idCounter = 0;
// When set, matching /api/events requests fail with the given status
// before reaching the in-memory backend (failEventsApi below).
let failure: { method: string; status: number } | null = null;
// When true, GET /api/events never resolves (until its AbortSignal fires):
// holds the store in 'loading'.
let holdLoading = false;

function nextId(): string {
  idCounter += 1;
  // Padded so lexicographic id order equals insertion order, matching the
  // server's id tiebreak semantics.
  return `event-${String(idCounter).padStart(6, '0')}`;
}

// The caller-side derivation, only for rows the mock itself creates: the
// real server derives against ITS today, tests build dates relative to the
// same todayIso(), so the two agree.
function deriveState(startDate: string, endDate: string): CommunityEvent['state'] {
  const today = todayIso();
  if (today < startDate) return 'upcoming';
  if (today > endDate) return 'finished';
  return 'active';
}

// Chronological like the real endpoint (startDate asc, id asc).
function sorted(): CommunityEvent[] {
  return [...db].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

// Everything /api/events, called by runsApiMock's shared fetch handler
// AFTER the Bearer check passed. Returning a Response promise for every
// route it knows; unknown shapes fall through to the caller's loud throw.
export function handleEventsRequest(
  url: string,
  method: string,
  init: RequestInit,
): Promise<Response> | null {
  if (failure && failure.method === method) {
    return Promise.resolve(jsonResponse(failure.status, { message: 'Simulated failure' }));
  }

  if (url.startsWith('/api/events?') || url === '/api/events') {
    if (method === 'GET') {
      if (holdLoading) {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        });
      }
      const params = new URLSearchParams(url.split('?')[1] ?? '');
      const page = Number(params.get('page') ?? '1');
      const pageSize = Number(params.get('pageSize') ?? '20');
      const all = sorted();
      return Promise.resolve(
        jsonResponse(200, {
          items: all.slice((page - 1) * pageSize, page * pageSize),
          total: all.length,
          page,
          pageSize,
        }),
      );
    }
    if (method === 'POST') {
      const draft = JSON.parse(String(init.body)) as {
        name: string;
        description?: string;
        startDate: string;
        endDate: string;
        targetKm?: number;
      };
      const event: CommunityEvent = {
        id: nextId(),
        name: draft.name,
        description: draft.description ?? '',
        startDate: draft.startDate,
        endDate: draft.endDate,
        targetKm: draft.targetKm ?? null,
        state: deriveState(draft.startDate, draft.endDate),
        participantCount: 1,
        joined: true,
        mine: true,
        owner: { id: 'user-test', firstName: 'Test', lastName: 'Runner' },
        createdAt: new Date().toISOString(),
      };
      db.push(event);
      return Promise.resolve(jsonResponse(201, event));
    }
  }

  const join = url.match(/^\/api\/events\/([^/]+)\/join$/);
  if (join) {
    const event = db.find((row) => row.id === join[1]);
    if (method === 'POST') {
      if (!event) return Promise.resolve(jsonResponse(404, { message: 'Not found' }));
      if (!event.joined) {
        event.joined = true;
        event.participantCount += 1;
      }
      return Promise.resolve(jsonResponse(200, { joined: true }));
    }
    if (method === 'DELETE') {
      // Missing events leave silently (idempotent), the owner cannot leave:
      // both mirror the real service.
      if (event?.mine) {
        return Promise.resolve(
          jsonResponse(400, { message: 'The owner cannot leave their own event' }),
        );
      }
      if (event?.joined) {
        event.joined = false;
        event.participantCount -= 1;
      }
      return Promise.resolve(jsonResponse(204, undefined));
    }
  }

  const byId = url.match(/^\/api\/events\/([^/]+)$/);
  if (byId && method === 'GET') {
    const event = db.find((row) => row.id === byId[1]);
    return Promise.resolve(
      event ? jsonResponse(200, event) : jsonResponse(404, { message: 'Not found' }),
    );
  }

  return null;
}

// Called from jest.setup.ts before every test: fresh backend, store primed
// to ready-and-empty.
export function installEventsApiMock(): void {
  db = [];
  idCounter = 0;
  failure = null;
  holdLoading = false;
  __resetEventsStoreForTests([]);
}

// Seeds the in-memory backend AND primes the store cache. Drafts fill in
// the served-shape fields a test does not care about; state defaults to
// the derivation from the dates, so seeding only a window is enough.
export function seedEvents(
  drafts: Array<Partial<CommunityEvent> & { name: string }>,
): CommunityEvent[] {
  const events = drafts.map((draft) => {
    const startDate = draft.startDate ?? todayIso();
    const endDate = draft.endDate ?? startDate;
    return {
      id: nextId(),
      description: '',
      targetKm: null,
      state: deriveState(startDate, endDate),
      participantCount: 1,
      joined: false,
      mine: false,
      owner: { id: 'user-other', firstName: 'Ana', lastName: 'Tester' },
      createdAt: new Date().toISOString(),
      ...draft,
      startDate,
      endDate,
    };
  });
  db.push(...events);
  __resetEventsStoreForTests(sorted());
  return events;
}

// Makes /api/events requests with the given method fail. The store keeps
// whatever it already has.
export function failEventsApi(method: 'GET' | 'POST' | 'DELETE', status = 500): void {
  failure = { method, status };
}

export function restoreEventsApi(): void {
  failure = null;
}

// Re-arms the initial load and holds it in flight: the store stays
// 'loading' until the request's own timeout aborts it.
export function holdEventsLoading(): void {
  holdLoading = true;
  __resetEventsStoreForTests(null);
}

// Re-arms the initial load against a failing GET: the store lands in
// 'error' once an events hook mounts.
export function makeEventsLoadFail(status = 500): void {
  failEventsApi('GET', status);
  __resetEventsStoreForTests(null);
}

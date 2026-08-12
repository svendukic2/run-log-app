// The test double for the events API (RUN-68), a sibling of runsApiMock:
// jest.setup.ts installs both before every test, and runsApiMock's fetch
// handler delegates /api/events requests here (after its own auth check),
// so the two share one fetch mock and one Bearer handshake. Tests seed
// synchronously through seedEvents(), which also primes the store cache -
// assertions right after render() see the seeded community.
import {
  __resetEventsStoreForTests,
  compareEventsChronological,
  type CommunityEvent,
  type EventParticipant,
} from '@/lib/events';
import { __resetEventParticipantsForTests } from '@/lib/eventParticipants';
import { todayIso } from '@/lib/runs';
import { jsonResponse } from './apiMockShared';

let db: CommunityEvent[] = [];
// Participants per event id (RUN-69). Kept beside the events rather than
// derived from them: the real endpoint ranks server-side, so a test that
// seeds ranks is testing the rendering, which is the part that lives here.
let participantDb = new Map<string, EventParticipant[]>();
let idCounter = 0;
// When set, matching /api/events requests fail with the given status
// before reaching the in-memory backend (failEventsApi below).
let failure: { method: string; status: number } | null = null;
// Same idea, scoped to GET /api/events/:id/participants (RUN-69).
let participantsFailure: number | null = null;
// When true, GET /api/events answers are withheld until release: the
// response BODY is captured at request time (like a real server whose
// pages predate a concurrent write), so tests can prove what a load that
// straddles a mutation ends up publishing.
let holdListLoading = false;
let heldListResolvers: Array<() => void> = [];
// When true, POST /api/events performs the create but withholds the
// response until release: the save is genuinely in flight, which is what
// the dismissal-gating tests need.
let holdCreate = false;
let heldCreateResolvers: Array<() => void> = [];

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

// The lib's own comparator (its comment binds client and server orderings
// together); the mock must never re-encode the rule.
function sorted(): CommunityEvent[] {
  return [...db].sort(compareEventsChronological);
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
      const params = new URLSearchParams(url.split('?')[1] ?? '');
      const page = Number(params.get('page') ?? '1');
      const pageSize = Number(params.get('pageSize') ?? '20');
      const all = sorted();
      const body = {
        items: all.slice((page - 1) * pageSize, page * pageSize),
        total: all.length,
        page,
        pageSize,
      };
      if (holdListLoading) {
        return new Promise<Response>((resolve, reject) => {
          heldListResolvers.push(() => resolve(jsonResponse(200, body)));
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        });
      }
      return Promise.resolve(jsonResponse(200, body));
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
      if (holdCreate) {
        return new Promise<Response>((resolve) => {
          heldCreateResolvers.push(() => resolve(jsonResponse(201, event)));
        });
      }
      return Promise.resolve(jsonResponse(201, event));
    }
  }

  const join = url.match(/^\/api\/events\/([^/]+)\/join$/);
  if (join) {
    const event = db.find((row) => row.id === join[1]);
    // Both membership verbs answer the UPDATED event, like the real API
    // since the RUN-68 review fixes; an unknown event is 404 for both.
    if (!event) return Promise.resolve(jsonResponse(404, { message: 'Not found' }));
    if (method === 'POST') {
      if (!event.joined) {
        event.joined = true;
        event.participantCount += 1;
      }
      return Promise.resolve(jsonResponse(200, { ...event }));
    }
    if (method === 'DELETE') {
      if (event.mine) {
        return Promise.resolve(
          jsonResponse(400, { message: 'The owner cannot leave their own event' }),
        );
      }
      if (event.joined) {
        event.joined = false;
        event.participantCount -= 1;
      }
      return Promise.resolve(jsonResponse(200, { ...event }));
    }
  }

  const participants = url.match(/^\/api\/events\/([^/]+)\/participants$/);
  if (participants && method === 'GET') {
    // Its own failure switch, not the shared `failure` above: that one
    // keys on the method, and failing every GET would take the events list
    // down with it - the detail page's whole point is that the two loads
    // are independent.
    if (participantsFailure !== null) {
      return Promise.resolve(jsonResponse(participantsFailure, { message: 'Simulated failure' }));
    }
    const eventId = participants[1];
    if (!db.some((row) => row.id === eventId)) {
      return Promise.resolve(jsonResponse(404, { message: 'Not found' }));
    }
    const items = participantDb.get(eventId) ?? [];
    return Promise.resolve(jsonResponse(200, { items, total: items.length }));
  }

  const byId = url.match(/^\/api\/events\/([^/]+)$/);
  if (byId && method === 'GET') {
    const event = db.find((row) => row.id === byId[1]);
    return Promise.resolve(
      event ? jsonResponse(200, { ...event }) : jsonResponse(404, { message: 'Not found' }),
    );
  }

  return null;
}

// Called from jest.setup.ts before every test: fresh backend, store primed
// to ready-and-empty.
export function installEventsApiMock(): void {
  db = [];
  participantDb = new Map();
  idCounter = 0;
  failure = null;
  participantsFailure = null;
  holdListLoading = false;
  heldListResolvers = [];
  holdCreate = false;
  heldCreateResolvers = [];
  __resetEventsStoreForTests([]);
  __resetEventParticipantsForTests(null);
}

// Seeds one event's participants (RUN-69). Ranks are given, not derived:
// the server computes them, and a mock that re-derived them would be
// testing itself. Anything omitted gets the "opted in with no runs" shape;
// pass rank: null for the runner who is off leaderboards.
export function seedParticipants(
  eventId: string,
  drafts: Array<Partial<EventParticipant> & { firstName: string }>,
): EventParticipant[] {
  const items = drafts.map((draft, index) => {
    const ranked = draft.rank !== null;
    return {
      id: `user-${draft.firstName.toLowerCase()}`,
      lastName: 'Tester',
      joinedAt: `2026-08-0${index + 1}T09:00:00.000Z`,
      me: false,
      rank: ranked ? index + 1 : null,
      totalKm: ranked ? 0 : null,
      runCount: ranked ? 0 : null,
      // RUN-72's marker travels with the other withheld numbers.
      unverified: ranked ? false : null,
      ...draft,
    } as EventParticipant;
  });
  participantDb.set(eventId, items);
  __resetEventParticipantsForTests(eventId, items);
  return items;
}

// Seeds the in-memory backend AND primes the store cache. The dates
// resolve first (today's one-day event unless given), then feed the
// remaining defaults; the draft wins on everything it carries. state
// defaults to the derivation from the dates, so seeding only a window is
// enough.
export function seedEvents(
  drafts: Array<Partial<CommunityEvent> & { name: string }>,
): CommunityEvent[] {
  const events = drafts.map((draft) => {
    const startDate = draft.startDate ?? todayIso();
    const endDate = draft.endDate ?? startDate;
    return {
      id: nextId(),
      description: '',
      startDate,
      endDate,
      targetKm: null,
      state: deriveState(startDate, endDate),
      participantCount: 1,
      joined: false,
      mine: false,
      owner: { id: 'user-other', firstName: 'Ana', lastName: 'Tester' },
      createdAt: new Date().toISOString(),
      ...draft,
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
// 'loading' until releaseEventsLoading() (or the request's own timeout).
// Held responses carry the page content AS OF the request, like a real
// server's would.
export function holdEventsLoading(): void {
  holdListLoading = true;
  __resetEventsStoreForTests(null);
}

// Answers every held list request with its captured page and lets new
// requests through.
export function releaseEventsLoading(): void {
  holdListLoading = false;
  const resolvers = heldListResolvers;
  heldListResolvers = [];
  resolvers.forEach((resolve) => resolve());
}

// Performs creates but withholds their responses, so a save is genuinely
// in flight until releaseEventsCreate().
export function holdEventsCreate(): void {
  holdCreate = true;
}

export function releaseEventsCreate(): void {
  holdCreate = false;
  const resolvers = heldCreateResolvers;
  heldCreateResolvers = [];
  resolvers.forEach((resolve) => resolve());
}

// Re-arms the initial load against a failing GET: the store lands in
// 'error' once an events hook mounts.
export function makeEventsLoadFail(status = 500): void {
  failEventsApi('GET', status);
  __resetEventsStoreForTests(null);
}

// The same for the participants endpoint (RUN-69): re-arms that store
// against a failing read, so the detail page's own error card renders.
export function makeParticipantsLoadFail(status = 500): void {
  participantsFailure = status;
  __resetEventParticipantsForTests(null);
}

export function restoreParticipantsApi(): void {
  participantsFailure = null;
}

// The test double for the notifications API (RUN-65's endpoints, consumed
// by RUN-66), a sibling of eventsApiMock: jest.setup.ts installs it before
// every test, and runsApiMock's fetch handler delegates /api/me/notifications
// requests here after its own Bearer check, so the three mocks share one
// fetch mock and one auth handshake. Tests seed synchronously through
// seedNotifications(), which also primes the store cache.
import { __resetNotificationsStoreForTests, type AppNotification } from '@/lib/notifications';
import { jsonResponse } from './apiMockShared';

// Pairs each type with ITS payload shape rather than the union of all of
// them, so a draft cannot pass a follower payload for a run notification.
type DraftFor<T> = T extends AppNotification
  ? {
      type: T['type'];
      payload: T['payload'];
      id?: string;
      createdAt?: string;
      readAt?: string | null;
    }
  : never;

export type NotificationDraft = DraftFor<AppNotification>;

let db: AppNotification[] = [];
let idCounter = 0;
// When set, matching /api/me/notifications requests fail with the given
// status before reaching the in-memory backend (failNotificationsApi below).
let failure: { method: string; status: number } | null = null;

function nextId(): string {
  idCounter += 1;
  // Padded so lexicographic id order equals insertion order, like the other
  // mocks and the server's id tiebreak.
  return `notification-${String(idCounter).padStart(6, '0')}`;
}

// Newest first: createdAt descending, id descending, matching the real
// endpoint's ordering.
function sorted(): AppNotification[] {
  return [...db].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

function unreadCount(): number {
  return db.filter((item) => item.readAt === null).length;
}

// Everything /api/me/notifications, called by runsApiMock's shared fetch
// handler AFTER the Bearer check passed. Unknown shapes return null and fall
// through to the caller's loud throw.
export function handleNotificationsRequest(url: string, method: string): Promise<Response> | null {
  if (failure && failure.method === method) {
    return Promise.resolve(jsonResponse(failure.status, { message: 'Simulated failure' }));
  }

  if (
    method === 'GET' &&
    (url === '/api/me/notifications' || url.startsWith('/api/me/notifications?'))
  ) {
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
        unreadCount: unreadCount(),
      }),
    );
  }

  if (method === 'POST' && url === '/api/me/notifications/read-all') {
    // Idempotent, like the real endpoint: a repeat flips nothing and the
    // original timestamps survive.
    let updated = 0;
    db = db.map((item) => {
      if (item.readAt !== null) return item;
      updated += 1;
      return { ...item, readAt: new Date().toISOString() };
    });
    return Promise.resolve(jsonResponse(200, { updated }));
  }

  const markOne = url.match(/^\/api\/me\/notifications\/([^/]+)\/read$/);
  if (markOne && method === 'POST') {
    const index = db.findIndex((item) => item.id === markOne[1]);
    if (index === -1) return Promise.resolve(jsonResponse(404, { message: 'Not found' }));
    if (db[index].readAt === null) {
      db[index] = { ...db[index], readAt: new Date().toISOString() };
    }
    return Promise.resolve(jsonResponse(200, db[index]));
  }

  return null;
}

// Called from jest.setup.ts before every test: fresh backend, store primed
// to ready-and-empty (the state an account with no notifications wakes up
// in, and the one every unrelated test's page header renders against).
export function installNotificationsApiMock(): void {
  db = [];
  idCounter = 0;
  failure = null;
  __resetNotificationsStoreForTests([]);
}

// Seeds the in-memory backend AND primes the store cache. Drafts are listed
// NEWEST FIRST: each successive one defaults to an hour older, so the seed
// order is the order the panel renders.
export function seedNotifications(drafts: NotificationDraft[]): AppNotification[] {
  const now = Date.now();
  const items = drafts.map(
    (draft, index) =>
      ({
        id: draft.id ?? nextId(),
        createdAt: draft.createdAt ?? new Date(now - index * 3_600_000).toISOString(),
        readAt: draft.readAt ?? null,
        type: draft.type,
        payload: draft.payload,
      }) as AppNotification,
  );
  db.push(...items);
  __resetNotificationsStoreForTests(sorted());
  return items;
}

// Makes /api/me/notifications requests with the given method fail. The store
// keeps whatever it already has.
export function failNotificationsApi(method: 'GET' | 'POST', status = 500): void {
  failure = { method, status };
}

export function restoreNotificationsApi(): void {
  failure = null;
}

// Re-arms the initial load against a failing GET: the store lands in 'error'
// once the bell mounts, which is the "no indicator, working header" path.
export function makeNotificationsLoadFail(status = 500): void {
  failNotificationsApi('GET', status);
  __resetNotificationsStoreForTests(null);
}

'use client';

// The bell's store (RUN-66), reading the notifications API built in RUN-65.
// It follows the RUN-48 store pattern like every other store: an in-memory
// cache behind useSyncExternalStore, so the bell reads synchronously.
//
// Three deliberate differences from runs.ts / events.ts, all from one fact -
// the bell renders in the header of EVERY page, next to the primary action,
// and is nobody's reason for visiting:
//
// - It is NOT gated by AppDataBoundary. A screen-level gate would hold the
//   whole page hostage to a read the user never asked for. A failed load
//   therefore means "no unread indicator", never a broken or blank header;
//   the panel itself owns the error line, and only once it is opened.
// - Only the newest page is loaded, not every page. The panel is a dropdown,
//   not a screen: it shows the newest PANEL_PAGE_SIZE rows, and the unread
//   COUNT comes from the server's envelope, which counts rows this page
//   never loaded.
// - A refresh keeps the rows already on screen. The store loads once per
//   page load like the others, but the bell survives client navigations, so
//   opening the panel re-reads; blanking the list on every open would make
//   that refresh visible for no reason.
//
// Module-level mutable state is safe here for the runs.ts reasons: every
// write goes through publish(), and the useSyncExternalStore server snapshot
// is the frozen INITIAL_SNAPSHOT.
import { useSyncExternalStore } from 'react';
import { formatUpdatedAgo } from './plan';
import { ROUTES, personRoute } from './routes';
import { formatDistanceKm } from './runMath';
import { ApiError, apiFetch, hasStoredSession } from './session';

const NOTIFICATIONS_CHANGED_EVENT = 'runlog:notifications-changed';

// How many rows the dropdown holds. Deliberately one page: a bell is a
// recent-activity surface, and "everything you ever received" is a screen
// this ticket does not build.
const PANEL_PAGE_SIZE = 20;

/* Shapes ---------------------------------------------------------------------- */

// The vocabulary from backend/src/notifications/notifications.service.ts.
// The API answers `type` as a plain string on purpose, so an unknown value
// degrades to a row this module skips rather than a crashed list.
export type NotificationType = 'new-follower' | 'followed-ran' | 'event-joined';

// Payloads are self-contained snapshots taken at delivery time (see
// docs/data-model.md, Notification): render them as-is and never re-fetch
// the actor, the run or the event. A renamed actor keeps their old name in
// old notifications, which is the accepted cost of the snapshot.
export interface NewFollowerPayload {
  followerId: string;
  firstName: string;
  lastName: string;
}

export interface FollowedRanPayload {
  runnerId: string;
  firstName: string;
  lastName: string;
  runId: string;
  routeName: string;
  distanceKm: number;
  durationSeconds: number;
  date: string;
}

export interface EventJoinedPayload {
  joinerId: string;
  firstName: string;
  lastName: string;
  eventId: string;
  eventName: string;
}

interface NotificationBase {
  id: string;
  // ISO instants, not calendar days: the rows render "2h ago". The app's one
  // deliberate exception to the calendar-day rule.
  createdAt: string;
  readAt: string | null;
}

export type AppNotification = NotificationBase &
  (
    | { type: 'new-follower'; payload: NewFollowerPayload }
    | { type: 'followed-ran'; payload: FollowedRanPayload }
    | { type: 'event-joined'; payload: EventJoinedPayload }
  );

/* Parsing --------------------------------------------------------------------- */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

type Raw = Record<string, unknown>;

// Every payload carries the actor's name, because every row's copy starts
// with it.
function hasActor(payload: Raw): payload is Raw & { firstName: string; lastName: string } {
  return isNonEmptyString(payload.firstName) && isNonEmptyString(payload.lastName);
}

// Each guard checks only the fields the row's copy and link actually read,
// so a payload that grows a field on the server does not stop rendering here.
function isNewFollower(payload: Raw): payload is Raw & NewFollowerPayload {
  return hasActor(payload) && isNonEmptyString(payload.followerId);
}

function isFollowedRan(payload: Raw): payload is Raw & FollowedRanPayload {
  return (
    hasActor(payload) &&
    isNonEmptyString(payload.runId) &&
    typeof payload.distanceKm === 'number' &&
    Number.isFinite(payload.distanceKm)
  );
}

function isEventJoined(payload: Raw): payload is Raw & EventJoinedPayload {
  return (
    hasActor(payload) && isNonEmptyString(payload.eventId) && isNonEmptyString(payload.eventName)
  );
}

// One row, or null when it is not renderable: an unfamiliar type from a
// newer backend, a payload missing the fields its copy needs, or a
// createdAt no clock can read. Skipping such a row is the contract the API
// was written to (notifications.service.ts): a list that renders what it
// understands beats a list that throws on the one row it does not.
export function parseNotification(value: unknown): AppNotification | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Raw;
  if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.type)) return null;
  if (!isNonEmptyString(raw.createdAt) || !Number.isFinite(Date.parse(raw.createdAt))) return null;
  if (raw.readAt !== null && !isNonEmptyString(raw.readAt)) return null;
  if (typeof raw.payload !== 'object' || raw.payload === null) return null;
  const payload = raw.payload as Raw;
  const base: NotificationBase = { id: raw.id, createdAt: raw.createdAt, readAt: raw.readAt };
  // Type and payload are checked as a pair, so a run notification can never
  // end up rendering with a follower's payload.
  if (raw.type === 'new-follower' && isNewFollower(payload)) {
    return { ...base, type: 'new-follower', payload };
  }
  if (raw.type === 'followed-ran' && isFollowedRan(payload)) {
    return { ...base, type: 'followed-ran', payload };
  }
  if (raw.type === 'event-joined' && isEventJoined(payload)) {
    return { ...base, type: 'event-joined', payload };
  }
  return null;
}

/* Copy ------------------------------------------------------------------------ */

// What one row says and where it goes (AC2). Pure, so the wording is
// testable without rendering the panel, and derived only from the payload
// snapshot - never from a live lookup.
export interface NotificationView {
  text: string;
  href: string;
}

export function describeNotification(notification: AppNotification): NotificationView {
  const { firstName, lastName } = notification.payload;
  const name = `${firstName} ${lastName}`.trim();
  switch (notification.type) {
    case 'new-follower':
      return {
        text: `${name} started following you`,
        href: personRoute(notification.payload.followerId),
      };
    case 'followed-ran':
      return {
        // The headline stat rides along in the payload, so the row reads
        // fully without opening anything.
        text: `${name} logged a run · ${formatDistanceKm(notification.payload.distanceKm)}`,
        // The RUNNER, not the run (review fix). This notification is by
        // definition about someone ELSE's run, and /runs/:id is owner-scoped
        // on both sides - RunDetailView resolves the id against the signed-in
        // user's own runs, and GET /api/runs/:id filters by userId - so
        // linking to it would land every one of these rows on "Run not
        // found". A public run view needs a public run endpoint first; until
        // then the runner's profile is the honest destination, the same one
        // the follower rows and RUN-69's leaderboard rows use.
        href: personRoute(notification.payload.runnerId),
      };
    case 'event-joined':
      return {
        text: `${name} joined ${notification.payload.eventName}`,
        href: `${ROUTES.events}/${notification.payload.eventId}`,
      };
  }
}

// "just now" / "5m ago" / "2h ago" / "3d ago", the caption the coach card
// already uses. Reused rather than re-derived so the two never drift.
export function formatNotificationAge(notification: AppNotification, now: number): string {
  return formatUpdatedAgo(Date.parse(notification.createdAt), now);
}

/* Store ----------------------------------------------------------------------- */

export type NotificationsStatus = 'loading' | 'ready' | 'error';

export interface NotificationsSnapshot {
  status: NotificationsStatus;
  items: AppNotification[];
  // From the server envelope, so it counts unread rows beyond this page.
  // It therefore does NOT always equal the unread rows on screen: a row this
  // module could not parse still counts, and so does page 2. That is the
  // right trade - a badge that undercounts is worse than one whose panel
  // shows only the newest twenty.
  unreadCount: number;
  error: string | null;
}

const INITIAL_SNAPSHOT: NotificationsSnapshot = Object.freeze({
  status: 'loading' as const,
  items: [] as AppNotification[],
  unreadCount: 0,
  error: null,
});

let snapshot: NotificationsSnapshot = INITIAL_SNAPSHOT;
let loadStarted = false;
let loadInFlight = false;

function publish(next: NotificationsSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

async function fetchNewest(): Promise<{ items: AppNotification[]; unreadCount: number }> {
  const response = await apiFetch(`/api/me/notifications?page=1&pageSize=${PANEL_PAGE_SIZE}`);
  if (!response.ok) {
    throw new ApiError(`Loading notifications failed (${response.status}).`, response.status);
  }
  const body = (await response.json()) as { items?: unknown; unreadCount?: unknown };
  if (!Array.isArray(body?.items) || typeof body.unreadCount !== 'number') {
    throw new ApiError('The server returned notifications in an unexpected shape.');
  }
  // The server already orders newest first; unrenderable rows drop out here
  // rather than reaching the panel.
  return {
    items: body.items
      .map(parseNotification)
      .filter((item): item is AppNotification => item !== null),
    unreadCount: body.unreadCount,
  };
}

// Bumped by every local read stamp. A load that started BEFORE a stamp is
// answering from a server state that predates it, so its envelope would
// resurrect the badge the user just cleared (review fix): opening the panel
// fires a refresh, and "Mark all as read" is one click away while it is still
// in flight. Discarding such an answer is safe - the local stamp already
// matches what the server now holds, and the next open re-reads.
let readEpoch = 0;

async function loadNotifications(): Promise<void> {
  // A second request while one is in flight would answer the same page, and
  // the epoch guard below covers the mutation that could overtake it.
  if (loadInFlight) return;
  // A signed-out visitor has nothing to read, and apiFetch without a session
  // hard-navigates to Sign in (session.ts). Every other app-wide store
  // short-circuits here; this one lives in a shell component rather than a
  // page, so it is the one that must not fire a background read that could
  // eject someone from a page they are looking at.
  if (!hasStoredSession()) {
    publish({ status: 'ready', items: [], unreadCount: 0, error: null });
    return;
  }
  loadInFlight = true;
  const epoch = readEpoch;
  try {
    const { items, unreadCount } = await fetchNewest();
    if (epoch !== readEpoch) return;
    publish({ status: 'ready', items, unreadCount, error: null });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Loading notifications failed', error);
    }
    // A failed REFRESH keeps the last successful read: rows that were true
    // a moment ago are better than an error card, and the next open retries.
    // A failed FIRST read clears the indicator instead of showing one the
    // panel cannot explain.
    if (snapshot.status !== 'ready') {
      publish({
        status: 'error',
        items: [],
        unreadCount: 0,
        error:
          error instanceof ApiError
            ? error.message
            : 'Something went wrong loading your notifications.',
      });
    }
  } finally {
    loadInFlight = false;
  }
}

// Re-read the newest page: the panel does this every time it opens, because
// the store loads once per page load and the bell outlives client
// navigations. Also the retry handle for the panel's error line.
export function refreshNotifications(): void {
  void loadNotifications();
}

function ensureLoaded(): void {
  if (loadStarted) return;
  loadStarted = true;
  void loadNotifications();
}

// Stamps rows read locally so the panel reflects the change immediately.
// `id` null means every unread row. Only a 'ready' cache may be merged into:
// stamping a 'loading' or 'error' one would invent a list out of nothing.
function applyRead(readAt: string, id: string | null): void {
  if (snapshot.status !== 'ready') return;
  // Before the publish, so a load already in flight discards its now-stale
  // envelope instead of undoing this.
  readEpoch += 1;
  let cleared = 0;
  const items = snapshot.items.map((item) => {
    if (item.readAt !== null || (id !== null && item.id !== id)) return item;
    cleared += 1;
    return { ...item, readAt };
  });
  publish({
    ...snapshot,
    items,
    // Mark-all clears the badge outright; one row can only decrement it,
    // because the count includes unread rows this page never loaded.
    unreadCount: id === null ? 0 : Math.max(0, snapshot.unreadCount - cleared),
  });
}

// AC3. Awaited by the panel, which shows an inline role="alert" line when it
// throws (the app-wide mutation error pattern) rather than pretending the
// badge cleared.
export async function markAllNotificationsRead(): Promise<void> {
  const response = await apiFetch('/api/me/notifications/read-all', { method: 'POST' });
  if (!response.ok) {
    throw new ApiError(`Marking notifications read failed (${response.status}).`, response.status);
  }
  applyRead(new Date().toISOString(), null);
}

// Opening a row is "I have seen this". Deliberately NOT awaited: the click's
// purpose is the navigation, and blocking a user's trip to a run on a
// bookkeeping POST would be a worse bug than a flag that misses. The local
// stamp is optimistic and the next load is authoritative either way.
export function markNotificationRead(id: string): void {
  const target = snapshot.items.find((item) => item.id === id);
  if (!target || target.readAt !== null) return;
  applyRead(new Date().toISOString(), id);
  void apiFetch(`/api/me/notifications/${id}/read`, { method: 'POST' })
    .then((response) => {
      if (!response.ok) throw new ApiError(`Status ${response.status}`, response.status);
    })
    .catch((error: unknown) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Marking a notification read failed', error);
      }
    });
}

function subscribeToNotifications(onStoreChange: () => void): () => void {
  ensureLoaded();
  window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onStoreChange);
  };
}

// The whole snapshot in one read: the bell needs the count, the panel needs
// the rows and the status, and they render together.
export function useNotifications(): NotificationsSnapshot {
  return useSyncExternalStore(
    subscribeToNotifications,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  );
}

// Test-only: puts the module-level cache into a known state without a fetch
// (jest.setup.ts wires this up through src/test/notificationsApiMock.ts).
// Passing null re-arms the initial load.
export function __resetNotificationsStoreForTests(items: AppNotification[] | null = null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetNotificationsStoreForTests is not available in production');
  }
  loadStarted = items !== null;
  loadInFlight = false;
  // Retires any load left in flight by the previous test.
  readEpoch += 1;
  snapshot =
    items === null
      ? INITIAL_SNAPSHOT
      : {
          status: 'ready',
          items,
          unreadCount: items.filter((item) => item.readAt === null).length,
          error: null,
        };
}

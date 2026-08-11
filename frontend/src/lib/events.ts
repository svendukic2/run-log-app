'use client';

// The API-backed events store (RUN-68), following the runs store pattern
// decided in RUN-48: data lives in PostgreSQL behind /api/events, this
// module holds an in-memory cache loaded once per page load and updated by
// every mutation, so components read synchronously through useEvents().
// Pure types, formatters and form helpers live in eventMath.ts and are
// re-exported here.
//
// Two deliberate differences from runs.ts:
//
// - No fresh-device short-circuit. A device with no account has an empty
//   RUN LOG by definition, but events are community-wide: an empty cache
//   would lie about events other people created. Opening the Events page
//   therefore always asks the server, which on a fresh device mints its
//   device account (session.ts) - a user action asking for shared data, not
//   a crawler-triggered page view, and the trade-off dies with the real
//   sign-in screens (RUN-58).
//
// - The list endpoint is paginated (shared envelope), so the initial load
//   walks pages until it holds every event. Fine at community scale; if
//   events ever outgrow this, the page itself should learn to page.
//
// Module-level mutable state is safe here for the runs.ts reasons: every
// write goes through publish() (throws on the server), and the
// useSyncExternalStore server snapshot is the frozen INITIAL_SNAPSHOT.
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { ApiError, apiFetch } from './session';
import {
  compareEventsChronological,
  dedupeEventsById,
  isCommunityEvent,
  type CommunityEvent,
  type CommunityEventDraft,
} from './eventMath';

export * from './eventMath';

// Announces every cache change to this tab's subscribers, so the page
// behind the create modal refreshes on save and a Join flips every card
// reading the same event.
const EVENTS_CHANGED_EVENT = 'runlog:events-changed';

/* Store ---------------------------------------------------------------------- */

export type EventsStatus = 'loading' | 'ready' | 'error';

// Same contract as RunsError: `terminal` marks failures no retry can fix,
// so the boundary can drop its "Try again" instead of offering a button
// that lies.
export interface EventsError {
  message: string;
  terminal: boolean;
}

interface EventsSnapshot {
  status: EventsStatus;
  events: CommunityEvent[];
  error: EventsError | null;
}

const INITIAL_SNAPSHOT: EventsSnapshot = Object.freeze({
  status: 'loading' as const,
  events: [],
  error: null,
});

let snapshot: EventsSnapshot = INITIAL_SNAPSHOT;
let loadStarted = false;
let loadInFlight = false;

function publish(next: EventsSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new Event(EVENTS_CHANGED_EVENT));
}

function sortChronological(events: CommunityEvent[]): CommunityEvent[] {
  return [...events].sort(compareEventsChronological);
}

function parseEventBody(body: unknown): CommunityEvent {
  if (!isCommunityEvent(body)) {
    throw new ApiError('The server returned an event in an unexpected shape.');
  }
  return body;
}

// The server pages at most 100 rows per request (MAX_PAGE_SIZE); the page
// wants all of them grouped. Walking by page count (not by comparing
// collected to `total`) terminates even when rows land or vanish between
// requests; the ceiling turns a runaway loop into a loud error.
const LOAD_PAGE_SIZE = 100;
const MAX_LOAD_PAGES = 50;

async function fetchAllEvents(): Promise<CommunityEvent[]> {
  const collected: CommunityEvent[] = [];
  for (let page = 1; page <= MAX_LOAD_PAGES; page += 1) {
    const response = await apiFetch(`/api/events?page=${page}&pageSize=${LOAD_PAGE_SIZE}`);
    if (!response.ok) {
      throw new ApiError(`Loading events failed (${response.status}).`, response.status);
    }
    const body: unknown = await response.json();
    const envelope = body as { items?: unknown; total?: unknown };
    // A malformed body is an error, not an empty community: an empty page
    // lies, a retry card does not (the runs precedent).
    if (
      !Array.isArray(envelope?.items) ||
      !envelope.items.every(isCommunityEvent) ||
      typeof envelope.total !== 'number'
    ) {
      throw new ApiError('The server returned events in an unexpected shape.');
    }
    collected.push(...envelope.items);
    if (collected.length >= envelope.total || envelope.items.length < LOAD_PAGE_SIZE) {
      // Offset pages are not one snapshot: a row created by someone else
      // mid-walk shifts the boundary and the same event arrives twice,
      // which would reach React as a duplicate key. Last write wins.
      return dedupeEventsById(collected);
    }
  }
  throw new ApiError('Loading events failed (too many pages).');
}

function toEventsError(error: unknown): EventsError {
  if (error instanceof ApiError) {
    return { message: error.message, terminal: error.terminal };
  }
  return { message: 'Something went wrong loading events.', terminal: false };
}

// A load requested while another is in flight must not be dropped: the
// in-flight walk publishes pages fetched BEFORE whatever prompted the new
// request (say, a create from the header while the first load runs), so
// coalescing into it would silently lose that mutation. The queued flag
// makes the settling load run once more with fresh reads.
let reloadQueued = false;

async function loadEvents(): Promise<void> {
  if (loadInFlight) {
    reloadQueued = true;
    return;
  }
  loadInFlight = true;
  publish({ status: 'loading', events: [], error: null });
  try {
    const events = await fetchAllEvents();
    publish({ status: 'ready', events: sortChronological(events), error: null });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Loading events failed', error);
    }
    publish({ status: 'error', events: [], error: toEventsError(error) });
  } finally {
    loadInFlight = false;
    if (reloadQueued) {
      reloadQueued = false;
      void loadEvents();
    }
  }
}

// The retry handle for the error state (EventsBoundary's "Try again").
export function reloadEvents(): void {
  void loadEvents();
}

function ensureLoaded(): void {
  if (loadStarted) return;
  loadStarted = true;
  void loadEvents();
}

// The cached events, synchronously. Empty while loading or errored:
// callers that must tell those apart gate on useEventsStatus() (the
// boundary does this once per screen).
export function getEvents(): CommunityEvent[] {
  return snapshot.events;
}

// A successful mutation may only merge into a cache that is 'ready';
// merging into 'loading' or 'error' would fabricate a full community out of
// one row (the create button lives in the page header, OUTSIDE the
// boundary). Same rule as the runs store.
function mergeAfterMutation(events: CommunityEvent[]): void {
  if (snapshot.status === 'ready') {
    publish({ ...snapshot, events: sortChronological(events) });
  } else {
    void loadEvents();
  }
}

// Creates through the API and merges the new event into the cache, so the
// grouped page behind the modal shows it at once (AC3).
export async function createEvent(draft: CommunityEventDraft): Promise<CommunityEvent> {
  const response = await apiFetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  if (!response.ok) {
    throw new ApiError(`Creating the event failed (${response.status}).`, response.status);
  }
  const event = parseEventBody(await response.json());
  mergeAfterMutation([event, ...snapshot.events]);
  return event;
}

// The 404 eviction every membership path shares: the event was deleted
// under us, so the ghost row leaves the cache (and the card with it, which
// is the whole explanation the user gets - a message on the card could
// never render, the card unmounts in the same publish).
function dropEvent(id: string): void {
  mergeAfterMutation(snapshot.events.filter((event) => event.id !== id));
}

// Replaces one row with what the server just answered. Join and leave
// return the UPDATED event (review fix): the flipped flag and the fresh
// participant count arrive in the mutation's own response, so there is no
// follow-up read that could fail after the membership already changed.
function mergeEvent(fresh: CommunityEvent): void {
  mergeAfterMutation([fresh, ...snapshot.events.filter((event) => event.id !== fresh.id)]);
}

// Joins through the API; the response is the updated event and the cache
// takes it as-is (AC2). Idempotent server-side: a repeat POST answers the
// same event.
export async function joinEvent(id: string): Promise<void> {
  const response = await apiFetch(`/api/events/${id}/join`, { method: 'POST' });
  if (response.status === 404) {
    dropEvent(id);
    return;
  }
  if (!response.ok) {
    throw new ApiError(`Joining the event failed (${response.status}).`, response.status);
  }
  mergeEvent(parseEventBody(await response.json()));
}

// Leaves through the API; same shape as joinEvent. The owner never sees a
// Leave button (`mine` gates it), so the server's owner-400 here surfaces
// only if a stale UI raced an ownership change - the inline error line
// handles it like any failure.
export async function leaveEvent(id: string): Promise<void> {
  const response = await apiFetch(`/api/events/${id}/join`, { method: 'DELETE' });
  if (response.status === 404) {
    dropEvent(id);
    return;
  }
  if (!response.ok) {
    throw new ApiError(`Leaving the event failed (${response.status}).`, response.status);
  }
  mergeEvent(parseEventBody(await response.json()));
}

// The detail page's stale-cache escape hatch: the store loads once per
// page load, so an event created after that (reached by a link) is absent
// from the cache while being perfectly real. One by-id read settles it -
// merged when found, evicted when the server confirms it is gone. Errors
// resolve false so the caller can fall back to its not-found state instead
// of crashing the view.
export async function ensureEvent(id: string): Promise<boolean> {
  try {
    const response = await apiFetch(`/api/events/${id}`);
    if (response.status === 404) {
      dropEvent(id);
      return false;
    }
    if (!response.ok) return false;
    mergeEvent(parseEventBody(await response.json()));
    return true;
  } catch {
    return false;
  }
}

function subscribeToEvents(onStoreChange: () => void): () => void {
  ensureLoaded();
  window.addEventListener(EVENTS_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(EVENTS_CHANGED_EVENT, onStoreChange);
  };
}

// True inside an EventsBoundary that has settled - the same forgotten-gate
// alarm as RunsGateContext (see useRuns for the reasoning).
export const EventsGateContext = createContext(false);

export function useEvents(): CommunityEvent[] {
  const gated = useContext(EventsGateContext);
  const current = useSyncExternalStore(
    subscribeToEvents,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  );
  const status = current.status;
  // In an effect, not in render: SSR legitimately renders the pre-hydration
  // shell from the initial 'loading' snapshot (the useRuns reasoning).
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && !gated && status === 'loading') {
      throw new Error(
        'useEvents() read while the store is still loading, outside an EventsBoundary: this screen would flash its empty state. Wrap it in <EventsBoundary> (see docs/data-model.md, "The frontend API pattern").',
      );
    }
  }, [gated, status]);
  return current.events;
}

export function useEventsStatus(): EventsStatus {
  return useSyncExternalStore(
    subscribeToEvents,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).status;
}

export function useEventsError(): EventsError | null {
  return useSyncExternalStore(
    subscribeToEvents,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).error;
}

// Test-only: puts the module-level cache into a known state without a
// fetch (jest.setup.ts wires this up through src/test/eventsApiMock.ts).
// Passing null re-arms the initial load.
export function __resetEventsStoreForTests(events: CommunityEvent[] | null = null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetEventsStoreForTests is not available in production');
  }
  loadStarted = events !== null;
  loadInFlight = false;
  snapshot =
    events === null
      ? INITIAL_SNAPSHOT
      : { status: 'ready', events: sortChronological(events), error: null };
}

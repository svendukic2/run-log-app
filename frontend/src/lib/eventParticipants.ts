'use client';

// The event detail page's participants + leaderboard store (RUN-69),
// following the RUN-48 pattern like every other store: an in-memory cache
// behind useSyncExternalStore, so components read synchronously.
//
// One deliberate difference from events.ts, runs.ts and the rest: this is
// per-event data, not app-wide data, so the cache is a SINGLE SLOT holding
// whichever event is currently open rather than a map keyed by id. One
// detail page is open at a time, and a map would only grow for the
// lifetime of the tab.
//
// The slot is a render cache, not a source of truth: it is re-read on
// every visit to the page and after every membership change, because
// neither this module nor the events store can know that a run was logged
// (or that Join was clicked from the list, which invalidates nothing here)
// since it filled. What the cards show is therefore the last SUCCESSFUL
// read of the open event - the rows stay put while the next read runs, so
// the refresh costs no spinner.
//
// Nothing here is gated by a screen-level boundary either: the two lists
// are cards INSIDE the detail page, so their loading and error states are
// local to those cards - the page around them (name, dates, Join) is
// already readable from the events store.
import { useEffect, useSyncExternalStore } from 'react';
import { ApiError, apiFetch } from './session';
import { isEventParticipant, type EventParticipant } from './eventMath';

const PARTICIPANTS_CHANGED_EVENT = 'runlog:event-participants-changed';

export type ParticipantsStatus = 'loading' | 'ready' | 'error';

interface ParticipantsSnapshot {
  // Which event the cache currently describes; null before the first load.
  eventId: string | null;
  status: ParticipantsStatus;
  participants: EventParticipant[];
  error: string | null;
}

const INITIAL_SNAPSHOT: ParticipantsSnapshot = Object.freeze({
  eventId: null,
  status: 'loading' as const,
  participants: [],
  error: null,
});

let snapshot: ParticipantsSnapshot = INITIAL_SNAPSHOT;
// The event a load is currently running for, or null when none is. Read
// only to collapse React's double effect in development, never to decide
// whether a read is still needed.
let inFlightFor: string | null = null;
// Bumped by every load, so a resolving answer can tell whether it is still
// the newest one. An id is not enough (review fix): two loads of the SAME
// event race after a join, and without this the slower - pre-join - answer
// wins simply by landing last.
let loadToken = 0;

function publish(next: ParticipantsSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new Event(PARTICIPANTS_CHANGED_EVENT));
}

async function fetchParticipants(eventId: string): Promise<EventParticipant[]> {
  const response = await apiFetch(`/api/events/${eventId}/participants`);
  if (!response.ok) {
    throw new ApiError(`Loading participants failed (${response.status}).`, response.status);
  }
  const body = (await response.json()) as { items?: unknown };
  // A malformed body is an error, not an empty event: an empty list would
  // claim nobody joined an event that always has at least its owner.
  if (!Array.isArray(body?.items) || !body.items.every(isEventParticipant)) {
    throw new ApiError('The server returned participants in an unexpected shape.');
  }
  return body.items;
}

async function load(eventId: string): Promise<void> {
  const token = (loadToken += 1);
  inFlightFor = eventId;
  // Re-reading the event already on screen keeps its rows visible while
  // the fresh ones arrive: the same list, seconds older. Only a first
  // read, a different event, or a retry after failure blanks to
  // 'loading'. The rule this buys, in one sentence: the cards show the
  // last SUCCESSFUL read of this event, re-read on every visit and after
  // every membership change.
  const refreshingInPlace = snapshot.eventId === eventId && snapshot.status === 'ready';
  if (!refreshingInPlace) {
    publish({ eventId, status: 'loading', participants: [], error: null });
  }
  try {
    const participants = await fetchParticipants(eventId);
    if (token !== loadToken) return;
    publish({ eventId, status: 'ready', participants, error: null });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Loading event participants failed', error);
    }
    // A failed refresh must not throw away rows that were true a moment
    // ago; the next visit or the next membership change corrects them.
    if (token !== loadToken || refreshingInPlace) return;
    publish({
      eventId,
      status: 'error',
      participants: [],
      error:
        error instanceof ApiError
          ? error.message
          : 'Something went wrong loading the participants.',
    });
  } finally {
    if (token === loadToken) inFlightFor = null;
  }
}

// Reads this event's participants, from an effect and never during render.
// Deliberately NOT "unless the cache already holds this event" (review
// fix): a cache that skipped the read would keep serving the board from
// the first visit, so a run logged in between - or a Join clicked on the
// list page, which does not invalidate anything - would never show up.
// One read per page visit is the honest refresh, and it costs nothing
// visible because the rows stay on screen while it runs. The guard below
// only collapses React's double effect.
function ensureLoaded(eventId: string): void {
  if (inFlightFor === eventId) return;
  void load(eventId);
}

// The retry handle, and the refresh a membership change needs: joining or
// leaving from the detail page changes who is on both lists, and the row
// counts are computed server-side, so the honest update is a reload.
export function reloadParticipants(eventId: string): void {
  void load(eventId);
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(PARTICIPANTS_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(PARTICIPANTS_CHANGED_EVENT, onStoreChange);
  };
}

// The store for one event. While the cache still describes a DIFFERENT
// event (the beat between mounting and the effect below), callers see
// 'loading' rather than the previous event's runners - a wrong list is
// worse than a spinner.
export function useEventParticipants(eventId: string): {
  status: ParticipantsStatus;
  participants: EventParticipant[];
  error: string | null;
} {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  );

  useEffect(() => {
    ensureLoaded(eventId);
  }, [eventId]);

  if (current.eventId !== eventId) {
    return { status: 'loading', participants: [], error: null };
  }
  return {
    status: current.status,
    participants: current.participants,
    error: current.error,
  };
}

// Test-only: puts the cache into a known state without a fetch. Passing
// null re-arms the load (jest.setup.ts wires this up via eventsApiMock).
export function __resetEventParticipantsForTests(
  eventId: string | null = null,
  participants: EventParticipant[] = [],
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetEventParticipantsForTests is not available in production');
  }
  inFlightFor = null;
  loadToken += 1;
  snapshot =
    eventId === null ? INITIAL_SNAPSHOT : { eventId, status: 'ready', participants, error: null };
}

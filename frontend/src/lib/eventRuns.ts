'use client';

// The event detail page's run feed (RUN-76 AC2): the runs tagged to whichever
// event is open.
//
// A copy of eventParticipants.ts, and deliberately a copy rather than a
// generalisation: this is the SAME shape (per-event data, a single slot, card-
// level loading and error states, re-read on every visit) applied to a second
// question, and two 150-line modules that each read one endpoint are easier to
// follow than one abstraction with an endpoint parameter. The ticket names that
// module as the shape to copy.
//
// Its own store rather than a second field on the participants one, because the
// two cards on that page fail and retry independently: a run feed that did not
// load must not take the leaderboard down with it.
import { useEffect, useSyncExternalStore } from 'react';
import { isEventRun, type EventRun } from './eventMath';
import { ApiError, apiFetch } from './session';

const EVENT_RUNS_CHANGED_EVENT = 'runlog:event-runs-changed';

export type EventRunsStatus = 'loading' | 'ready' | 'error';

interface EventRunsSnapshot {
  // Which event the cache currently describes; null before the first load.
  eventId: string | null;
  status: EventRunsStatus;
  runs: EventRun[];
  error: string | null;
}

const INITIAL_SNAPSHOT: EventRunsSnapshot = Object.freeze({
  eventId: null,
  status: 'loading' as const,
  runs: [],
  error: null,
});

let snapshot: EventRunsSnapshot = INITIAL_SNAPSHOT;
// The event a load is running for, or null. Read only to collapse React's
// double effect in development.
let inFlightFor: string | null = null;
// Bumped by every load, so a resolving answer can tell whether it is still the
// newest one. An id alone is not enough: two loads of the same event race after
// a run is tagged or untagged.
let loadToken = 0;

function publish(next: EventRunsSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new Event(EVENT_RUNS_CHANGED_EVENT));
}

async function fetchEventRuns(eventId: string): Promise<EventRun[]> {
  const response = await apiFetch(`/api/events/${eventId}/runs`);
  if (!response.ok) {
    throw new ApiError(`Loading the event's runs failed (${response.status}).`, response.status);
  }
  const body = (await response.json()) as { items?: unknown };
  // A malformed body is an error, not an empty event: an empty feed is a real
  // state (nobody has tagged a run yet) and must not be what a broken response
  // looks like.
  if (!Array.isArray(body?.items) || !body.items.every(isEventRun)) {
    throw new ApiError("The server returned the event's runs in an unexpected shape.");
  }
  return body.items;
}

async function load(eventId: string): Promise<void> {
  const token = (loadToken += 1);
  inFlightFor = eventId;
  // Re-reading the event already on screen keeps its rows visible while the
  // fresh ones arrive. Only a first read, a different event, or a retry after
  // failure blanks to 'loading'.
  const refreshingInPlace = snapshot.eventId === eventId && snapshot.status === 'ready';
  if (!refreshingInPlace) {
    publish({ eventId, status: 'loading', runs: [], error: null });
  }
  try {
    const runs = await fetchEventRuns(eventId);
    if (token !== loadToken) return;
    publish({ eventId, status: 'ready', runs, error: null });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("Loading the event's runs failed", error);
    }
    // A failed refresh must not throw away rows that were true a moment ago.
    if (token !== loadToken || refreshingInPlace) return;
    publish({
      eventId,
      status: 'error',
      runs: [],
      error:
        error instanceof ApiError
          ? error.message
          : "Something went wrong loading the event's runs.",
    });
  } finally {
    if (token === loadToken) inFlightFor = null;
  }
}

// One read per page visit, which is exactly what AC6 asks for: a run untagged or
// deleted elsewhere is reflected on the NEXT read, and this store has no way to
// learn about either without one. The guard only collapses React's double
// effect; it deliberately does not skip the read when the cache already holds
// this event.
function ensureLoaded(eventId: string): void {
  if (inFlightFor === eventId) return;
  void load(eventId);
}

export function reloadEventRuns(eventId: string): void {
  void load(eventId);
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(EVENT_RUNS_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(EVENT_RUNS_CHANGED_EVENT, onStoreChange);
  };
}

// While the cache still describes a DIFFERENT event (the beat between mounting
// and the effect below), callers see 'loading' rather than another event's runs.
export function useEventRuns(eventId: string): {
  status: EventRunsStatus;
  runs: EventRun[];
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
    return { status: 'loading', runs: [], error: null };
  }
  return { status: current.status, runs: current.runs, error: current.error };
}

// Test-only: puts the cache into a known state without a fetch. Passing null
// re-arms the load (jest.setup.ts wires this up via eventsApiMock).
export function __resetEventRunsForTests(
  eventId: string | null = null,
  runs: EventRun[] = [],
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetEventRunsForTests is not available in production');
  }
  inFlightFor = null;
  loadToken += 1;
  snapshot =
    eventId === null ? INITIAL_SNAPSHOT : { eventId, status: 'ready', runs, error: null };
}

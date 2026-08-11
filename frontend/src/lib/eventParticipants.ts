'use client';

// The event detail page's participants + leaderboard store (RUN-69),
// following the RUN-48 pattern like every other store: an in-memory cache
// behind useSyncExternalStore, so components read synchronously.
//
// One deliberate difference from events.ts, runs.ts and the rest: this is
// per-event data, not app-wide data, so the cache is a SINGLE SLOT holding
// whichever event is currently open rather than a map keyed by id. One
// detail page is open at a time; a map would grow for the lifetime of the
// tab and serve a stale board the moment someone logs a run. Switching
// events therefore reloads, which is exactly what a visitor expects.
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
// The id of the load currently in flight, so a slower answer for a
// previously open event cannot overwrite the one the user is looking at.
let inFlightFor: string | null = null;

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
  inFlightFor = eventId;
  publish({ eventId, status: 'loading', participants: [], error: null });
  try {
    const participants = await fetchParticipants(eventId);
    if (inFlightFor !== eventId) return;
    publish({ eventId, status: 'ready', participants, error: null });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Loading event participants failed', error);
    }
    if (inFlightFor !== eventId) return;
    publish({
      eventId,
      status: 'error',
      participants: [],
      error:
        error instanceof ApiError
          ? error.message
          : 'Something went wrong loading the participants.',
    });
  }
}

// Loads this event's participants unless the cache already describes it.
// Called from an effect, never during render.
function ensureLoaded(eventId: string): void {
  if (snapshot.eventId === eventId || inFlightFor === eventId) return;
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
  snapshot =
    eventId === null ? INITIAL_SNAPSHOT : { eventId, status: 'ready', participants, error: null };
}

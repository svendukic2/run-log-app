'use client';

// The run form's event options (RUN-76 AC1): the events the signed-in runner
// has joined that cover a given day.
//
// A COMMAND, NOT A STORE, and deliberately so - the routePlan.ts precedent
// (RUN-54). Three questions decide it, the same three as there:
//   would a second screen read this?      No. It exists for one open modal.
//   does it outlive the modal?            No. The answer is only valid for one
//                                         date, and the date is a form field.
//   is it worth caching?                  No. A cache keyed by date would be
//                                         invalidated by joining or leaving an
//                                         event, which this module cannot see.
// So there is no cache, no useSyncExternalStore and no AppDataBoundary. What it
// does keep from the store pattern is the half that matters: the call is
// awaited, the caller owns an inline failure line, and nothing on screen claims
// an option that the server did not offer.
import { isTaggableEvent, type TaggableEvent } from './eventMath';
import { ApiError, apiFetch } from './session';

export type { TaggableEvent };

// The events this run's date may be tagged to, newest window last (the API's
// own chronological order). An empty list is an ordinary answer: most people
// have joined nothing covering most days.
export async function fetchTaggableEvents(date: string): Promise<TaggableEvent[]> {
  const response = await apiFetch(
    `/api/events/taggable?date=${encodeURIComponent(date)}`,
  );
  if (!response.ok) {
    throw new ApiError(`Loading your events failed (${response.status}).`, response.status);
  }
  const body = (await response.json()) as { items?: unknown };
  // A malformed body is an error, not an empty list: "no events" is a real
  // answer here, so it must not be what a broken response looks like.
  if (!Array.isArray(body?.items) || !body.items.every(isTaggableEvent)) {
    throw new ApiError('The server returned events in an unexpected shape.');
  }
  return body.items;
}

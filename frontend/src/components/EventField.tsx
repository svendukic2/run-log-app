'use client';

// The run form's event picker (RUN-76 AC1): "No event", plus every event the
// runner has joined that covers the date currently in the form.
//
// The options depend on another field, which is the whole reason this owns a
// fetch instead of taking a list as a prop: the date is editable, and the set of
// legal events changes with it. Re-read on every date change, discarding stale
// answers, because a date field emits one change per keystroke.
//
// It offers exactly what the API accepts (GET /api/events/taggable answers the
// same question runs.service enforces on the write), so a legal choice here
// cannot be rejected on save - but the enforcement is still the server's. This
// is a form, not a gate.
//
// ONE state object keyed by the date it describes, rather than separate
// events/error/loading pieces. That is not tidiness: it means the answer for a
// stale date is DERIVED as absent (`loaded.date !== date`) instead of having to
// be cleared, so nothing here sets state synchronously inside the effect - the
// pattern react-hooks/set-state-in-effect exists to stop, and the same shape
// RouteStep landed on in RUN-54.
import { useEffect, useRef, useState } from 'react';
import { fetchTaggableEvents, type TaggableEvent } from '@/lib/taggableEvents';
import { mutationErrorMessage } from '@/lib/session';

export const EVENT_FIELD_ID = 'run-event';

// '' is "No event", which is what the API is sent as null (toRunDraft).
export const NO_EVENT = '';

interface LoadedOptions {
  // The date these options answer for. Anything else on screen is stale.
  date: string;
  events: TaggableEvent[];
  error: string | null;
  // Set when this date made the chosen event illegal, so the reset is
  // announced instead of silent.
  droppedTag: boolean;
}

const NOTHING_LOADED: LoadedOptions = {
  date: '',
  events: [],
  error: null,
  droppedTag: false,
};

interface EventFieldProps {
  // The date the form currently holds, in yyyy-mm-dd. '' while the field is
  // empty or mid-typing, in which case there is nothing to ask about.
  date: string;
  value: string;
  onChange: (eventId: string) => void;
}

export default function EventField({ date, value, onChange }: EventFieldProps) {
  const [loaded, setLoaded] = useState<LoadedOptions>(NOTHING_LOADED);
  // Bumped per request, so a slow answer for an earlier date cannot land on top
  // of a newer one - the same reason the per-entity stores carry a load token.
  const requestRef = useRef(0);
  // Read inside the effect below, which must not depend on it: the effect re-runs
  // on the DATE, and re-running it whenever the selection changes would refetch
  // on every pick.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  useEffect(() => {
    const request = (requestRef.current += 1);
    // No date, nothing to ask. The render below already treats the previous
    // answer as stale, so there is nothing to clear.
    if (!date) return;

    void fetchTaggableEvents(date)
      .then((events) => {
        if (requestRef.current !== request) return;
        // The chosen event no longer covers this date, or is no longer one the
        // runner is in. Clearing it here is what stops the save from being
        // rejected by a rule the form was already able to see - and saying so is
        // what stops that from being a silent untag.
        const chosen = valueRef.current;
        const droppedTag =
          chosen !== NO_EVENT && !events.some((event) => event.id === chosen);
        setLoaded({ date, events, error: null, droppedTag });
        if (droppedTag) onChange(NO_EVENT);
      })
      .catch((failure: unknown) => {
        if (requestRef.current !== request) return;
        // A failed read costs the OPTIONS, never the run: the field falls back
        // to "No event" and the rest of the form saves exactly as it would
        // have. Deliberately not a blocked save - an event tag is optional, and
        // the events endpoint being down is not a reason to lose a run.
        setLoaded({
          date,
          events: [],
          error: mutationErrorMessage(failure),
          droppedTag: false,
        });
      });
  }, [date, onChange]);

  // The OPTIONS stay on screen while the next read runs, even though they answer
  // the previous date - the same rule the per-entity stores follow for their
  // rows, and here it is load-bearing rather than cosmetic: a <select> whose
  // value matches none of its options renders as "No event", so dropping the
  // list mid-read would show "No event" while the form still held a tag, and a
  // save in that window would submit something the field was not displaying.
  //
  // The MESSAGES below are a different matter: an error or a "we cleared it"
  // line from the previous date would be a claim about this one, so those are
  // shown only when the answer on screen is for the date in the form.
  const stale = loaded.date !== date;
  const events = loaded.events;
  const loading = stale && date !== '';
  const current = stale ? null : loaded;

  // The chosen event is not among the options: the read failed, or it has not
  // arrived yet on an edit. It still needs an option of its own, and the control
  // still needs to be usable (review finding): a <select> whose value matches no
  // option renders as "No event", so without this the field would show "No
  // event" while the form submitted a tag - and a disabled one would leave no way
  // to clear it either.
  const chosenIsMissing =
    value !== NO_EVENT && !events.some((event) => event.id === value);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={EVENT_FIELD_ID} className="text-[13px] font-medium text-secondary">
        Event (optional)
      </label>
      <select
        id={EVENT_FIELD_ID}
        name={EVENT_FIELD_ID}
        value={value}
        onChange={(event) => {
          // A deliberate pick answers the "we cleared it for you" line.
          setLoaded((options) => ({ ...options, droppedTag: false }));
          onChange(event.target.value);
        }}
        // Nothing to choose between: still loading, no joined event covers this
        // date, or the read failed. Left mounted and disabled rather than
        // removed, so the form does not change shape while someone types a date.
        // Never disabled while a tag is set, though - see chosenIsMissing.
        disabled={events.length === 0 && !chosenIsMissing}
        // Same 16px-on-a-phone rule as TextField: iOS zooms into anything
        // smaller.
        className="w-full rounded-[12px] border border-line-strong bg-white px-[15px] py-[13px] text-[16px] leading-[1.55] text-ink disabled:text-tertiary sm:text-[15px]"
      >
        <option value={NO_EVENT}>No event</option>
        {/* Named generically because the name is exactly what is not available
            here: either the read that would have supplied it failed, or it has
            not landed yet. */}
        {chosenIsMissing && <option value={value}>This run&apos;s event</option>}
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.name}
          </option>
        ))}
      </select>

      {current?.error ? (
        // role=alert, like every other inline failure in this app. It reports a
        // missing choice, not a missing run.
        <p role="alert" className="text-[13px] leading-[1.5] text-accent-pressed">
          {current.error} You can still save this run without an event.
        </p>
      ) : current?.droppedTag ? (
        // Two causes, one sentence, because both are true of it: the date moved
        // out of the event's window, or the runner left the event (review
        // finding - the earlier wording claimed the first one either way).
        <p role="status" className="text-[13px] leading-[1.5] text-secondary">
          Set to No event: this date is not covered by an event you have joined.
        </p>
      ) : loading ? (
        <p className="text-[13px] leading-[1.5] text-tertiary">Loading your events…</p>
      ) : events.length === 0 && date ? (
        <p className="text-[13px] leading-[1.5] text-tertiary">
          You have not joined an event covering this date.
        </p>
      ) : null}
    </div>
  );
}

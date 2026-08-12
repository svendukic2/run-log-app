'use client';

// The event's tagged runs (RUN-76 AC2): who ran what, for this event. Sits
// below the leaderboard and the participant list on the event detail page.
//
// It owns its own read, its own loading line and its own retry, because it is a
// card and not a screen: the header above it is already readable from the events
// store, and the two cards beside it must not go down with it (the reasoning
// eventParticipants.ts sets out for that page).
import Link from 'next/link';
import { initialsOf } from '@/lib/events';
import { reloadEventRuns, useEventRuns } from '@/lib/eventRuns';
import { personRoute } from '@/lib/routes';
import { formatDateShort, formatDistanceKm, formatDuration } from '@/lib/runs';

const CARD = 'rounded-[18px] border border-line bg-white';

export default function EventRunsCard({ eventId }: { eventId: string }) {
  const { status, runs, error } = useEventRuns(eventId);

  return (
    <section className={`${CARD} px-[24px] py-[22px]`} aria-labelledby="event-runs-heading">
      <h2
        id="event-runs-heading"
        className="pb-[14px] text-[11px] font-medium tracking-[0.66px] text-tertiary uppercase"
      >
        Runs in this event
        {status === 'ready' && (
          <span className="pl-2 tracking-normal normal-case">{runs.length}</span>
        )}
      </h2>

      {status === 'loading' && (
        <p role="status" className="px-[10px] py-[6px] text-[13.5px] text-secondary">
          Loading runs…
        </p>
      )}

      {status === 'error' && (
        <div role="alert" className="flex flex-col items-start gap-[10px] px-[10px] py-[6px]">
          <p className="text-[13.5px] leading-[1.55] text-secondary">
            {error ?? "Something went wrong loading the event's runs."}
          </p>
          <button
            type="button"
            onClick={() => reloadEventRuns(eventId)}
            className="rounded-[12px] bg-accent px-[22px] py-[11px] text-[14px] font-semibold text-white hover:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty is a real state, not a failure: an event has runs only once
          somebody tags one to it, which since RUN-76 is a deliberate act rather
          than a side effect of joining. */}
      {status === 'ready' && runs.length === 0 && (
        <p className="px-[10px] py-[6px] text-[13.5px] leading-[1.55] text-secondary">
          No runs yet. Tag a run to this event when you log it and it will show up here.
        </p>
      )}

      {status === 'ready' && runs.length > 0 && (
        <ul className="flex flex-col">
          {runs.map((run) => (
            <li
              key={run.id}
              className="relative flex items-center gap-3 border-b border-line px-[10px] py-[11px] last:border-b-0"
            >
              <span
                aria-hidden="true"
                className="grid size-[34px] shrink-0 place-items-center rounded-full bg-muted text-[12px] font-semibold text-secondary"
              >
                {initialsOf(run.runner.firstName, run.runner.lastName)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                {/* The row's whole area is the link, which is what gets a
                    14px name to the 44px tap target a phone needs (RUN-75 AC3,
                    the participants card's pattern). It works here for the same
                    reason: nothing else in the row is interactive. */}
                <Link
                  href={personRoute(run.runner.id)}
                  className="truncate text-[14px] font-medium text-text-primary pointer-coarse:after:absolute pointer-coarse:after:inset-0 pointer-coarse:after:content-[''] hover:text-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {run.runner.firstName} {run.runner.lastName}
                </Link>
                <span className="text-[12.5px] text-tertiary">{formatDateShort(run.date)}</span>
              </div>
              {/* tabular-nums so the two columns line up down the list rather
                  than shifting with each digit. */}
              <span className="shrink-0 text-right text-[14px] font-semibold text-text-primary tabular-nums">
                {formatDistanceKm(run.distanceKm)}
              </span>
              <span className="w-[62px] shrink-0 text-right text-[13px] text-secondary tabular-nums">
                {formatDuration(run.durationSeconds)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

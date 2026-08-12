'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import EventLeaderboardCard from '@/components/EventLeaderboardCard';
import EventParticipantsCard from '@/components/EventParticipantsCard';
import EventRoutesCard from '@/components/EventRoutesCard';
import EventRunsCard from '@/components/EventRunsCard';
import EventStateChips from '@/components/EventStateChips';
import JoinEventButton from '@/components/JoinEventButton';
import {
  ensureEvent,
  formatEventWindow,
  formatKm,
  formatParticipantCount,
  useEvents,
  type CommunityEvent,
} from '@/lib/events';
import { reloadParticipants, useEventParticipants } from '@/lib/eventParticipants';
import { ROUTES } from '@/lib/routes';

const CARD = 'rounded-[18px] border border-line bg-white';

// The event detail page (RUN-69): header facts with the Join action, the
// description, then the participant list and the event leaderboard.
//
// The event itself comes from the events store the page is gated on, so
// the header renders immediately. The two lists come from their own
// per-event store and are therefore gated INSIDE their column: their
// loading and error states never withhold the header, which is the part a
// shared link is usually about.
export default function EventDetailView({ eventId }: { eventId: string }) {
  const events = useEvents();
  const event = events.find((candidate) => candidate.id === eventId);
  // The cache loads once per page load, so an event created after that is
  // absent while being perfectly real (a link someone shared). A cache
  // miss therefore earns one by-id read before the page claims the event
  // does not exist; 'checking' renders nothing for the beat the read
  // takes, exactly like the boundary's pre-spinner moment.
  const [lookedUp, setLookedUp] = useState(false);

  useEffect(() => {
    if (event || lookedUp) return;
    let cancelled = false;
    void ensureEvent(eventId).finally(() => {
      if (!cancelled) setLookedUp(true);
    });
    return () => {
      cancelled = true;
    };
  }, [event, lookedUp, eventId]);

  if (!event && !lookedUp) return null;

  if (!event) {
    // The by-id read above also came back empty, so the id is genuinely
    // unknown (or just deleted), not merely missing from a stale cache.
    return (
      <section
        className={`${CARD} mx-5 mb-6 flex flex-col items-start gap-[10px] p-[28px] sm:mx-8 lg:mx-[40px]`}
      >
        <h1 className="font-display text-[19px] font-bold tracking-[-0.3px] text-text-primary">
          This event doesn&apos;t exist
        </h1>
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          It may have been deleted by its owner.
        </p>
        <Link
          href={ROUTES.events}
          className="mt-[6px] text-[14px] font-semibold text-accent hover:text-accent-pressed"
        >
          ← Back to events
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]">
      <nav aria-label="Breadcrumb" className="pt-6 lg:pt-[32px]">
        <Link
          href={ROUTES.events}
          className="text-[13px] font-medium text-secondary hover:text-ink"
        >
          ← Events
        </Link>
      </nav>

      <header className="flex flex-col gap-[10px] sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-[10px]">
          <EventStateChips event={event} />
          {/* An event name is free text too, and the parent's min-w-0 only
              shrinks the box - the token still needs permission to break
              (RUN-75, AC2). */}
          <h1 className="font-display text-[24px] font-bold tracking-[-0.6px] break-words text-text-primary lg:text-[30px]">
            {event.name}
          </h1>
          <p className="text-[13.5px] text-secondary">
            {formatEventWindow(event.startDate, event.endDate)} ·{' '}
            {formatParticipantCount(event.participantCount)}
            {event.targetKm !== null && ` · Target ${formatKm(event.targetKm)} km`} · by{' '}
            {event.owner.firstName} {event.owner.lastName}
          </p>
        </div>
        {/* Joining or leaving changes who is on both lists below, and the
            distances are computed server-side, so the honest refresh is a
            reload of that store. */}
        <JoinEventButton
          event={event}
          onChanged={() => reloadParticipants(event.id)}
          className="flex flex-col items-start gap-[2px] sm:items-end sm:text-right"
        />
      </header>

      {event.description && (
        <section className={`${CARD} px-[24px] py-[22px]`}>
          <h2 className="pb-[8px] text-[11px] font-medium tracking-[0.66px] text-tertiary uppercase">
            About
          </h2>
          <p className="text-[14px] leading-[1.65] whitespace-pre-line text-text-primary">
            {event.description}
          </p>
        </section>
      )}

      <EventRosterCards eventId={eventId} event={event} />

      {/* Both outside EventRosterCards on purpose: they read their own store, so
          a participants read that failed must not hide the run feed (RUN-76 AC2),
          and the feed's own failure must not hide the leaderboard.

          The map goes ABOVE the feed because it is the payoff - "where everyone
          ran" rather than "who ran what" - and because it renders nothing at all
          when no tagged run has a route (RUN-77 AC4), so on an event with no
          geometry the feed simply moves up into its place. */}
      <EventRoutesCard eventId={eventId} />
      <EventRunsCard eventId={eventId} />
    </div>
  );
}

// The two API-backed cards plus the loading and error states they share,
// split out so the read of the per-event store sits next to the only
// markup that depends on it.
function EventRosterCards({ eventId, event }: { eventId: string; event: CommunityEvent }) {
  const { status, participants, error } = useEventParticipants(eventId);

  if (status === 'loading') {
    return (
      <p role="status" className="px-[10px] py-[6px] text-[13.5px] text-secondary">
        Loading participants…
      </p>
    );
  }

  if (status === 'error') {
    return (
      <section
        role="alert"
        className={`${CARD} flex flex-col items-start gap-[10px] px-[24px] py-[22px]`}
      >
        <h2 className="font-display text-[16px] font-bold tracking-[-0.3px] text-text-primary">
          Participants didn&apos;t load
        </h2>
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          {error ?? 'Something went wrong loading the participants.'}
        </p>
        <button
          type="button"
          onClick={() => reloadParticipants(eventId)}
          className="mt-[6px] rounded-[12px] bg-accent px-[22px] py-[11px] text-[14px] font-semibold text-white hover:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Try again
        </button>
      </section>
    );
  }

  // Leaderboard first on a phone (it is what the page is for), side by side
  // from `lg` with the wider column for the ranked rows.
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
      <EventLeaderboardCard event={event} participants={participants} />
      <EventParticipantsCard participants={participants} />
    </div>
  );
}

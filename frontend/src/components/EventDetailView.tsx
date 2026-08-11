'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import EventStateChips from '@/components/EventStateChips';
import {
  ensureEvent,
  formatEventWindow,
  formatKm,
  formatParticipantCount,
  useEvents,
} from '@/lib/events';
import { ROUTES } from '@/lib/routes';

const CARD = 'rounded-[18px] border border-line bg-white';

// The event detail's first, deliberately thin cut (RUN-68 AC5 needs the
// card click to land somewhere honest): breadcrumb, header facts and the
// description. The designed detail page - participant list and the event
// leaderboard - is RUN-69, which replaces the placeholder card below.
export default function EventDetailView({ eventId }: { eventId: string }) {
  const events = useEvents();
  const event = events.find((candidate) => candidate.id === eventId);
  // The cache loads once per page load, so an event created after that is
  // absent while being perfectly real (a link someone shared). A cache
  // miss therefore earns one by-id read before the page claims the event
  // does not exist (review fix); 'checking' renders nothing for the beat
  // the read takes, exactly like the boundary's pre-spinner moment.
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

      <header className="flex flex-col gap-[10px]">
        <EventStateChips event={event} />
        <h1 className="font-display text-[24px] font-bold tracking-[-0.6px] text-text-primary lg:text-[30px]">
          {event.name}
        </h1>
        <p className="text-[13.5px] text-secondary">
          {formatEventWindow(event.startDate, event.endDate)} ·{' '}
          {formatParticipantCount(event.participantCount)}
          {event.targetKm !== null && ` · Target ${formatKm(event.targetKm)} km`} · by{' '}
          {event.owner.firstName} {event.owner.lastName}
        </p>
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

      {/* RUN-69 replaces this with the participant list and the event
          leaderboard (total km per participant inside the window). */}
      <section className={`${CARD} px-[24px] py-[22px]`}>
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          Participants and the event leaderboard are on their way.
        </p>
      </section>
    </div>
  );
}

'use client';

import Link from 'next/link';
import EventStateChips from '@/components/EventStateChips';
import JoinEventButton from '@/components/JoinEventButton';
import {
  formatEventWindow,
  formatKm,
  formatParticipantCount,
  type CommunityEvent,
} from '@/lib/events';
import { ROUTES } from '@/lib/routes';

interface EventCardProps {
  event: CommunityEvent;
}

// One event on the Events page (RUN-68): state chip, name, date window,
// owner, participant count, target when set, and the Join/Joined action
// (AC1, shared with the detail header since RUN-69). The whole card is a
// link to the event detail (AC5) via a stretched-link overlay, so the card
// stays one tab stop for its navigation while the button keeps its own;
// the button sits above the overlay (z-index), which is what keeps a Join
// click from also navigating.
export default function EventCard({ event }: EventCardProps) {
  return (
    <article
      data-testid="event-card"
      className="relative flex flex-col gap-[10px] rounded-[18px] border border-line bg-white p-[22px] transition-shadow hover:shadow-[0_10px_30px_0_rgba(0,0,0,0.07)]"
    >
      <EventStateChips event={event} />

      <div className="flex min-w-0 flex-col gap-[3px]">
        <h3 className="truncate font-display text-[17px] font-bold tracking-[-0.34px] text-text-primary">
          {/* The stretched link: its ::after covers the card, so clicking
              anywhere that is not the button opens the detail (AC5). */}
          <Link
            href={`${ROUTES.events}/${event.id}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {event.name}
          </Link>
        </h3>
        <p className="text-[13px] text-secondary">
          {formatEventWindow(event.startDate, event.endDate)}
        </p>
        <p className="truncate text-[12.5px] text-tertiary">
          by {event.owner.firstName} {event.owner.lastName}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-[6px]">
        <p className="text-[13px] text-secondary">
          {formatParticipantCount(event.participantCount)}
          {event.targetKm !== null && (
            <span className="text-tertiary"> · Target {formatKm(event.targetKm)} km</span>
          )}
        </p>

        {/* Renders nothing on the owner's own card; the chip above already
            says why (a deleted event unmounts the card instead - the row
            leaves the cache, which is the whole story). */}
        <JoinEventButton
          event={event}
          className="flex shrink-0 flex-col items-end gap-[2px] text-right"
        />
      </div>
    </article>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  EVENT_STATE_CHIP,
  EVENT_STATE_LABEL,
  formatEventWindow,
  formatKm,
  formatParticipantCount,
  joinEvent,
  leaveEvent,
  type CommunityEvent,
} from '@/lib/events';
import { ROUTES } from '@/lib/routes';

interface EventCardProps {
  event: CommunityEvent;
}

// One event on the Events page (RUN-68): state chip, name, date window,
// owner, participant count, target when set, and the Join/Joined action
// (AC1). The whole card is a link to the event detail (AC5) via a
// stretched-link overlay, so the card stays one tab stop for its
// navigation while the button keeps its own; the button sits above the
// overlay (z-index), which is what keeps a Join click from also
// navigating.
export default function EventCard({ event }: EventCardProps) {
  // The membership round-trips to the API (AC2): `busy` guards the double
  // click, `error` is the inline role="alert" line the app-wide pattern
  // prescribes.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMembership = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (event.joined) {
        await leaveEvent(event.id);
      } else {
        await joinEvent(event.id);
      }
      // The store refresh re-renders this card with the flipped flag and
      // the server's participant count; nothing to set here.
      setBusy(false);
    } catch (cause) {
      setBusy(false);
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Saving failed. Check that you're online and try again.",
      );
    }
  };

  return (
    <article
      data-testid="event-card"
      className="relative flex flex-col gap-[10px] rounded-[18px] border border-line bg-white p-[22px] transition-shadow hover:shadow-[0_10px_30px_0_rgba(0,0,0,0.07)]"
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-[10px] py-[3px] text-[11.5px] font-semibold ${EVENT_STATE_CHIP[event.state]}`}
        >
          {EVENT_STATE_LABEL[event.state]}
        </span>
        {event.mine && (
          <span className="rounded-full bg-accent-soft px-[10px] py-[3px] text-[11.5px] font-semibold text-accent-pressed">
            Your event
          </span>
        )}
      </div>

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

        {/* The owner participates structurally (they cannot leave), so
            their card offers no membership action; the chip above already
            says why. */}
        {!event.mine && (
          <button
            type="button"
            onClick={toggleMembership}
            disabled={busy}
            className={`relative z-10 shrink-0 rounded-full px-[18px] py-[8px] text-[13px] font-semibold disabled:cursor-default disabled:opacity-60 ${
              event.joined
                ? 'border border-line-strong bg-white text-text-primary hover:bg-muted'
                : 'bg-accent text-white hover:bg-accent-pressed'
            }`}
          >
            {busy ? 'Saving…' : event.joined ? 'Joined' : 'Join'}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-[12.5px] leading-[1.5] text-accent-pressed">
          {error}
        </p>
      )}
    </article>
  );
}

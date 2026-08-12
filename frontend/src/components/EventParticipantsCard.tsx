'use client';

import Link from 'next/link';
import { initialsOf, type EventParticipant } from '@/lib/events';
import { personRoute } from '@/lib/routes';

const CARD = 'rounded-[18px] border border-line bg-white';

// Everyone who joined the event (RUN-69 AC1), in join order, owner first
// (they joined at creation). Unlike the leaderboard beside it, this list
// holds every member regardless of their leaderboard setting - joining is
// public within the event, only the ranked distances are opt-in (AC3).
export default function EventParticipantsCard({
  participants,
}: {
  participants: EventParticipant[];
}) {
  return (
    <section className={`${CARD} px-[24px] py-[22px]`} aria-labelledby="event-participants-heading">
      <h2
        id="event-participants-heading"
        className="pb-[14px] text-[11px] font-medium tracking-[0.66px] text-tertiary uppercase"
      >
        Participants
        <span className="pl-2 tracking-normal normal-case">{participants.length}</span>
      </h2>

      <ul className="flex flex-col">
        {participants.map((participant) => (
          <li key={participant.id} className="relative flex items-center gap-3 px-[10px] py-[9px]">
            <span
              aria-hidden="true"
              className="grid size-[34px] shrink-0 place-items-center rounded-full bg-muted text-[12px] font-semibold text-secondary"
            >
              {initialsOf(participant.firstName, participant.lastName)}
            </span>
            {/* AC5: the row opens that runner's public profile. The name is a
                21px line of text, so on its own it is a tap target under half
                the 44px minimum; stretching the link over the whole ~52px row
                fixes that without drawing anything (RUN-75 AC3). This is
                PeopleView's pattern, and it works here because the row holds
                nothing else interactive. */}
            <Link
              href={personRoute(participant.id)}
              className="min-w-0 flex-1 truncate text-[14px] font-medium text-text-primary pointer-coarse:after:absolute pointer-coarse:after:inset-0 pointer-coarse:after:content-[''] hover:text-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {participant.firstName} {participant.lastName}
              {participant.me && (
                <span className="pl-2 text-[12px] font-medium text-accent-pressed">You</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

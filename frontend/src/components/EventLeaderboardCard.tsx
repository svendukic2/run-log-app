'use client';

import Link from 'next/link';
import {
  formatDate,
  formatKm,
  formatRunCount,
  initialsOf,
  leaderboardOf,
  type CommunityEvent,
  type EventParticipant,
} from '@/lib/events';
import { personRoute, ROUTES } from '@/lib/routes';

interface EventLeaderboardCardProps {
  event: CommunityEvent;
  participants: EventParticipant[];
}

const CARD = 'rounded-[18px] border border-line bg-white';

// The event leaderboard (RUN-69 AC2): total km inside the event window per
// participant, ranked, my row highlighted. The numbers are computed
// server-side by one aggregation over the window and are never stored, so
// this component only renders what it is handed.
//
// Two states replace the table rather than showing an empty one:
//
// - Upcoming (AC4): nothing has been run yet BY DEFINITION, so the card
//   says when the running starts instead of listing zeroes.
// - Nobody ranked: every participant is off leaderboards. That is still
//   the DEFAULT for every account (RUN-64 shipped the toggles, not a new
//   default), so this state stays common and points at the Settings
//   control that changes it rather than looking broken.
export default function EventLeaderboardCard({ event, participants }: EventLeaderboardCardProps) {
  const rows = leaderboardOf(participants);

  return (
    <section className={`${CARD} px-[24px] py-[22px]`} aria-labelledby="event-leaderboard-heading">
      <h2
        id="event-leaderboard-heading"
        className="pb-[14px] text-[11px] font-medium tracking-[0.66px] text-tertiary uppercase"
      >
        Leaderboard
      </h2>

      {event.state === 'upcoming' ? (
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          The leaderboard starts on {formatDate(event.startDate)}. Runs logged inside the event
          window count towards it.
        </p>
      ) : rows.length === 0 ? (
        // The link is back (RUN-64): the toggle it points at now exists,
        // so this state can name the control that changes it instead of
        // describing a setting nobody could find yet.
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          Nobody here is on leaderboards yet. Appearing on one is a choice each runner makes in{' '}
          <Link
            href={ROUTES.settings}
            className="font-semibold text-accent hover:text-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Settings
          </Link>
          .
        </p>
      ) : (
        <ol className="flex flex-col">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`flex items-center gap-3 rounded-[12px] px-[10px] py-[10px] ${
                row.me ? 'bg-accent-soft' : ''
              }`}
            >
              <span
                className={`w-[26px] shrink-0 text-[13px] font-semibold tabular-nums ${
                  row.me ? 'text-accent-pressed' : 'text-tertiary'
                }`}
              >
                {row.rank}
              </span>
              <span
                aria-hidden="true"
                className="grid size-[34px] shrink-0 place-items-center rounded-full bg-muted text-[12px] font-semibold text-secondary"
              >
                {initialsOf(row.firstName, row.lastName)}
              </span>
              <span className="min-w-0 flex-1">
                {/* AC5: the row opens that runner's public profile. */}
                <Link
                  href={personRoute(row.id)}
                  className="block truncate text-[14px] font-semibold text-text-primary hover:text-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {row.firstName} {row.lastName}
                  {row.me && (
                    <span className="pl-2 text-[12px] font-medium text-accent-pressed">You</span>
                  )}
                </Link>
                <span className="block text-[12.5px] text-tertiary">
                  {formatRunCount(row.runCount)}
                </span>
              </span>
              <span className="shrink-0 text-[14px] font-semibold tabular-nums text-text-primary">
                {formatKm(row.totalKm)} km
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

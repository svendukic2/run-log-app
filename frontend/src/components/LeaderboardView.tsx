'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  currentWeekStart,
  formatKm,
  formatRunCount,
  formatWeekRange,
  hasNextWeek,
  initialsOf,
  pinnedSelfRow,
  reloadLeaderboard,
  shiftWeek,
  useWeeklyLeaderboard,
  weekEndOf,
  type LeaderboardEntry,
  type WeeklyLeaderboard,
} from '@/lib/leaderboard';
import { personRoute, ROUTES } from '@/lib/routes';
import UnverifiedMarker from './UnverifiedMarker';

const CARD = 'rounded-[18px] border border-line bg-white';

// V2 · Community - Leaderboard (RUN-70): every opted-in runner ranked by
// the kilometres they logged inside one Monday-Sunday week, with the week
// switcher above it and the caller's own row always visible.
//
// The ranking, the totals and the caller's rank are all computed
// server-side by one aggregation over the week and are never stored, so
// this component only renders what it is handed. It owns exactly one piece
// of state: which week is open, which is also the store's cache key.
export default function LeaderboardView() {
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const { status, board, error } = useWeeklyLeaderboard(weekStart);

  return (
    <div className="flex flex-col gap-4 px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]">
      <WeekSwitcher weekStart={weekStart} onChange={setWeekStart} />

      {status === 'loading' && (
        <p role="status" className="px-[10px] py-[6px] text-[13.5px] text-secondary">
          Loading the leaderboard…
        </p>
      )}

      {status === 'error' && (
        <section
          role="alert"
          aria-labelledby="leaderboard-error-heading"
          className={`${CARD} flex flex-col items-start gap-[10px] px-[24px] py-[22px]`}
        >
          <h2
            id="leaderboard-error-heading"
            className="font-display text-[16px] font-bold tracking-[-0.3px] text-text-primary"
          >
            The leaderboard didn&apos;t load
          </h2>
          <p className="text-[13.5px] leading-[1.55] text-secondary">
            {error ?? 'Something went wrong loading the leaderboard.'}
          </p>
          <button
            type="button"
            onClick={() => reloadLeaderboard(weekStart)}
            className="mt-[6px] rounded-[12px] bg-accent px-[22px] py-[11px] text-[14px] font-semibold text-white hover:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try again
          </button>
        </section>
      )}

      {status === 'ready' && board && <LeaderboardCard board={board} />}
    </div>
  );
}

// AC4's switcher. Backwards only: a future week cannot have runs in it yet,
// so "next" stops at the current week rather than offering guaranteed empty
// boards. Below `sm` the label sits under the buttons instead of between
// them, so a long range never squeezes them off the row.
function WeekSwitcher({
  weekStart,
  onChange,
}: {
  weekStart: string;
  onChange: (weekStart: string) => void;
}) {
  const forward = hasNextWeek(weekStart);
  const button =
    'rounded-[12px] border border-line px-[14px] py-[9px] text-[13px] font-semibold text-text-primary hover:border-accent hover:text-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-line disabled:text-tertiary disabled:hover:text-tertiary';

  return (
    <section
      className={`${CARD} flex flex-col gap-[10px] px-[18px] py-[14px] sm:flex-row sm:items-center sm:justify-between`}
      aria-label="Week"
    >
      <div className="flex items-center gap-2 sm:order-2">
        <button type="button" className={button} onClick={() => onChange(shiftWeek(weekStart, -1))}>
          ← Previous week
        </button>
        <button
          type="button"
          className={button}
          disabled={!forward}
          onClick={() => onChange(shiftWeek(weekStart, 1))}
        >
          Next week →
        </button>
      </div>
      <p className="text-[13.5px] font-semibold text-text-primary sm:order-1">
        {formatWeekRange(weekStart, weekEndOf(weekStart))}
        {!forward && <span className="pl-2 font-medium text-tertiary">This week</span>}
      </p>
    </section>
  );
}

// The board itself: the served rows, the caller's pinned row when they rank
// below them (AC2), and the two states that replace the table rather than
// showing an empty one.
function LeaderboardCard({ board }: { board: WeeklyLeaderboard }) {
  const pinned = pinnedSelfRow(board);

  return (
    <section
      className={`${CARD} px-[18px] py-[22px] sm:px-[24px]`}
      aria-labelledby="leaderboard-heading"
    >
      <h2
        id="leaderboard-heading"
        className="pb-[14px] text-[11px] font-medium tracking-[0.66px] text-tertiary uppercase"
      >
        Weekly ranking
      </h2>

      {/* AC3: opted out means absent, so the board says so once, in the
          caller's own terms, and names the control that changes it. The
          rows themselves stay visible - the choice is about appearing, not
          about looking. */}
      {board.me === null && (
        <p className="mb-[14px] rounded-[12px] bg-muted px-[14px] py-[12px] text-[13.5px] leading-[1.55] text-secondary">
          You&apos;re not on the leaderboard. Appearing on one is a choice you make in{' '}
          <Link
            href={ROUTES.settings}
            className="font-semibold text-accent hover:text-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Settings
          </Link>
          .
        </p>
      )}

      {board.items.length === 0 ? (
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          Nobody is on the leaderboard yet. Appearing on one is a choice each runner makes in{' '}
          <Link
            href={ROUTES.settings}
            className="font-semibold text-accent hover:text-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Settings
          </Link>
          .
        </p>
      ) : (
        <>
          <ol className="flex flex-col">
            {board.items.map((row) => (
              <LeaderboardRow key={row.id} row={row} />
            ))}
          </ol>

          {pinned && (
            <div className="mt-[10px] border-t border-line pt-[10px]">
              {/* The caller ranks below the served rows, so their own row
                  is repeated here with its real rank rather than left off
                  the screen they came to see themselves on. */}
              <ol className="flex flex-col">
                <LeaderboardRow row={pinned} />
              </ol>
            </div>
          )}

          {board.total > board.items.length && (
            // "Ranked", not "runners" (review fix): the total counts
            // everyone on the board, including those who logged nothing
            // this week, so the plainer word would claim participation
            // nobody had.
            <p className="pt-[10px] text-[12.5px] text-tertiary">
              Showing the top {board.items.length} of {board.total} ranked runners.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// One ranked runner. AC1's four columns (rank, avatar initials, name with
// the run count, kilometres) and AC5's link in one row; the caller's row
// carries the highlight wherever it is drawn.
function LeaderboardRow({ row }: { row: LeaderboardEntry }) {
  return (
    <li
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
          {row.me && <span className="pl-2 text-[12px] font-medium text-accent-pressed">You</span>}
        </Link>
        <span className="block text-[12.5px] text-tertiary">
          {formatRunCount(row.runCount)}
          {/* RUN-72 AC2: the server flagged one of the runs behind this
              total as legal but extreme. */}
          {row.unverified && <UnverifiedMarker />}
        </span>
      </span>
      <span className="shrink-0 text-[14px] font-semibold tabular-nums text-text-primary">
        {formatKm(row.totalKm)} km
      </span>
    </li>
  );
}

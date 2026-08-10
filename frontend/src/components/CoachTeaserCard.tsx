'use client';

import Link from 'next/link';
import { ACCENT_PILL_CLASSES } from '@/components/accentPill';
import AddRunButton from '@/components/AddRunButton';
import SparkleIcon from '@/components/SparkleIcon';
import { useGoalTarget } from '@/lib/goal';
import { ROUTES } from '@/lib/routes';
import { daysLeftInWeek, formatKm, roundKm, totalsForWeek, useRuns } from '@/lib/runs';
import { useHydrated } from '@/lib/useHydrated';
import { useToday } from '@/lib/useToday';

// The dark "AI Coach" card in the dashboard's right column (RUN-21, DSH-9).
// With zero runs it invites the first log (04); with runs it nudges toward
// the weekly goal with numbers derived from the same store the goal card
// reads (05). "Open coach" is the only way in from here; the full coach page
// is RUN-31/RUN-32.
export default function CoachTeaserCard() {
  const hydrated = useHydrated();
  const runs = useRuns();
  const today = useToday();
  // Resolved per week like the goal card, so both always quote the same
  // target once a Settings default kicks in (RUN-38).
  const target = useGoalTarget(today);

  // localStorage is invisible to the server and the hydration pass, so the
  // card waits for the store rather than flashing the empty copy at a
  // returning user.
  if (!hydrated) return null;

  // Any run ever counts: the warming-up copy is strictly the "never logged
  // anything" state (AC1). A runner with history but an empty current week
  // still gets a real coach message about this week's full remaining goal.
  const hasRuns = runs.length > 0;
  // Deliberately derived from the rounded weekly total the goal card
  // displays, so this card can never say "6.1 km to go" while that one shows
  // "6 km to go". The displayed total is the total.
  const done = roundKm(totalsForWeek(runs, today).distanceKm);
  const remaining = roundKm(Math.max(0, target - done));
  const daysLeft = daysLeftInWeek(today);
  const daysCaption = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;

  // The mock's message is illustrative; the real one derives from the goal
  // gap (AC2). The mock's "then aim for 22 km next week (+10%)" tail is
  // omitted: no plan store exists until RUN-32, so the card cannot honestly
  // reference a next-week target. The goal-met copy is undesigned (flagged on
  // the ticket).
  let message: string;
  if (remaining === 0) {
    message = `You've hit your ${formatKm(target)} km goal with ${daysCaption}. Anything more this week is a bonus.`;
  } else {
    // "A steady {n} km a day" collapses into nonsense at the edges: on the
    // week's last day there is no "a day", and a sub-kilometre remainder
    // would round the daily figure to 0.
    const plan =
      daysLeft === 1
        ? `${formatKm(remaining)} km today gets you there.`
        : remaining < 1
          ? 'One short run finishes it.'
          : `A steady ${formatKm(roundKm(remaining / daysLeft))} km a day keeps you on track.`;
    message = `You're ${formatKm(remaining)} km from your goal with ${daysCaption}. ${plan}`;
  }

  return (
    <section
      aria-labelledby="coach-teaser-title"
      className="rounded-[18px] bg-ink p-[24px] text-white"
    >
      <h2
        id="coach-teaser-title"
        className="flex items-center gap-[10px] font-display text-[16px] font-bold tracking-[-0.2px]"
      >
        <SparkleIcon className="text-accent" />
        AI Coach
      </h2>

      <p className="mt-[12px] text-[13.5px] leading-[1.6] text-white/70">
        {hasRuns
          ? message
          : "Your coach is warming up. Log your first run and I'll start suggesting weekly targets and pacing tips tailored to you."}
      </p>

      <div className="mt-[18px]">
        {hasRuns ? (
          <Link href={ROUTES.coach} className={ACCENT_PILL_CLASSES}>
            Open coach
            <span aria-hidden="true" className="text-[17px]">
              →
            </span>
          </Link>
        ) : (
          <AddRunButton label="Add your first run" fullWidth />
        )}
      </div>
    </section>
  );
}

'use client';

import { useGoalTarget } from '@/lib/goal';
import {
  daysLeftInWeek,
  formatDuration,
  formatKm,
  formatTimeCompact,
  paceSecondsPerKm,
  roundKm,
  totalsForWeek,
  useRuns,
} from '@/lib/runs';
import { useToday } from '@/lib/useToday';

// The "Weekly goal" card (RUN-17, DSH-3/4/5): status tag, "{done} / {target}
// km" readout, progress bar, "km to go" and time-left captions, and the
// Runs / Avg pace / Time stats row. It reads the same stores the Add run
// modal and onboarding write to, so saved runs recompute everything (A18).
export default function WeeklyGoalCard() {
  const runs = useRuns();
  const today = useToday();

  const totals = totalsForWeek(runs, today);
  // This week's target: the onboarding goal until a Settings default takes
  // effect, then that default from its first Monday on (RUN-38, SET-6).
  const target = useGoalTarget(today);
  const done = roundKm(totals.distanceKm);
  const remaining = roundKm(Math.max(0, target - done));
  // A default of 0 km is legal (A17), and 0/0 is NaN: a zero target counts
  // as met rather than poisoning the bar's width.
  const percent = target > 0 ? Math.min(100, (done / target) * 100) : 100;
  const daysLeft = daysLeftInWeek(today);

  // hasRuns gates the stats that need data to exist; the status is a separate
  // decision so a third tag ("Behind", "Done") can slot in later without
  // unpicking the two. Only these two are designed so far (A6).
  const hasRuns = totals.runCount > 0;
  const onTrack = hasRuns;

  const stats = [
    { label: 'Runs', value: `${totals.runCount}` as string | null, align: 'text-left' },
    {
      label: 'Avg pace',
      value: hasRuns ? formatDuration(paceSecondsPerKm(totals)) : null,
      align: 'text-center',
    },
    {
      label: 'Time',
      value: hasRuns ? formatTimeCompact(totals.durationSeconds) : null,
      align: 'text-right',
    },
  ];

  return (
    <section
      data-testid="weekly-goal-card"
      className="rounded-[18px] border border-line bg-white px-[28px] py-[26px]"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-[17px] font-bold tracking-[-0.2px] text-text-primary">
          Weekly goal
        </h2>
        {onTrack ? (
          <span className="flex items-center gap-[7px] rounded-full bg-success-soft px-[12px] py-[4px] text-[13px] font-medium text-success">
            <span aria-hidden="true" className="size-[6px] rounded-full bg-success" />
            On track
          </span>
        ) : (
          <span className="rounded-full bg-muted px-[12px] py-[4px] text-[13px] font-medium text-secondary">
            Not started
          </span>
        )}
      </div>

      <p data-testid="goal-readout" className="mt-[20px] flex items-baseline gap-[9px]">
        <span className="font-display text-[56px] leading-none font-bold tracking-[-2.4px] text-text-primary">
          {formatKm(done)}
        </span>
        <span className="text-[17px] text-secondary">/ {formatKm(target)} km</span>
      </p>

      <div
        role="progressbar"
        aria-label="Weekly goal progress"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(done, target)}
        aria-valuetext={`${formatKm(done)} of ${formatKm(target)} kilometres`}
        className="mt-[16px] h-[8px] overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </div>

      <div className="mt-[14px] flex items-center justify-between gap-4 text-[13px]">
        <span className="text-secondary">{formatKm(remaining)} km to go</span>
        {/* A fact about the calendar, not about runs: "Full week ahead" is
            Monday (DSH-4 depicts a fresh week); after that the caption counts
            down the Mon-Sun week whether or not anything is logged yet. */}
        <span className="text-tertiary">
          {daysLeft === 7
            ? 'Full week ahead'
            : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
        </span>
      </div>

      <dl
        data-testid="goal-stats"
        className="mt-[20px] flex justify-between border-t border-line pt-[20px]"
      >
        {stats.map((stat) => (
          <div key={stat.label} className={`flex flex-col gap-[2px] ${stat.align}`}>
            {/* dt precedes dd in the DOM as the content model requires; the
                order classes put the value above its label visually. */}
            <dt className="order-2 text-[13px] text-secondary">{stat.label}</dt>
            <dd className="order-1 text-[16px] font-bold text-text-primary">
              {stat.value ?? (
                <>
                  <span aria-hidden="true">–</span>
                  <span className="sr-only">No runs yet</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

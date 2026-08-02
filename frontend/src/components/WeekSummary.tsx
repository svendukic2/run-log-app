'use client';

import { formatDuration, todayIso, totalsForWeek, useRuns } from '@/lib/runs';

// Provisional readout of the current week's totals, which is what makes
// "a run dated in a past week does not move this week" visible (RUN-23 AC6).
// The designed weekly goal card (RUN-17) and the Mon-Sun chart (RUN-19)
// replace it and read the same store.
export default function WeekSummary() {
  const totals = totalsForWeek(useRuns(), todayIso());

  const stats = [
    { label: 'Runs', value: `${totals.runCount}` },
    { label: 'Distance', value: `${totals.distanceKm.toFixed(1)} km` },
    { label: 'Time', value: totals.durationSeconds ? formatDuration(totals.durationSeconds) : '-' },
  ];

  return (
    <section
      data-testid="week-summary"
      className="flex flex-col gap-3 rounded-[18px] border border-line bg-white px-5 py-5"
    >
      <h2 className="text-[11px] font-medium tracking-[0.66px] text-tertiary uppercase">
        This week
      </h2>
      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1">
            <dt className="text-[13px] text-secondary">{stat.label}</dt>
            <dd className="font-display text-[22px] font-bold tracking-[-0.4px] text-text-primary">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

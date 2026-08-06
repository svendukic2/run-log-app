'use client';

import { useGoalTarget } from '@/lib/goal';
import { deriveInsights, type Insight } from '@/lib/insights';
import { useRuns } from '@/lib/runs';
import { useToday } from '@/lib/useToday';

// One pictogram per insight, matching the mock's icon discs: bars for load,
// an upward arrow for pace, dots for cadence. Decorative only.
const ICONS: Record<Insight['key'], React.ReactNode> = {
  load: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="2" y="8" width="3" height="6" rx="1" />
      <rect x="6.5" y="4" width="3" height="10" rx="1" />
      <rect x="11" y="6" width="3" height="8" rx="1" />
    </svg>
  ),
  pace: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 3l5 8H3l5-8z" />
    </svg>
  ),
  consistency: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.8" />
      <circle cx="8" cy="8" r="1.8" />
      <circle cx="12.5" cy="8" r="1.8" />
    </svg>
  ),
};

// The three insight cards of 15 · AI Coach (RUN-34, AIC-6): RECENT LOAD,
// PACE TREND and CONSISTENCY, each an icon disc, an overline label, the
// derived value and a one-line caption. All numbers derive from the runs
// store at render time; the mock's copy is illustrative.
export default function InsightCards() {
  const runs = useRuns();
  const today = useToday();
  const goalTargetKm = useGoalTarget(today);

  // CoachView already gates on runs; this covers any other mount point.
  if (runs.length === 0) return null;

  const insights = deriveInsights(runs, goalTargetKm, today);

  // The section and its hidden h2 keep the document outline honest: the
  // three h3s below are a peer group of their own, not subsections of the
  // plan card's heading. role="list" survives list-style: none in Safari.
  return (
    <section aria-labelledby="insights-title">
      <h2 id="insights-title" className="sr-only">
        Insights
      </h2>
      <ul role="list" className="grid list-none grid-cols-1 gap-5 md:grid-cols-3">
        {insights.map((insight) => (
          <li
            key={insight.key}
            className="rounded-[18px] border border-line bg-white px-[24px] py-[22px]"
          >
            <span className="flex size-[38px] items-center justify-center rounded-[11px] bg-accent-soft text-accent">
              {ICONS[insight.key]}
            </span>
            <h3 className="mt-[16px] text-[11px] font-medium tracking-[0.66px] text-secondary uppercase">
              {insight.label}
            </h3>
            <p className="mt-[6px] font-display text-[22px] font-bold tracking-[-0.4px] text-text-primary">
              {insight.value}
            </p>
            <p className="mt-[6px] text-[13px] leading-[1.5] text-secondary">{insight.caption}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

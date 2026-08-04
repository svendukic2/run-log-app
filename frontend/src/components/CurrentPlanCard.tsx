'use client';

import { useEffect, useState } from 'react';
import SparkleIcon from '@/components/SparkleIcon';
import { GOAL_DEFAULT_KM, useGoal } from '@/lib/goal';
import { derivePlan, formatUpdatedAgo, stampPlanGenerated, usePlanGeneratedAt } from '@/lib/plan';
import { useRuns } from '@/lib/runs';
import { useToday } from '@/lib/useToday';

function RegenerateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The dark plan card of 15 · AI Coach (RUN-32, AIC-3/4): header with the
// "updated {time} ago" caption and Regenerate, the "Aim for {n} km this week"
// headline, an explanation paragraph and four stats. The numbers derive from
// the runs store at render time, so they follow the data; the stamp persists
// so the caption survives reloads (A16). Three visible seams stay inert until
// their tickets land: Regenerate (RUN-35), "Apply to weekly goal" (RUN-33)
// and "See the reasoning" (non-functional by design, A21).
export default function CurrentPlanCard() {
  const runs = useRuns();
  const goal = useGoal();
  const generatedAt = usePlanGeneratedAt();
  const today = useToday();
  // Read once per mount: the caption does not need to tick live.
  const [now] = useState(() => Date.now());

  const hasRuns = runs.length > 0;

  // A16: the first visit with a run logged stamps the plan's birth. Writing
  // from an effect keeps the storage side effect out of render; the guard on
  // the stored value keeps StrictMode's double invocation to one stamp.
  useEffect(() => {
    if (hasRuns && generatedAt === null) stampPlanGenerated(Date.now());
  }, [hasRuns, generatedAt]);

  // CoachView already gates on runs; this covers any other mount point.
  if (!hasRuns) return null;

  const plan = derivePlan(runs, goal?.km ?? GOAL_DEFAULT_KM, today);

  const stats: Array<{ label: string; value: string }> = [
    { label: 'Suggested target', value: `${plan.targetKm} km` },
    {
      label: 'Vs last week',
      value: plan.vsLastWeekPercent === null ? 'New' : `+${plan.vsLastWeekPercent}%`,
    },
    { label: 'Sessions', value: `${plan.sessionsMin}-${plan.sessionsMax}` },
    { label: 'Key workout', value: plan.keyWorkout },
  ];

  // The mock's paragraph is illustrative; the opening clause tracks the
  // computed step so the copy never claims a step-up the numbers do not show.
  const opening =
    plan.vsLastWeekPercent === null
      ? 'Your first plan starts from your weekly goal.'
      : plan.vsLastWeekPercent === 0
        ? "You're holding steady: the same distance as last week."
        : `You're building steadily: a +${plan.vsLastWeekPercent}% step up from last week.`;
  const explanation = `${opening} Keep one easy recovery run and add a tempo session mid-week. Avoid stacking two hard days back to back.`;

  return (
    <section
      aria-labelledby="current-plan-title"
      className="rounded-[18px] bg-ink p-[28px] text-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-[10px]">
          <SparkleIcon className="text-accent" />
          <h2 id="current-plan-title" className="text-[14.5px] font-bold">
            This week&apos;s plan
          </h2>
          <p className="text-[12.5px] text-white/50">
            <span aria-hidden="true">· </span>
            updated {formatUpdatedAgo(generatedAt ?? now, now)}
          </p>
        </div>
        {/* Regeneration, with its generating state, is RUN-35; until then the
            control announces itself as not yet available. */}
        <button
          type="button"
          aria-disabled="true"
          aria-describedby="regenerate-seam-note"
          title="Regenerating arrives in an upcoming update"
          className="flex items-center gap-[8px] rounded-[10px] border border-ink-border bg-ink-raised px-[16px] py-[8px] text-[13px] font-medium text-white/80 hover:bg-ink-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <RegenerateIcon />
          Regenerate
        </button>
        <span id="regenerate-seam-note" className="sr-only">
          Not available yet: regenerating arrives in an upcoming update.
        </span>
      </div>

      <p className="mt-[20px] font-display text-[26px] font-bold tracking-[-0.7px] sm:text-[32px]">
        {`Aim for ${plan.targetKm} km this week`}
      </p>
      <p className="mt-[12px] max-w-[820px] text-[14px] leading-[1.65] text-white/60">
        {explanation}
      </p>

      <dl className="mt-[26px] grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-[6px]">
            {/* dt precedes dd in the DOM as the content model requires; the
                order classes put the value above its label visually. */}
            <dt className="order-2 text-[11px] font-medium tracking-[0.66px] text-white/50 uppercase">
              {stat.label}
            </dt>
            <dd className="order-1 font-display text-[19px] font-bold tracking-[-0.3px]">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Plan actions are AIC-5: "Apply to weekly goal" wires up with RUN-33
          and "See the reasoning" stays non-functional by design (A21). Both
          render as the design draws them, announcing their inertness. */}
      <div className="mt-[26px] flex flex-wrap items-center gap-x-[24px] gap-y-3">
        <button
          type="button"
          aria-disabled="true"
          aria-describedby="apply-seam-note"
          title="Applying to your weekly goal arrives in an upcoming update"
          className="flex items-center gap-[9px] rounded-[12px] bg-accent px-[22px] py-[12px] text-[14px] font-semibold text-white hover:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Apply to weekly goal
          <span aria-hidden="true" className="text-[15px]">
            →
          </span>
        </button>
        <span id="apply-seam-note" className="sr-only">
          Not available yet: applying to your weekly goal arrives in an upcoming update.
        </span>
        <button
          type="button"
          aria-disabled="true"
          aria-describedby="reasoning-seam-note"
          title="The reasoning view is not available yet"
          className="text-[13.5px] font-medium text-white/80 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          See the reasoning
        </button>
        <span id="reasoning-seam-note" className="sr-only">
          Not available yet.
        </span>
      </div>
    </section>
  );
}

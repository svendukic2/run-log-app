'use client';

import { useEffect, useState } from 'react';
import SparkleIcon from '@/components/SparkleIcon';
import { applyGoalTarget, useGoalTarget } from '@/lib/goal';
import { derivePlan, formatUpdatedAgo, stampPlanGenerated, usePlanGeneratedAt } from '@/lib/plan';
import { useRuns } from '@/lib/runs';
import { useToday } from '@/lib/useToday';

const REGENERATE_CLASSES =
  'flex items-center gap-[8px] rounded-[10px] border border-ink-border bg-ink-raised px-[16px] py-[8px] text-[13px] font-medium text-white/80 hover:bg-ink-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

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
// so the caption survives reloads (A16). "Apply to weekly goal" makes the
// suggestion this week's goal (RUN-33, A15); "See the reasoning" stays
// non-functional by design (A21).
//
// Regeneration (RUN-35) is orchestrated by the page: the card swap and the
// dimming of the neighbouring cards belong to CoachView, so the button only
// reports the click upward. Without an orchestrator there is nothing to
// regenerate into, and the control announces itself as not yet available.
export default function CurrentPlanCard({ onRegenerate }: { onRegenerate?: () => void }) {
  const runs = useRuns();
  const generatedAt = usePlanGeneratedAt();
  const today = useToday();
  // Resolved per week (RUN-38): the plan builds on the same target the
  // dashboard's goal card shows for this week.
  const goalTargetKm = useGoalTarget(today);
  // Read once per mount: the caption does not need to tick live.
  const [now] = useState(() => Date.now());
  // The km the runner last applied, feeding the status line: A15 designs no
  // confirmation step, but a click with zero acknowledgement reads as broken.
  const [appliedKm, setAppliedKm] = useState<number | null>(null);

  const hasRuns = runs.length > 0;

  // A16: the first visit with a run logged stamps the plan's birth. Writing
  // from an effect keeps the storage side effect out of render; the guard on
  // the stored value keeps StrictMode's double invocation to one stamp.
  useEffect(() => {
    if (hasRuns && generatedAt === null) stampPlanGenerated(Date.now());
  }, [hasRuns, generatedAt]);

  // CoachView already gates on runs; this covers any other mount point.
  if (!hasRuns) return null;

  const plan = derivePlan(runs, goalTargetKm, today);

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
        {onRegenerate ? (
          // data-regenerate is the focus-return anchor for CoachView's
          // regeneration slot (RUN-35).
          <button
            type="button"
            data-regenerate
            onClick={onRegenerate}
            className={REGENERATE_CLASSES}
          >
            <RegenerateIcon />
            Regenerate
          </button>
        ) : (
          <>
            <button
              type="button"
              aria-disabled="true"
              aria-describedby="regenerate-seam-note"
              title="Regenerating arrives in an upcoming update"
              className={REGENERATE_CLASSES}
            >
              <RegenerateIcon />
              Regenerate
            </button>
            <span id="regenerate-seam-note" className="sr-only">
              Not available yet: regenerating arrives in an upcoming update.
            </span>
          </>
        )}
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

      {/* Plan actions are AIC-5: "Apply to weekly goal" adopts the suggestion
          as this week's goal without a confirmation step and the page stays
          put (A15); "See the reasoning" stays non-functional by design (A21). */}
      <div className="mt-[26px] flex flex-wrap items-center gap-x-[24px] gap-y-3">
        <button
          type="button"
          onClick={() => {
            // No `today` argument: the click decides which week it lands in.
            if (applyGoalTarget(plan.targetKm)) setAppliedKm(plan.targetKm);
          }}
          className="flex items-center gap-[9px] rounded-[12px] bg-accent px-[22px] py-[12px] text-[14px] font-semibold text-white hover:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Apply to weekly goal
          <span aria-hidden="true" className="text-[15px]">
            →
          </span>
        </button>
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
        {/* Always mounted so screen readers announce the text appearing. The
            goal-target guard keeps the line honest: anything that moves this
            week's target from elsewhere (another tab, a later apply) makes
            the confirmation vanish instead of describing a stale value. */}
        <p role="status" className="text-[13px] text-white/60">
          {appliedKm !== null &&
            appliedKm === goalTargetKm &&
            `Weekly goal set to ${appliedKm} km.`}
        </p>
      </div>
    </section>
  );
}

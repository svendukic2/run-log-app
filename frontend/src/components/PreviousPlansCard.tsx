'use client';

import { useGoalTarget } from '@/lib/goal';
import { derivePastPlans } from '@/lib/insights';
import { useRuns } from '@/lib/runs';
import { useToday } from '@/lib/useToday';

// The "Previous plans" card of 15 · AI Coach (RUN-34, AIC-7): one row per
// past week with a derivable plan, showing the week range, "Target {n} km ·
// ran {n} km" and a Hit or Missed chip. Outcomes recompute from the runs
// store on render, the same way the live plan card derives its numbers.
// "View all" has no designed destination and stays inert (A21).
export default function PreviousPlansCard() {
  const runs = useRuns();
  const today = useToday();
  const goalTargetKm = useGoalTarget(today);

  // CoachView already gates on runs; this covers any other mount point.
  if (runs.length === 0) return null;

  const plans = derivePastPlans(runs, goalTargetKm, today);

  return (
    <section
      aria-labelledby="previous-plans-title"
      className="rounded-[18px] border border-line bg-white px-[28px] py-[24px]"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="previous-plans-title"
          className="font-display text-[17px] font-bold tracking-[-0.2px] text-text-primary"
        >
          Previous plans
        </h2>
        <button
          type="button"
          aria-disabled="true"
          aria-describedby="view-all-seam-note"
          title="The full plan history is not available yet"
          className="text-[13.5px] font-semibold text-accent hover:text-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          View all
        </button>
        <span id="view-all-seam-note" className="sr-only">
          Not available yet.
        </span>
      </div>

      {plans.length === 0 ? (
        // A runner in their first plannable week has no history yet; saying
        // so beats rendering an empty frame with no explanation.
        <p className="mt-[16px] border-t border-line pt-[16px] text-[13px] text-secondary">
          Plans you finish will show up here, starting next week.
        </p>
      ) : (
        // role="list" survives list-style: none in Safari/VoiceOver.
        <ul role="list" className="mt-[8px] list-none">
          {plans.map((plan) => (
            <li
              key={plan.weekStart}
              className="flex items-center justify-between gap-4 border-t border-line py-[16px] first:mt-[8px] last:pb-[2px]"
            >
              <div>
                <p className="text-[14px] font-semibold text-text-primary">{plan.label}</p>
                <p className="mt-[2px] text-[13px] text-secondary">
                  Target {plan.targetKm} km · ran {plan.ranKm} km
                </p>
              </div>
              {plan.hit ? (
                <span className="rounded-full bg-success-soft px-[12px] py-[4px] text-[12.5px] font-medium text-success-text">
                  Hit
                </span>
              ) : (
                <span className="rounded-full bg-warning-soft px-[12px] py-[4px] text-[12.5px] font-medium text-warning-text">
                  Missed
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

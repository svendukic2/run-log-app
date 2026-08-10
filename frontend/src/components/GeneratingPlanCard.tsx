import SparkleIcon from '@/components/SparkleIcon';

// The generating state of the plan card (16 · AI Coach - Generating, RUN-35,
// AIC-8): header swapped to "Generating new plan · just now", the designed
// heading and copy, and three skeleton bars where the stats will land. No
// cancel control exists by design, and the Regenerate button is gone with
// the rest of the plan card, so a second trigger is impossible. The busy
// flag and the status announcement live on CoachView's stable plan slot,
// not here: this card mounts and unmounts, and a live region that appears
// with its text already in place is one nobody hears.
export default function GeneratingPlanCard() {
  return (
    <section
      aria-labelledby="generating-plan-title"
      className="rounded-[18px] bg-ink p-[28px] text-white"
    >
      <div className="flex items-center gap-[10px]">
        <SparkleIcon className="text-accent" />
        <h2 id="generating-plan-title" className="text-[14.5px] font-bold">
          Generating new plan
        </h2>
        <p className="text-[12.5px] text-white/50">
          <span aria-hidden="true">· </span>
          just now
        </p>
      </div>

      <p className="mt-[20px] font-display text-[26px] font-bold tracking-[-0.7px] sm:text-[32px]">
        Reading your training...
      </p>
      <p className="mt-[12px] max-w-[820px] text-[14px] leading-[1.65] text-white/60">
        Analyzing your last 4 weeks of distance, pace and effort to shape next week&apos;s plan.
      </p>

      {/* Placeholder bars where the stats row sits on the finished card;
          the pulse respects prefers-reduced-motion. */}
      <div aria-hidden="true" className="mt-[26px] flex motion-safe:animate-pulse flex-col gap-[12px]">
        <div className="h-[12px] w-[62%] max-w-[520px] rounded-full bg-ink-elevated" />
        <div className="h-[12px] w-[50%] max-w-[420px] rounded-full bg-ink-elevated" />
        <div className="h-[12px] w-[38%] max-w-[320px] rounded-full bg-ink-elevated" />
      </div>
    </section>
  );
}

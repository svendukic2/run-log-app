'use client';

import RunModal from '@/components/RunModal';
import SparkleIcon from '@/components/SparkleIcon';
import { useAddRunModal } from '@/lib/useAddRunModal';

const BULLETS = ['Weekly targets', 'Pacing tips', 'Safe progression'];

// The dark hero of 14 · AI Coach - Empty state (RUN-31, AIC-2): sparkle on a
// raised disc, the promise of what coaching will do once a run exists, the
// primary "Add your first run" action and three benefit bullets. This card
// owns its own modal via the shared lifecycle hook rather than reusing
// AddRunButton, because the hero pill is content-width and centered, not the
// header's full-width-on-mobile variant.
export default function CoachEmptyState() {
  const { isOpen, open, close, triggerRef } = useAddRunModal<HTMLButtonElement>();

  return (
    <section
      aria-labelledby="coach-empty-title"
      className="flex flex-col items-center rounded-[18px] bg-ink px-6 py-[72px] text-center text-white sm:py-[120px] lg:py-[180px]"
    >
      <span
        aria-hidden="true"
        className="flex size-[54px] items-center justify-center rounded-full bg-ink-elevated text-accent"
      >
        <SparkleIcon className="size-[20px]" />
      </span>

      <h2
        id="coach-empty-title"
        className="mt-[22px] font-display text-[22px] font-bold tracking-[-0.5px] sm:text-[26px]"
      >
        Coaching starts after your first run
      </h2>
      <p className="mt-[10px] max-w-[430px] text-[14px] leading-[1.6] text-white/60">
        Log a run and I&apos;ll analyze your distance, pace and effort to suggest safe weekly
        targets and simple pacing tips.
      </p>

      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        className="mt-[26px] flex items-center justify-center gap-[9px] rounded-[12px] bg-accent px-[24px] py-[13px] text-[14.5px] font-semibold text-white hover:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Add your first run
        <span aria-hidden="true" className="text-[16px]">
          →
        </span>
      </button>

      <ul className="mt-[34px] flex flex-col items-center gap-[12px] sm:flex-row sm:gap-[28px]">
        {BULLETS.map((bullet) => (
          <li key={bullet} className="flex items-center gap-[8px] text-[12.5px] text-white/70">
            <span aria-hidden="true" className="size-[6px] rounded-full bg-accent" />
            {bullet}
          </li>
        ))}
      </ul>

      {/* Mounted only while open, so each opening starts from a clean form.
          No `run` prop: this always adds. */}
      {isOpen ? <RunModal onClose={close} /> : null}
    </section>
  );
}

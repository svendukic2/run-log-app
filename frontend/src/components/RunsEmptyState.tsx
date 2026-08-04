import AddRunButton from '@/components/AddRunButton';

function PlusIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path
        d="M13 3.5V22.5M3.5 13H22.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// The designed empty state of 07 · Runs (RUN-25, design node 71:123): plus
// icon on its soft disc, heading, copy and the "Add your first run" CTA, all
// centered in the same card shell the table uses, so the swap between the two
// (AC4) does not move the page around. The CTA is the shared AddRunButton
// pill, which owns the Add run modal (AC2).
export default function RunsEmptyState() {
  return (
    <div className="flex flex-col items-center rounded-[18px] border border-line bg-white px-5 py-16 text-center sm:px-8 sm:py-[120px]">
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent"
      >
        <PlusIcon />
      </span>

      <h2 className="mt-6 font-display text-[18px] font-bold tracking-[-0.36px] text-text-primary">
        No runs logged yet
      </h2>

      <p className="mt-[10px] max-w-[360px] text-[13.5px] leading-[1.65] text-secondary">
        Add your first run and it will show up here with distance, pace and effort. Your records
        fill in automatically.
      </p>

      {/* AddRunButton is already full width below `sm` (responsive addendum);
          the wrapper just stops it stretching above that. */}
      <div className="mt-7 flex w-full justify-center sm:w-auto">
        <AddRunButton label="Add your first run" />
      </div>
    </div>
  );
}

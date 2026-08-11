import CreateEventButton from '@/components/CreateEventButton';

function FlagIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path
        d="M6 23V4M6 4H20L16.5 8.5L20 13H6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The Events page's designed empty state (RUN-68 AC4), the RunsEmptyState
// construction: icon on its soft disc, heading, copy and the create CTA,
// centered in the same card shell the grouped grid uses, so the swap
// between the two does not move the page around.
export default function EventsEmptyState() {
  return (
    <div className="flex flex-col items-center rounded-[18px] border border-line bg-white px-5 py-16 text-center sm:px-8 sm:py-[120px]">
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent"
      >
        <FlagIcon />
      </span>

      <h2 className="mt-6 font-display text-[18px] font-bold tracking-[-0.36px] text-text-primary">
        No events yet
      </h2>

      <p className="mt-[10px] max-w-[360px] text-[13.5px] leading-[1.65] text-secondary">
        Create the first community event: pick a window, set an optional distance target and other
        runners can join in.
      </p>

      <div className="mt-7 flex w-full justify-center sm:w-auto">
        <CreateEventButton label="Create your first event" />
      </div>
    </div>
  );
}

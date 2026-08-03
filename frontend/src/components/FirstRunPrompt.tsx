import AddRunButton from '@/components/AddRunButton';

// The empty dashboard's main card (RUN-18, DSH-6): before any run exists it
// tells the user what to do first instead of showing blank cards. The button
// opens the same Add run modal the header action does.
export default function FirstRunPrompt() {
  return (
    <section
      aria-labelledby="first-run-title"
      className="flex flex-col items-center gap-[18px] rounded-[18px] border border-line bg-white px-6 py-[64px] text-center sm:py-[110px]"
    >
      <span
        aria-hidden="true"
        data-testid="first-run-icon"
        className="flex size-[70px] items-center justify-center rounded-full bg-accent-soft text-[30px] font-light text-accent"
      >
        +
      </span>
      <h2
        id="first-run-title"
        className="font-display text-[24px] font-bold tracking-[-0.5px] text-text-primary"
      >
        Log your first run
      </h2>
      <p className="max-w-[360px] text-[14.5px] leading-[1.6] text-secondary">
        Add a run to start tracking your weekly distance, pace and personal records. Your charts
        and history will appear here.
      </p>
      <AddRunButton label="Add your first run" />
    </section>
  );
}

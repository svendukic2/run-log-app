// Run Log logo mark + wordmark, shown top left on every onboarding screen.
export default function Brand() {
  return (
    <div className="flex items-center gap-[11px]">
      <div className="flex size-[38px] items-center justify-center rounded-[11px] bg-accent">
        <span className="font-display text-[20px] font-bold text-white">R</span>
      </div>
      <span className="font-display text-[19px] font-medium tracking-[-0.19px] text-ink-deep">
        Run Log
      </span>
    </div>
  );
}

// Setup progress indicator: the active step renders as an elongated accent
// pill, the other as a small dot, followed by a "Step x of 2" caption.
export default function StepDots({ step, label }: { step: 1 | 2; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          step === 1
            ? 'h-[7px] w-[26px] rounded-full bg-accent'
            : 'size-[7px] rounded-full bg-accent'
        }
      />
      <span
        className={
          step === 2
            ? 'h-[7px] w-[26px] rounded-full bg-accent'
            : 'size-[7px] rounded-full bg-line-strong'
        }
      />
      <span className="text-[13px] text-tertiary">{label}</span>
    </div>
  );
}

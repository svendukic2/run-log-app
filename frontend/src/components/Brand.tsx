interface BrandProps {
  // The app shell's mobile top bar sits on the dark ink surface, the
  // onboarding screens on the light canvas.
  onDark?: boolean;
}

// Run Log logo mark + wordmark, shown top left on every onboarding screen and
// in the app shell's mobile top bar.
export default function Brand({ onDark = false }: BrandProps) {
  return (
    <div className="flex items-center gap-[11px]">
      <div className="flex size-[38px] items-center justify-center rounded-[11px] bg-accent">
        <span className="font-display text-[20px] font-bold text-white">R</span>
      </div>
      <span
        className={`font-display text-[19px] font-medium tracking-[-0.19px] ${
          onDark ? 'text-white' : 'text-ink-deep'
        }`}
      >
        Run Log
      </span>
    </div>
  );
}

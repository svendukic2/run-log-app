// The presentational pieces both run detail screens are built from: the
// owner's editable one (RunDetailView) and the read-only one reached from a
// public profile (PublicRunDetailView, RUN-63).
//
// They live here rather than in RunDetailView because that module imports
// RunModal and DeleteRunDialog at the top level: importing a card from it
// would pull the entire write UI into the read-only view's module graph,
// which is precisely the thing that view claims not to contain. Keeping the
// shared markup dependency-free makes that claim structural instead of a
// convention someone has to remember.

export const CARD = 'rounded-[18px] border border-line bg-white';

export function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={`${CARD} flex flex-col gap-[8px] px-[24px] py-[22px]`}>
      <span className="text-[11px] font-medium tracking-[0.66px] text-tertiary uppercase">
        {label}
      </span>
      <span className="font-display text-[22px] font-bold tracking-[-0.4px] text-text-primary">
        {value}
      </span>
    </div>
  );
}

// A decorative route sketch with a start and an end dot, explicitly not a map
// (DET-4). Still the right thing to draw for a run with NO route, which is
// most of them: since RUN-55 a run that does have one gets a real map instead
// (RouteCard chooses), and this stands in wherever there are no coordinates to
// draw from.
export function RouteSketch() {
  return (
    <svg
      viewBox="0 0 680 260"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      data-testid="route-sketch"
      className="h-auto w-full text-accent"
      fill="none"
    >
      <path
        d="M44 186 C 84 224, 142 148, 212 158 C 282 168, 330 214, 402 178 C 474 142, 546 92, 636 112"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle data-testid="route-start" cx="44" cy="186" r="5.5" fill="currentColor" />
      <circle
        data-testid="route-end"
        cx="636"
        cy="112"
        r="6"
        stroke="currentColor"
        strokeWidth="3.5"
        fill="white"
      />
    </svg>
  );
}

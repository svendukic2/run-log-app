import { EFFORT_LEVELS, type Effort } from '@/lib/runs';

// Each level keeps the same dot colour it has in the runs table, so "Medium"
// reads the same wherever it appears.
export const EFFORT_DOT: Record<Effort, string> = {
  Easy: 'bg-success',
  Medium: 'bg-warning',
  Hard: 'bg-accent',
};

interface EffortFieldProps {
  value: Effort;
  onChange: (effort: Effort) => void;
}

// Segmented "Effort level" control (design node 68:33). Built on real radio
// inputs rather than buttons: arrow-key selection, the grouped announcement
// and the checked state all come for free, and the segment is only the label
// that dresses them up.
export default function EffortField({ value, onChange }: EffortFieldProps) {
  return (
    <fieldset className="flex flex-col">
      <legend className="mb-2 text-[13px] font-medium text-secondary">Effort level</legend>
      <div className="flex gap-[4px] rounded-[12px] bg-muted p-[4px]">
        {EFFORT_LEVELS.map((effort) => (
          <label
            key={effort}
            // The designed idle colour (#7A8194) is a dark-surface token and
            // falls under 4.5:1 on this grey; `secondary` is the light-surface
            // equivalent and keeps the segment readable.
            className="flex flex-1 cursor-pointer items-center justify-center gap-[8px] rounded-[9px] py-[9px] text-[14.5px] font-medium text-secondary select-none has-[:checked]:bg-white has-[:checked]:text-[14px] has-[:checked]:font-semibold has-[:checked]:text-text-primary has-[:checked]:shadow-[0_1px_3px_0_rgba(0,0,0,0.12)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
          >
            <input
              type="radio"
              name="effort"
              value={effort}
              checked={value === effort}
              onChange={() => onChange(effort)}
              className="sr-only"
            />
            <span aria-hidden="true" className={`size-[8px] rounded-full ${EFFORT_DOT[effort]}`} />
            {effort}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

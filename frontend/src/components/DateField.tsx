'use client';

import { formatGoalDate } from '@/lib/goal';
import { useHydrated } from '@/lib/useHydrated';

// Input / Field with a calendar icon. The visible box shows a formatted date
// (or the empty-state text) while an invisible native date input stretched
// over it provides the picker, keyboard access and the accessible name.
interface DateFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (iso: string) => void;
  emptyText?: string;
  error?: string;
}

export default function DateField({
  id,
  label,
  value,
  onChange,
  emptyText = '',
  error,
}: DateFieldProps) {
  // "Today" only exists on the client; render the empty state until hydrated.
  const hydrated = useHydrated();
  const shownValue = hydrated ? value : '';

  return (
    <div className="flex flex-1 flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-medium text-secondary">
        {label}
      </label>
      <div className="relative">
        <div className="flex w-full items-center gap-[11px] rounded-[12px] border border-line-strong bg-white px-[15px] py-[13px]">
          <span aria-hidden className="relative block size-[18px] shrink-0">
            <span className="absolute top-[3px] left-0 h-[15px] w-[18px] rounded-[3px] border-[1.5px] border-tertiary" />
            <span className="absolute top-[3px] left-0 h-[5px] w-[18px] rounded-t-[3px] bg-tertiary" />
          </span>
          <span
            className={`text-[15px] leading-[1.55] ${shownValue ? 'text-ink' : 'text-tertiary'}`}
          >
            {shownValue ? formatGoalDate(shownValue) : emptyText}
          </span>
        </div>
        <input
          id={id}
          name={id}
          type="date"
          value={shownValue}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-accent-pressed">
          {error}
        </p>
      ) : null}
    </div>
  );
}

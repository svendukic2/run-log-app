import type { ComponentType } from 'react';
import { deriveRecords, type RecordKind } from '@/lib/records';
import type { Run } from '@/lib/runs';

/* The card icons of 08 · Runs - Records, on the same soft accent disc the
   design gives every one of them. The design reuses shapes across cards
   (chart for Longest run and Biggest week, stopwatch for both Fastest), so
   the map below does too. */

function ChartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="9.5" width="3.2" height="7.5" rx="1.3" fill="currentColor" />
      <rect x="8.4" y="3" width="3.2" height="14" rx="1.3" fill="currentColor" />
      <rect x="13.8" y="6.5" width="3.2" height="10.5" rx="1.3" fill="currentColor" />
    </svg>
  );
}

function StopwatchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="11.5" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="M10 8.8V11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.8 2.5H12.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 2.2L11.9 8.1L17.8 10L11.9 11.9L10 17.8L8.1 11.9L2.2 10L8.1 8.1L10 2.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TriangleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 4.2L16.8 15.8H3.2L10 4.2Z" fill="currentColor" />
    </svg>
  );
}

const RECORD_ICONS: Record<RecordKind, ComponentType> = {
  'longest-run': ChartIcon,
  'fastest-5k': StopwatchIcon,
  'fastest-10k': StopwatchIcon,
  'best-pace': SparkIcon,
  'biggest-week': ChartIcon,
  'longest-streak': TriangleIcon,
};

interface RecordCardsProps {
  runs: Run[];
}

// The record cards of 08 · Runs - Records (RUN-26): icon, label, value and
// source caption each (AC1), derived fresh from the runs on every render so
// changed runs recompute them (AC2) and unqualified record types simply have
// no card (AC3, A24). Three columns in the wide mock, two on smaller
// desktops and a single column on phones (responsive addendum, agreed
// in-project).
export default function RecordCards({ runs }: RecordCardsProps) {
  const records = deriveRecords(runs);

  // Only zero runs leaves zero cards (any run at all qualifies for Longest
  // run); the tabs still render then, so the panel explains itself instead
  // of going blank.
  if (records.length === 0) {
    return (
      <p className="text-[14.5px] text-secondary">
        Records fill in automatically once you log your first run.
      </p>
    );
  }

  return (
    <dl data-testid="record-cards" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {records.map(({ kind, label, value, caption }) => {
        const Icon = RECORD_ICONS[kind];
        return (
          <div key={kind} className="rounded-[18px] border border-line bg-white px-[26px] py-6">
            {/* The icon lives inside the dt: a dl's groups may hold nothing
                but dt and dd, and the icon belongs to the term anyway. */}
            <dt className="text-[13.5px] font-medium text-secondary">
              <span
                aria-hidden="true"
                className="mb-[18px] flex size-[42px] items-center justify-center rounded-[13px] bg-accent-soft text-accent"
              >
                <Icon />
              </span>
              {label}
            </dt>
            <dd className="mt-[6px] font-display text-[28px] leading-none font-bold tracking-[-0.84px] text-text-primary">
              {value}
            </dd>
            <dd className="mt-[10px] text-[13px] text-tertiary">{caption}</dd>
          </div>
        );
      })}
    </dl>
  );
}

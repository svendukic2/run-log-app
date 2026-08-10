'use client';

import { useMemo } from 'react';
import { deriveRecords, type RecordKind, type RunRecord } from '@/lib/records';
import { useRuns } from '@/lib/runs';
import { useHydrated } from '@/lib/useHydrated';

// The four records the dashboard surfaces, in row order; Biggest week and
// Longest streak stay on the Records tab. The order is owned here, not
// inherited from deriveRecords' internal ordering.
const DASHBOARD_RECORD_KINDS: readonly RecordKind[] = [
  'longest-run',
  'fastest-5k',
  'fastest-10k',
  'best-pace',
];

// The "Personal records" card in the dashboard's right column (RUN-22,
// DSH-10). Values come from the same deriveRecords the Records tab uses, so
// the two surfaces cannot disagree, and both recompute from the runs store on
// change. The dashboard rows deliberately omit the source caption the tab's
// cards carry; four labelled values are all this summary shows.
export default function PersonalRecordsCard() {
  const hydrated = useHydrated();
  const runs = useRuns();

  const records = useMemo(() => {
    const byKind = new Map(deriveRecords(runs).map((record) => [record.kind, record]));
    return DASHBOARD_RECORD_KINDS.map((kind) => byKind.get(kind)).filter(
      (record): record is RunRecord => record !== undefined,
    );
  }, [runs]);

  // localStorage is invisible to the server and the hydration pass; wait for
  // the store rather than flashing "No records yet" at a returning user.
  if (!hydrated) return null;

  return (
    <section
      aria-labelledby="personal-records-title"
      className="rounded-[18px] border border-line bg-white px-[24px] py-[20px]"
    >
      <h2
        id="personal-records-title"
        className="font-display text-[17px] font-bold tracking-[-0.2px] text-text-primary"
      >
        Personal records
      </h2>

      {/* The copy is a claim about run history, so it branches on the runs
          themselves (AC1). With any run at all, Longest run and Best pace
          always derive, so the list below can never be empty. */}
      {runs.length === 0 ? (
        <div className="px-2 pt-[18px] pb-[10px] text-center">
          <p className="text-[14px] font-semibold text-text-primary">No records yet</p>
          <p className="mt-[5px] text-[13px] leading-[1.5] text-tertiary">
            Finish a run to set your first personal record.
          </p>
        </div>
      ) : (
        <dl className="mt-[4px]">
          {records.map(({ kind, label, value }) => (
            <div
              key={kind}
              className="flex items-center justify-between gap-4 border-b border-line py-[14px] last:border-b-0 last:pb-[4px]"
            >
              <dt className="text-[14px] text-secondary">{label}</dt>
              <dd className="text-[15px] font-bold text-text-primary">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

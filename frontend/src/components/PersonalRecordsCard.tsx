'use client';

import { useMemo } from 'react';
import { deriveRecords, type RecordKind, type RunRecord } from '@/lib/records';
import { useRuns, type Run } from '@/lib/runs';
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

interface PersonalRecordsCardProps {
  // Whose runs to derive from. Omitted on the dashboard, where the card
  // reads the signed-in user's own store; given on someone else's public
  // profile (RUN-63), whose runs arrive with the profile and are never in
  // any store this browser owns.
  runs?: Run[];
  // The card's heading. The dashboard says "Personal records" about you;
  // a profile says "Records" about them. The empty-state copy is
  // deliberately NOT parameterised: a public profile with no runs never
  // renders this card at all (PublicProfileView answers that with one
  // "No runs yet" card instead of three empty ones), so the only reader of
  // the empty branch is the dashboard, talking to its own user.
  title?: string;
}

// The "Personal records" card in the dashboard's right column (RUN-22,
// DSH-10). Values come from the same deriveRecords the Records tab uses, so
// the two surfaces cannot disagree, and both recompute from the runs they
// are given on change.  The dashboard rows deliberately omit the source
// caption the tab's cards carry; four labelled values are all this summary
// shows.
export default function PersonalRecordsCard({ runs, ...copy }: PersonalRecordsCardProps) {
  // Two components rather than one with an optional read: hooks cannot be
  // called conditionally, and useRuns() outside an AppDataBoundary throws
  // in development by design. A profile page has no such boundary (its data
  // is not the signed-in user's), so it must not reach the store at all.
  return runs ? <Records runs={runs} {...copy} /> : <OwnRecords {...copy} />;
}

function OwnRecords(copy: Omit<PersonalRecordsCardProps, 'runs'>) {
  const hydrated = useHydrated();
  const runs = useRuns();

  // The store is invisible to the server and the hydration pass; wait for
  // it rather than flashing "No records yet" at a returning user.
  if (!hydrated) return null;
  return <Records runs={runs} {...copy} />;
}

function Records({ runs, title = 'Personal records' }: PersonalRecordsCardProps & { runs: Run[] }) {
  const records = useMemo(() => {
    const byKind = new Map(deriveRecords(runs).map((record) => [record.kind, record]));
    return DASHBOARD_RECORD_KINDS.map((kind) => byKind.get(kind)).filter(
      (record): record is RunRecord => record !== undefined,
    );
  }, [runs]);

  return (
    <section
      aria-labelledby="personal-records-title"
      className="rounded-[18px] border border-line bg-white px-[24px] py-[20px]"
    >
      <h2
        id="personal-records-title"
        className="font-display text-[17px] font-bold tracking-[-0.2px] text-text-primary"
      >
        {title}
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

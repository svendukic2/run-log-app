'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import RunsEmptyState from '@/components/RunsEmptyState';
import RunsTable from '@/components/RunsTable';
import { sortRuns, useRuns, type RunSortOrder } from '@/lib/runs';

const TABS = [
  { key: 'all', label: 'All runs' },
  { key: 'records', label: 'Records' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function ChevronIcon() {
  return (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Tab row, controls and panels of 07 · Runs (RUN-24). "All runs" carries the
// total count and shows the sortable table; "Records" swaps it for the record
// cards, which arrive with RUN-26 and are a placeholder until then (AC2).
export default function RunsView() {
  const runs = useRuns();
  const [tab, setTab] = useState<TabKey>('all');
  const [order, setOrder] = useState<RunSortOrder>('newest');
  const baseId = useId();

  // With nothing logged yet the tabs stay (the badge reads 0) but the table
  // gives way to the designed empty state and the Filter and sort controls
  // disappear with it - there is nothing for them to act on (RUN-25 AC1, AC3).
  const isEmpty = runs.length === 0;

  const tabId = (key: TabKey) => `${baseId}-tab-${key}`;
  const panelId = (key: TabKey) => `${baseId}-panel-${key}`;

  // Saving the first run unmounts the empty state together with the CTA that
  // opened the modal, so the modal's return-focus target is gone and focus
  // would silently fall to <body>. Only in that case (activeElement check)
  // the "All runs" tab picks it up: it survives the swap and sits right above
  // the table that just appeared. Saves from the header button keep their
  // usual return-focus behavior.
  const wasEmpty = useRef(isEmpty);
  useEffect(() => {
    if (wasEmpty.current && !isEmpty && document.activeElement === document.body) {
      document.getElementById(tabId('all'))?.focus();
    }
    wasEmpty.current = isEmpty;
  });

  // Arrow keys move between the two tabs, as the tablist pattern asks; with
  // only two of them, either arrow simply means "the other one".
  const onTablistKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: TabKey = tab === 'all' ? 'records' : 'all';
    setTab(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <section className="flex flex-col gap-4">
      {/* Below `sm` the controls wrap onto their own line instead of squeezing
          the tabs (responsive addendum, agreed in-project). */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div
          role="tablist"
          aria-label="Runs views"
          onKeyDown={onTablistKeyDown}
          className="flex items-center gap-6"
        >
          {TABS.map(({ key, label }) => {
            const isActive = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={tabId(key)}
                aria-selected={isActive}
                aria-controls={panelId(key)}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 border-b-2 pt-1 pb-[10px] text-[14.5px] ${
                  isActive
                    ? 'border-ink font-semibold text-text-primary'
                    : 'border-transparent font-medium text-secondary hover:text-text-primary'
                }`}
              >
                {label}
                {key === 'all' ? (
                  // The badge always shows the total, whatever tab or sort is
                  // active (AC2).
                  <span className="rounded-full bg-accent-soft px-[9px] py-[3px] text-[12px] font-semibold text-accent-pressed">
                    {runs.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {isEmpty ? null : (
          <div className="ml-auto flex items-center gap-[10px]">
            {/* Visible but deliberately inert: Filter has no designed panel yet
                (AC7, assumption A19). */}
            <button
              type="button"
              className="rounded-[12px] border border-line-strong bg-white px-[18px] py-[9px] text-[14px] font-medium text-text-primary hover:bg-muted"
            >
              Filter
            </button>

            <label className="relative">
              <span className="sr-only">Sort runs</span>
              <select
                value={order}
                onChange={(event) => setOrder(event.target.value as RunSortOrder)}
                className="appearance-none rounded-[12px] border border-line-strong bg-white py-[9px] pr-[34px] pl-[16px] text-[14px] font-medium text-text-primary hover:bg-muted"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
              <span className="pointer-events-none absolute top-1/2 right-[14px] -translate-y-1/2 text-secondary">
                <ChevronIcon />
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Both panels stay mounted and toggle with `hidden`: the tabs'
          aria-controls always resolve, and the table keeps its scroll position
          across a round trip to Records. */}
      <div
        role="tabpanel"
        id={panelId('all')}
        aria-labelledby={tabId('all')}
        hidden={tab !== 'all'}
      >
        {/* The first saved run announces itself through the store, so the
            table takes over from the empty state on its own (RUN-25 AC4). */}
        {isEmpty ? <RunsEmptyState /> : <RunsTable runs={sortRuns(runs, order)} />}
      </div>
      <div
        role="tabpanel"
        id={panelId('records')}
        aria-labelledby={tabId('records')}
        // Nothing inside is focusable yet, so the panel itself takes the tab
        // stop, as the tabpanel pattern asks.
        tabIndex={0}
        hidden={tab !== 'records'}
      >
        {/* The record cards and their recomputation are RUN-26. */}
        <p className="text-[14.5px] text-secondary">Personal records are coming soon.</p>
      </div>
    </section>
  );
}

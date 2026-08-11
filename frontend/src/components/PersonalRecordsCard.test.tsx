import { act, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { addRun, deleteRun, getRuns, updateRun, type Run } from '@/lib/runs';
import { seedRuns } from '@/test/runsApiMock';
import RecordCards from './RecordCards';
import PersonalRecordsCard from './PersonalRecordsCard';

function runDraft(overrides: Partial<Omit<Run, 'id'>> = {}): Omit<Run, 'id'> {
  return {
    routeName: 'Morning loop',
    // 12 km in exactly an hour: pace 5:00 /km, so 5K 25:00 and 10K 50:00.
    distanceKm: 12,
    durationSeconds: 3600,
    date: '2026-07-14',
    effort: 'Medium',
    note: '',
    ...overrides,
  };
}

// Before render only: seeds the backend and primes the store cache.
function seedRun(overrides: Partial<Omit<Run, 'id'>> = {}): Run {
  return seedRuns([runDraft(overrides)])[0];
}

describe('Personal records card (RUN-22)', () => {
  it('shows the designed empty copy before any run exists (AC1)', () => {
    render(<PersonalRecordsCard />);

    const card = screen.getByRole('region', { name: 'Personal records' });
    expect(within(card).getByText('No records yet')).toBeInTheDocument();
    expect(
      within(card).getByText('Finish a run to set your first personal record.'),
    ).toBeInTheDocument();
  });

  it('shows the four dashboard records, in order, derived from runs (AC2)', () => {
    seedRun();

    render(<PersonalRecordsCard />);

    const card = screen.getByRole('region', { name: 'Personal records' });
    // Row order is owned by this card, not by deriveRecords' internals.
    expect(within(card).getAllByRole('term').map((dt) => dt.textContent)).toEqual([
      'Longest run',
      'Fastest 5K',
      'Fastest 10K',
      'Best pace',
    ]);
    expect(within(card).getByText('12.0 km')).toBeInTheDocument();
    expect(within(card).getByText('25:00')).toBeInTheDocument();
    expect(within(card).getByText('50:00')).toBeInTheDocument();
    expect(within(card).getByText('5:00 /km')).toBeInTheDocument();
    // The Records-tab-only kinds stay off the dashboard.
    expect(within(card).queryByText('Biggest week')).toBeNull();
    expect(within(card).queryByText('Longest streak')).toBeNull();
  });

  it('recomputes when a run is added (AC3)', async () => {
    seedRun();
    render(<PersonalRecordsCard />);
    expect(screen.getByText('12.0 km')).toBeInTheDocument();

    await act(async () => {
      // A longer but slower run: takes Longest run, leaves Best pace alone.
      await addRun(
        runDraft({
          routeName: 'Long trail',
          distanceKm: 18,
          durationSeconds: 6480,
          date: '2026-07-15',
        }),
      );
    });

    expect(screen.getByText('18.0 km')).toBeInTheDocument();
    expect(screen.queryByText('12.0 km')).toBeNull();
    expect(screen.getByText('5:00 /km')).toBeInTheDocument();
  });

  it('recomputes when a run is edited (AC3)', async () => {
    const run = seedRun();
    render(<PersonalRecordsCard />);
    expect(screen.getByText('12.0 km')).toBeInTheDocument();

    await act(async () => {
      const { id, ...draft } = run;
      await updateRun(id, { ...draft, distanceKm: 9 });
    });

    expect(screen.getByText('9.0 km')).toBeInTheDocument();
    expect(screen.queryByText('12.0 km')).toBeNull();
    // 9 km no longer qualifies for the 10K record.
    expect(screen.queryByText('Fastest 10K')).toBeNull();
  });

  it('returns to the empty copy when the last run is deleted (AC3)', async () => {
    const run = seedRun();
    render(<PersonalRecordsCard />);
    expect(screen.getByText('Longest run')).toBeInTheDocument();

    await act(async () => {
      await deleteRun(run.id);
    });

    expect(screen.queryByText('Longest run')).toBeNull();
    expect(screen.getByText('No records yet')).toBeInTheDocument();
  });

  it('hides rows whose record has no qualifying run (A24)', () => {
    // 3 km can never set a 5K or 10K record.
    seedRun({ distanceKm: 3, durationSeconds: 900 });

    render(<PersonalRecordsCard />);

    const card = screen.getByRole('region', { name: 'Personal records' });
    expect(within(card).getByText('Longest run')).toBeInTheDocument();
    expect(within(card).getByText('Best pace')).toBeInTheDocument();
    expect(within(card).queryByText('Fastest 5K')).toBeNull();
    expect(within(card).queryByText('Fastest 10K')).toBeNull();
    expect(within(card).queryByText('No records yet')).toBeNull();
  });

  it('shows the same values as the Records tab for the shared kinds (AC4)', () => {
    seedRun({ distanceKm: 11.3, durationSeconds: 3421 });

    render(
      <>
        <PersonalRecordsCard />
        <RecordCards runs={getRuns()} />
      </>,
    );

    const card = screen.getByRole('region', { name: 'Personal records' });
    const tab = screen.getByTestId('record-cards');
    for (const label of ['Longest run', 'Fastest 5K', 'Fastest 10K', 'Best pace']) {
      const cardValue = within(card).getByText(label).parentElement?.querySelector('dd');
      expect(cardValue?.textContent).toBeTruthy();
      // Both surfaces derive through lib/records, so the values match. (getAll:
      // one run makes Longest run and Biggest week share a value on the tab.)
      expect(within(tab).getAllByText(cardValue!.textContent!).length).toBeGreaterThan(0);
    }
  });

  it('renders an empty server shell before hydration', () => {
    seedRun();

    expect(renderToString(<PersonalRecordsCard />)).toBe('');
  });
});

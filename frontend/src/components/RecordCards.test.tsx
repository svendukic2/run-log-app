import { render, screen, within } from '@testing-library/react';
import RecordCards from './RecordCards';
import type { Run } from '@/lib/runs';

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    routeName: 'Morning loop',
    distanceKm: 8.2,
    durationSeconds: 2535,
    date: '2026-07-14',
    effort: 'Medium',
    note: '',
    ...overrides,
  };
}

const RUNS: Run[] = [
  makeRun({
    id: 'long',
    routeName: 'Long run',
    distanceKm: 14.2,
    durationSeconds: 4724,
    date: '2026-06-24',
    effort: 'Hard',
  }),
  makeRun({
    id: 'tempo',
    routeName: 'Tempo run',
    distanceKm: 8,
    durationSeconds: 2328,
    date: '2026-07-01',
  }),
];

describe('RecordCards (RUN-26)', () => {
  it('shows a card per record with label, value and source caption (AC1)', () => {
    render(<RecordCards runs={RUNS} />);

    const cards = screen.getByTestId('record-cards');
    for (const label of [
      'Longest run',
      'Fastest 5K',
      'Fastest 10K',
      'Best pace',
      'Biggest week',
      'Longest streak',
    ]) {
      expect(within(cards).getByText(label)).toBeInTheDocument();
    }

    // The 14.2 km run holds Longest run and its week holds Biggest week.
    expect(within(cards).getAllByText('14.2 km')).toHaveLength(2);
    expect(within(cards).getByText('4:51 /km')).toBeInTheDocument();
    expect(within(cards).getAllByText('Long run · Jun 24').length).toBeGreaterThan(0);
  });

  it('hides the card of a record type with no qualifying run (AC3)', () => {
    render(<RecordCards runs={[makeRun({ distanceKm: 8.2 })]} />);

    expect(screen.queryByText('Fastest 10K')).not.toBeInTheDocument();
    expect(screen.getByText('Fastest 5K')).toBeInTheDocument();
  });

  it('explains itself instead of rendering an empty grid with zero runs', () => {
    render(<RecordCards runs={[]} />);

    expect(screen.queryByTestId('record-cards')).not.toBeInTheDocument();
    expect(
      screen.getByText('Records fill in automatically once you log your first run.'),
    ).toBeInTheDocument();
  });
});

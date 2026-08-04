import { act, render, screen, within } from '@testing-library/react';
import { addRun, type Effort } from '@/lib/runs';
import RecentRunsCard from './RecentRunsCard';

function runOn(date: string, routeName: string, effort: Effort = 'Medium') {
  return {
    routeName,
    distanceKm: 8.2,
    durationSeconds: 2535,
    date,
    effort,
    note: '',
  };
}

describe('RecentRunsCard (RUN-20)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('lists the 3 most recent runs with dot, name, caption, distance and pace (AC1)', () => {
    addRun(runOn('2026-07-01', 'Oldest loop'));
    addRun(runOn('2026-07-03', 'Hill repeats'));
    addRun(runOn('2026-07-05', 'River trail'));
    addRun(runOn('2026-07-07', 'Morning loop'));

    render(<RecentRunsCard />);

    const card = screen.getByRole('region', { name: 'Recent runs' });
    const rows = within(card).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // Newest first, the fourth-newest is not shown.
    expect(rows[0]).toHaveTextContent('Morning loop');
    expect(rows[1]).toHaveTextContent('River trail');
    expect(rows[2]).toHaveTextContent('Hill repeats');
    expect(within(card).queryByText('Oldest loop')).toBeNull();

    // The designed row anatomy: "Jul 7 · 42 min", "8.2 km", "5:12 /km"-style
    // pace (2535 s over 8.2 km is 5:09 /km) and an effort dot.
    expect(within(rows[0]).getByText('Jul 7 · 42 min')).toBeInTheDocument();
    expect(within(rows[0]).getByText('8.2 km')).toBeInTheDocument();
    expect(within(rows[0]).getByText('5:09 /km')).toBeInTheDocument();
    expect(within(rows[0]).getByTestId('effort-dot')).toBeInTheDocument();
  });

  it('links "View all" to the runs list (AC2)', () => {
    addRun(runOn('2026-07-07', 'Morning loop'));

    render(<RecentRunsCard />);

    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/runs');
  });

  it('puts a newly saved run on top and drops the oldest of the three (AC3)', () => {
    addRun(runOn('2026-07-03', 'Hill repeats'));
    addRun(runOn('2026-07-05', 'River trail'));
    addRun(runOn('2026-07-07', 'Morning loop'));

    render(<RecentRunsCard />);

    act(() => {
      addRun(runOn('2026-07-09', 'Evening tempo'));
    });

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Evening tempo');
    expect(screen.queryByText('Hill repeats')).toBeNull();
  });

  it('puts a run saved on the same date as an existing one on top (AC3)', () => {
    addRun(runOn('2026-07-05', 'River trail'));
    addRun(runOn('2026-07-07', 'Morning loop'));

    render(<RecentRunsCard />);

    // The store prepends new runs and its date sort is stable, so within one
    // date the most recently saved run stays first.
    act(() => {
      addRun(runOn('2026-07-07', 'Evening tempo'));
    });

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Evening tempo');
    expect(rows[1]).toHaveTextContent('Morning loop');
  });

  it('colors the effort dot per effort level (AC4)', () => {
    addRun(runOn('2026-07-03', 'Hard intervals', 'Hard'));
    addRun(runOn('2026-07-05', 'Steady miles', 'Medium'));
    addRun(runOn('2026-07-07', 'Recovery jog', 'Easy'));

    render(<RecentRunsCard />);

    const dots = screen.getAllByTestId('effort-dot');
    // Rows are newest first: Easy (green), Medium (amber), Hard (coral).
    expect(dots[0]).toHaveClass('bg-success');
    expect(dots[1]).toHaveClass('bg-warning');
    expect(dots[2]).toHaveClass('bg-accent');

    // The colour is not the only carrier: each row also names its effort for
    // assistive tech.
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Easy effort');
    expect(rows[1]).toHaveTextContent('Medium effort');
    expect(rows[2]).toHaveTextContent('Hard effort');
  });
});

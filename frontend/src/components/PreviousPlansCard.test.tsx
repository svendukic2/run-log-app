import { render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { addRun, type Run } from '@/lib/runs';
import PreviousPlansCard from './PreviousPlansCard';

function seedRun(overrides: Partial<Omit<Run, 'id'>> = {}): Run {
  return addRun({
    routeName: 'Morning loop',
    distanceKm: 10,
    durationSeconds: 3000,
    date: '2026-07-28',
    effort: 'Medium',
    note: '',
    ...overrides,
  });
}

describe('Previous plans card (RUN-34)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Wed 5 Aug 2026: past plannable weeks end with Jul 27-Aug 2.
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5, 9, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a row with the week range, target, ran and a Hit chip (AC2, AC3)', () => {
    seedRun({ date: '2026-07-21', distanceKm: 10 });
    seedRun({ date: '2026-07-28', distanceKm: 12, routeName: 'River trail' });

    render(<PreviousPlansCard />);

    expect(screen.getByRole('region', { name: 'Previous plans' })).toBeInTheDocument();
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Jul 27 – Aug 2')).toBeInTheDocument();
    expect(within(row).getByText('Target 11 km · ran 12 km')).toBeInTheDocument();
    expect(within(row).getByText('Hit')).toBeInTheDocument();
  });

  it('marks a week that fell short with a Missed chip (AC3)', () => {
    seedRun({ date: '2026-07-21', distanceKm: 10 });
    seedRun({ date: '2026-07-28', distanceKm: 5, routeName: 'River trail' });

    render(<PreviousPlansCard />);

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Target 11 km · ran 5 km')).toBeInTheDocument();
    expect(within(row).getByText('Missed')).toBeInTheDocument();
  });

  it('lists the newest week first', () => {
    seedRun({ date: '2026-07-15', distanceKm: 8 });
    seedRun({ date: '2026-07-21', distanceKm: 10, routeName: 'River trail' });
    seedRun({ date: '2026-07-28', distanceKm: 12, routeName: 'Hill repeats' });

    render(<PreviousPlansCard />);

    const ranges = screen.getAllByRole('listitem').map((row) => row.querySelector('p')?.textContent);
    expect(ranges).toEqual(['Jul 27 – Aug 2', 'Jul 20 – 26']);
  });

  it('keeps "View all" visible but inert (AC4, A21)', () => {
    seedRun({ date: '2026-07-21' });
    seedRun({ date: '2026-07-28', routeName: 'River trail' });

    render(<PreviousPlansCard />);

    const viewAll = screen.getByRole('button', { name: 'View all' });
    expect(viewAll).toHaveAttribute('aria-disabled', 'true');
    expect(viewAll).toHaveAccessibleDescription('Not available yet.');
  });

  it('explains the empty history to a first-week runner', () => {
    seedRun({ date: '2026-08-04' });

    render(<PreviousPlansCard />);

    expect(screen.queryByRole('listitem')).toBeNull();
    expect(
      screen.getByText('Plans you finish will show up here, starting next week.'),
    ).toBeInTheDocument();
  });

  it('renders an empty server shell before hydration', () => {
    seedRun();

    expect(renderToString(<PreviousPlansCard />)).toBe('');
  });
});

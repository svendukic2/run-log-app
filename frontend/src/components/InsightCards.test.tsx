import { act, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { addRun, type Run } from '@/lib/runs';
import { seedRuns } from '@/test/runsApiMock';
import InsightCards from './InsightCards';

function runDraft(overrides: Partial<Omit<Run, 'id'>> = {}): Omit<Run, 'id'> {
  return {
    routeName: 'Morning loop',
    distanceKm: 10,
    durationSeconds: 3000,
    date: '2026-07-28',
    effort: 'Medium',
    note: '',
    ...overrides,
  };
}

// Before render only: seeds the backend and primes the store cache.
function seedRun(overrides: Partial<Omit<Run, 'id'>> = {}): Run {
  return seedRuns([runDraft(overrides)])[0];
}

// After render: goes through the real async store so mounted components see it.
async function logRun(overrides: Partial<Omit<Run, 'id'>> = {}): Promise<void> {
  await act(async () => {
    await addRun(runDraft(overrides));
  });
}

describe('Insight cards (RUN-34)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Wed 5 Aug 2026: the rolling window spans Jul 9 through Aug 5.
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5, 9, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the three cards with values derived from run history (AC1)', () => {
    seedRun({ date: '2026-07-28' });
    seedRun({ date: '2026-07-30', routeName: 'River trail' });

    render(<InsightCards />);

    // The group announces itself so the h3s are not read as subsections of
    // the plan card.
    expect(screen.getByRole('region', { name: 'Insights' })).toBeInTheDocument();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(3);

    const load = within(cards[0]);
    expect(load.getByRole('heading', { name: 'Recent load' })).toBeInTheDocument();
    expect(load.getByText('20 km')).toBeInTheDocument();
    // Jul 28 and Jul 30 land in two different seven-day buckets, so the
    // spike check runs and calls them steady.
    expect(load.getByText('Steady over the last 4 weeks, no spikes')).toBeInTheDocument();

    const pace = within(cards[1]);
    expect(pace.getByRole('heading', { name: 'Pace trend' })).toBeInTheDocument();
    expect(pace.getByText('5:00 /km')).toBeInTheDocument();
    expect(pace.getByText('Your first month of pace data')).toBeInTheDocument();

    const consistency = within(cards[2]);
    expect(consistency.getByRole('heading', { name: 'Consistency' })).toBeInTheDocument();
    expect(consistency.getByText('0.5 / week')).toBeInTheDocument();
    expect(consistency.getByText('Below your planned cadence')).toBeInTheDocument();
  });

  it('follows the runs store: a new run moves the numbers', async () => {
    seedRun({ date: '2026-07-28' });
    render(<InsightCards />);
    expect(screen.getByText('10 km')).toBeInTheDocument();

    await logRun({ date: '2026-07-21', distanceKm: 5.2, routeName: 'River trail' });

    expect(screen.getByText('15.2 km')).toBeInTheDocument();
  });

  it('renders an empty server shell before hydration', () => {
    seedRun();

    expect(renderToString(<InsightCards />)).toBe('');
  });
});

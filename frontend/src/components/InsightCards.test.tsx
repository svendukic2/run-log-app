import { act, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { addRun, type Run } from '@/lib/runs';
import InsightCards from './InsightCards';

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

describe('Insight cards (RUN-34)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Wed 5 Aug 2026: the window spans Jul 13 through Aug 9.
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
    expect(load.getByText('Over the last 4 full weeks')).toBeInTheDocument();

    const pace = within(cards[1]);
    expect(pace.getByRole('heading', { name: 'Pace trend' })).toBeInTheDocument();
    expect(pace.getByText('5:00 /km')).toBeInTheDocument();
    expect(pace.getByText('Your first month of pace data')).toBeInTheDocument();

    const consistency = within(cards[2]);
    expect(consistency.getByRole('heading', { name: 'Consistency' })).toBeInTheDocument();
    expect(consistency.getByText('0.5 / week')).toBeInTheDocument();
    expect(consistency.getByText('Below your planned cadence')).toBeInTheDocument();
  });

  it('follows the runs store: a new run moves the numbers', () => {
    seedRun({ date: '2026-07-28' });
    render(<InsightCards />);
    expect(screen.getByText('10 km')).toBeInTheDocument();

    act(() => {
      seedRun({ date: '2026-07-21', distanceKm: 5.2, routeName: 'River trail' });
    });

    expect(screen.getByText('15.2 km')).toBeInTheDocument();
  });

  it('renders an empty server shell before hydration', () => {
    seedRun();

    expect(renderToString(<InsightCards />)).toBe('');
  });
});

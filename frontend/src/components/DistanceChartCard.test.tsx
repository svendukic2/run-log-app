import { render, screen, within } from '@testing-library/react';
import {
  addRun,
  formatDateShort,
  fromIsoDate,
  startOfWeek,
  toIsoDate,
  todayIso,
  type Run,
} from '@/lib/runs';
import DistanceChartCard from './DistanceChartCard';

function isoDaysAgo(days: number): string {
  const date = fromIsoDate(todayIso());
  date.setDate(date.getDate() - days);
  return toIsoDate(date);
}

function seedRun(overrides: Partial<Omit<Run, 'id'>> = {}): Run {
  return addRun({
    routeName: 'Morning loop',
    distanceKm: 8,
    durationSeconds: 2400,
    date: todayIso(),
    effort: 'Medium',
    note: '',
    ...overrides,
  });
}

function currentWeekLabel(): string {
  return formatDateShort(startOfWeek(todayIso()));
}

describe('Distance chart card (RUN-19)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the Distance heading, the caption and 8 bars with week labels (AC1)', () => {
    seedRun();

    render(<DistanceChartCard />);

    const card = screen.getByRole('region', { name: 'Distance' });
    expect(within(card).getByText('Last 8 weeks')).toBeInTheDocument();
    expect(within(card).getAllByTestId('distance-bar')).toHaveLength(8);
    expect(within(card).getAllByRole('listitem')).toHaveLength(8);
    // Oldest week first, current week last, labelled like "Jul 14".
    expect(within(card).getByText(currentWeekLabel())).toBeInTheDocument();
  });

  it('highlights the current week even when its distance is 0 (AC2)', () => {
    // The only run is three weeks old, so the current week's bar is empty.
    seedRun({ date: isoDaysAgo(21), distanceKm: 12 });

    render(<DistanceChartCard />);

    const bars = screen.getAllByTestId('distance-bar');
    const currentBar = bars[bars.length - 1];
    expect(currentBar).toHaveAttribute('data-current', 'true');
    // The visual highlight: accent fill plus the baseline that survives a
    // zero-distance week.
    expect(currentBar).toHaveClass('bg-accent', 'min-h-[4px]');
    for (const bar of bars.slice(0, -1)) {
      expect(bar).not.toHaveAttribute('data-current');
      expect(bar).toHaveClass('bg-accent-soft');
    }
    // The highlight is announced, not colour-only.
    expect(
      screen.getByText(`Week of ${currentWeekLabel()}, current week: 0.0 km`),
    ).toBeInTheDocument();
    expect(screen.getByText(currentWeekLabel())).toHaveClass('text-accent');
  });

  it('attributes a past-week run to that week, not the current one (AC3)', () => {
    // 10 km exactly one week back lands in the previous Mon-Sun week.
    seedRun({ date: isoDaysAgo(7), distanceKm: 10 });

    render(<DistanceChartCard />);

    const bars = screen.getAllByTestId('distance-bar');
    // The previous week owns the tallest bar; the current week's bar is zero,
    // kept visible only by its min-height baseline.
    expect(bars[6].style.height).toBe('100%');
    expect(bars[7].style.height).toBe('0%');
    expect(screen.getByText(/Week of .*: 10\.0 km/)).toBeInTheDocument();
  });

  it('scales bars relative to the busiest week', () => {
    seedRun({ date: isoDaysAgo(7), distanceKm: 10 });
    seedRun({ date: todayIso(), distanceKm: 5 });

    render(<DistanceChartCard />);

    const bars = screen.getAllByTestId('distance-bar');
    expect(bars[6].style.height).toBe('100%');
    expect(bars[7].style.height).toBe('50%');
  });

  it('ignores runs older than the 8-week window', () => {
    // 70 days back is the 10th week; it must not set the scale or a bar.
    seedRun({ date: isoDaysAgo(70), distanceKm: 42 });
    seedRun({ date: todayIso(), distanceKm: 5 });

    render(<DistanceChartCard />);

    const bars = screen.getAllByTestId('distance-bar');
    // The 5 km current week is the window's max, so it draws full height.
    expect(bars[7].style.height).toBe('100%');
    expect(screen.queryByText(/42\.0 km/)).toBeNull();
  });

  it('draws no bars at all when every window week is empty', () => {
    // The only run predates the window entirely.
    seedRun({ date: isoDaysAgo(70), distanceKm: 42 });

    render(<DistanceChartCard />);

    for (const bar of screen.getAllByTestId('distance-bar')) {
      expect(bar.style.height).toBe('0%');
    }
    // The current week's baseline still marks it (AC2).
    expect(screen.getAllByTestId('distance-bar')[7]).toHaveClass('min-h-[4px]');
  });

  it('announces every week to screen readers, sized from rounded values', () => {
    seedRun({ distanceKm: 8.24 });

    render(<DistanceChartCard />);

    // Seven empty weeks plus this week's rounded total.
    expect(screen.getAllByText(/Week of .*: 0\.0 km/)).toHaveLength(7);
    expect(screen.getByText(/Week of .*current week: 8\.2 km/)).toBeInTheDocument();
  });

  it('is display-only: no buttons or links anywhere in the card (AC4)', () => {
    seedRun();

    render(<DistanceChartCard />);

    const card = screen.getByRole('region', { name: 'Distance' });
    expect(within(card).queryByRole('button')).toBeNull();
    expect(within(card).queryByRole('link')).toBeNull();
  });
});

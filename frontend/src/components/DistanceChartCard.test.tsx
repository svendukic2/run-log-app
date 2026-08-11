import { render, screen, within } from '@testing-library/react';
import { formatDateShort, fromIsoDate, toIsoDate, todayIso, type Run } from '@/lib/runs';
import { seedRuns } from '@/test/runsApiMock';
import DistanceChartCard from './DistanceChartCard';

function isoDaysAgo(days: number): string {
  const date = fromIsoDate(todayIso());
  date.setDate(date.getDate() - days);
  return toIsoDate(date);
}

// Before render only: seeds the backend and primes the store cache.
function seedRun(overrides: Partial<Omit<Run, 'id'>> = {}): Run {
  return seedRuns([
    {
      routeName: 'Morning loop',
      distanceKm: 8,
      durationSeconds: 2400,
      date: todayIso(),
      effort: 'Medium',
      note: '',
      ...overrides,
    },
  ])[0];
}

describe('Distance chart card (RUN-19, daily redesign)', () => {
  it('shows the Distance heading, the caption and 14 daily bars', () => {
    seedRun();

    render(<DistanceChartCard />);

    const card = screen.getByRole('region', { name: 'Distance' });
    expect(within(card).getByText('Last 14 days')).toBeInTheDocument();
    expect(within(card).getAllByTestId('distance-bar')).toHaveLength(14);
    expect(within(card).getAllByRole('listitem')).toHaveLength(14);
  });

  it('shows no date labels under the bars; dates live in hover tooltips', () => {
    seedRun();

    render(<DistanceChartCard />);

    const tooltips = screen.getAllByTestId('distance-tooltip');
    expect(tooltips).toHaveLength(14);
    // Hidden until its bar is hovered (group-hover reveals it).
    for (const tooltip of tooltips) {
      expect(tooltip).toHaveClass('hidden', 'group-hover:block');
      expect(tooltip).toHaveAttribute('role', 'tooltip');
    }
    // The tooltip carries the date and the distance, "Jul 14 · 8.0 km" style.
    expect(tooltips[13]).toHaveTextContent(`${formatDateShort(todayIso())} · 8.0 km`);
    // No always-visible label duplicates the tooltip: no element renders the
    // bare date on its own, the way the old under-bar labels did.
    const card = screen.getByRole('region', { name: 'Distance' });
    expect(within(card).queryAllByText(formatDateShort(todayIso()))).toHaveLength(0);
  });

  it('highlights today even when its distance is 0', () => {
    // The only run is a week old, so today's bar is empty.
    seedRun({ date: isoDaysAgo(7), distanceKm: 12 });

    render(<DistanceChartCard />);

    const bars = screen.getAllByTestId('distance-bar');
    const todayBar = bars[bars.length - 1];
    expect(todayBar).toHaveAttribute('data-current', 'true');
    // The visual highlight: accent fill plus the baseline that survives a
    // zero-distance day.
    expect(todayBar).toHaveClass('bg-accent', 'min-h-[4px]');
    for (const bar of bars.slice(0, -1)) {
      expect(bar).not.toHaveAttribute('data-current');
      expect(bar).toHaveClass('bg-accent-soft');
    }
    // The highlight is announced, not colour-only.
    expect(screen.getByText(`${formatDateShort(todayIso())}, today: 0.0 km`)).toBeInTheDocument();
  });

  it('attributes a past-day run to that day, not today', () => {
    // 10 km exactly a week back lands on the bar seven slots from the end.
    seedRun({ date: isoDaysAgo(7), distanceKm: 10 });

    render(<DistanceChartCard />);

    const bars = screen.getAllByTestId('distance-bar');
    expect(bars[6].style.height).toBe('100%');
    expect(bars[13].style.height).toBe('0%');
  });

  it('scales bars relative to the longest day', () => {
    seedRun({ date: isoDaysAgo(7), distanceKm: 10 });
    seedRun({ date: todayIso(), distanceKm: 5 });

    render(<DistanceChartCard />);

    const bars = screen.getAllByTestId('distance-bar');
    expect(bars[6].style.height).toBe('100%');
    expect(bars[13].style.height).toBe('50%');
  });

  it('sums multiple runs on the same day into one bar', () => {
    seedRun({ date: todayIso(), distanceKm: 4 });
    seedRun({ date: todayIso(), distanceKm: 4 });
    seedRun({ date: isoDaysAgo(2), distanceKm: 4 });

    render(<DistanceChartCard />);

    const bars = screen.getAllByTestId('distance-bar');
    expect(bars[13].style.height).toBe('100%');
    expect(bars[11].style.height).toBe('50%');
    expect(screen.getByText(/today: 8\.0 km/)).toBeInTheDocument();
  });

  it('ignores runs older than the 14-day window', () => {
    // 20 days back is outside the window; it must not set the scale or a bar.
    seedRun({ date: isoDaysAgo(20), distanceKm: 42 });
    seedRun({ date: todayIso(), distanceKm: 5 });

    render(<DistanceChartCard />);

    const bars = screen.getAllByTestId('distance-bar');
    // The 5 km today is the window's max, so it draws full height.
    expect(bars[13].style.height).toBe('100%');
    expect(screen.queryByText(/42\.0 km/)).toBeNull();
  });

  it('draws no bars at all when every window day is empty', () => {
    // The only run predates the window entirely.
    seedRun({ date: isoDaysAgo(20), distanceKm: 42 });

    render(<DistanceChartCard />);

    for (const bar of screen.getAllByTestId('distance-bar')) {
      expect(bar.style.height).toBe('0%');
    }
    // Today's baseline still marks it.
    expect(screen.getAllByTestId('distance-bar')[13]).toHaveClass('min-h-[4px]');
  });

  it('announces every day to screen readers, sized from rounded values', () => {
    seedRun({ distanceKm: 8.24 });

    render(<DistanceChartCard />);

    // Thirteen empty days plus today's rounded total.
    expect(screen.getAllByText(/: 0\.0 km/)).toHaveLength(13);
    expect(screen.getByText(/today: 8\.2 km/)).toBeInTheDocument();
  });

  it('stays non-interactive: no buttons or links anywhere in the card', () => {
    seedRun();

    render(<DistanceChartCard />);

    const card = screen.getByRole('region', { name: 'Distance' });
    expect(within(card).queryByRole('button')).toBeNull();
    expect(within(card).queryByRole('link')).toBeNull();
  });
});

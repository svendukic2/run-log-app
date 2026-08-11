import { act, render, screen, waitFor, within } from '@testing-library/react';
import { saveWeeklyDefault } from '@/lib/onboarding';
import { addRun } from '@/lib/runs';
import { seedGoal, seedProfile, seedRuns } from '@/test/runsApiMock';
import WeeklyGoalCard from './WeeklyGoalCard';

function runOn(date: string, distanceKm: number, durationSeconds: number) {
  return {
    routeName: 'Morning loop',
    distanceKm,
    durationSeconds,
    date,
    effort: 'Medium' as const,
    note: '',
  };
}

// Only Date is faked; real timers stay in place so React's scheduler and
// anything async keep working.
function freezeDateAt(date: Date) {
  jest
    .useFakeTimers({
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    })
    .setSystemTime(date);
}

// Friday of the week 2026-08-03 .. 2026-08-09: 3 days of the week left.
const FRIDAY = new Date(2026, 7, 7, 9, 0, 0);
const MONDAY = new Date(2026, 7, 3, 9, 0, 0);

function readout(): HTMLElement {
  return screen.getByTestId('goal-readout');
}

function statsRow(): HTMLElement {
  return screen.getByTestId('goal-stats');
}

function progressFill(): HTMLElement {
  return screen.getByRole('progressbar', { name: 'Weekly goal progress' })
    .firstElementChild as HTMLElement;
}

describe('WeeklyGoalCard (RUN-17)', () => {
  beforeEach(() => {
    // The SET-6 test's save mints a device session into localStorage; left
    // behind, later tests would kick background week-target fetches.
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the designed empty state on a fresh week (AC1, AC2)', () => {
    freezeDateAt(MONDAY);

    render(<WeeklyGoalCard />);

    expect(screen.getByText('Weekly goal')).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(within(readout()).getByText('0')).toBeInTheDocument();
    expect(within(readout()).getByText('/ 20 km')).toBeInTheDocument();
    expect(screen.getByText('20 km to go')).toBeInTheDocument();
    expect(screen.getByText('Full week ahead')).toBeInTheDocument();
    expect(within(statsRow()).getByText('Runs')).toBeInTheDocument();
    expect(within(statsRow()).getByText('0')).toBeInTheDocument();
    // Avg pace and Time show dash placeholders while there is nothing to
    // compute (DSH-4).
    expect(within(statsRow()).getAllByText('–')).toHaveLength(2);
    expect(progressFill()).toHaveStyle({ width: '0%' });
  });

  it('counts the week down from the calendar even with no runs yet', () => {
    freezeDateAt(FRIDAY);

    render(<WeeklyGoalCard />);

    // "Full week ahead" describes Monday, not "no runs": an empty Friday
    // truthfully has 3 days left.
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getByText('3 days left')).toBeInTheDocument();
  });

  it("reflects this week's runs in badge, readout, bar, captions and stats (AC3)", () => {
    freezeDateAt(FRIDAY);
    seedRuns([runOn('2026-08-05', 8, 2400), runOn('2026-08-07', 6, 2160)]);

    render(<WeeklyGoalCard />);

    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(within(readout()).getByText('14')).toBeInTheDocument();
    expect(within(readout()).getByText('/ 20 km')).toBeInTheDocument();
    expect(screen.getByText('6 km to go')).toBeInTheDocument();
    expect(screen.getByText('3 days left')).toBeInTheDocument();
    expect(within(statsRow()).getByText('2')).toBeInTheDocument();
    // 4560 s over 14 km -> 5:26 /km; 76 minutes -> 1h 16m.
    expect(within(statsRow()).getByText('5:26')).toBeInTheDocument();
    expect(within(statsRow()).getByText('1h 16m')).toBeInTheDocument();
    expect(progressFill()).toHaveStyle({ width: '70%' });
  });

  it('keeps readout and remaining caption consistent for decimal distances', () => {
    freezeDateAt(FRIDAY);
    seedRuns([runOn('2026-08-04', 5.3, 1600), runOn('2026-08-05', 4.7, 1400)]);

    render(<WeeklyGoalCard />);

    // 5.3 + 4.7 carries float dust; the card rounds once and derives both
    // numbers from it, so they always add up to the target.
    expect(within(readout()).getByText('10')).toBeInTheDocument();
    expect(screen.getByText('10 km to go')).toBeInTheDocument();
  });

  it('rounds a fractional distance to one decimal in both captions', () => {
    freezeDateAt(FRIDAY);
    seedRuns([runOn('2026-08-04', 9.35, 3000)]);

    render(<WeeklyGoalCard />);

    expect(within(readout()).getByText('9.4')).toBeInTheDocument();
    expect(screen.getByText('10.6 km to go')).toBeInTheDocument();
  });

  it('reads the target from the stored goal instead of the default', () => {
    freezeDateAt(FRIDAY);
    seedGoal({ km: 30, startDate: '2026-08-03', endDate: null });
    seedRuns([runOn('2026-08-05', 14, 4200)]);

    render(<WeeklyGoalCard />);

    expect(within(readout()).getByText('/ 30 km')).toBeInTheDocument();
    expect(screen.getByText('16 km to go')).toBeInTheDocument();
  });

  it('ignores runs dated outside the current week', () => {
    freezeDateAt(FRIDAY);
    seedRuns([runOn('2026-07-20', 10, 3000)]);

    render(<WeeklyGoalCard />);

    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(within(readout()).getByText('0')).toBeInTheDocument();
  });

  it('recomputes when a run is saved while the card is mounted (AC4, A18)', async () => {
    freezeDateAt(FRIDAY);
    render(<WeeklyGoalCard />);
    expect(screen.getByText('Not started')).toBeInTheDocument();

    await act(async () => {
      await addRun(runOn('2026-08-07', 5, 1500));
    });

    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(within(readout()).getByText('5')).toBeInTheDocument();
    expect(screen.getByText('15 km to go')).toBeInTheDocument();
    expect(progressFill()).toHaveStyle({ width: '25%' });
  });

  it('keeps the current week on its target when a new default is saved (RUN-38 AC4)', async () => {
    freezeDateAt(FRIDAY);
    seedProfile({ defaultWeeklyGoalKm: 20 });
    const { unmount } = render(<WeeklyGoalCard />);

    // Saved mid-week from Settings while the card is mounted: the server
    // freezes the running week under the old default before the new one
    // lands (SET-6), and the save silently reloads the goal store, so the
    // card settles on the frozen 20, never the new 35.
    await act(async () => {
      await saveWeeklyDefault(35);
    });
    await waitFor(() => expect(within(readout()).getByText('/ 20 km')).toBeInTheDocument());

    // A fresh mount re-reads the week's row from the server: still the
    // frozen 20, not the 35 the fallback seed would now guess.
    unmount();
    render(<WeeklyGoalCard />);
    await waitFor(() => expect(within(readout()).getByText('/ 20 km')).toBeInTheDocument());
  });

  it('seeds a fresh week from the profile default (RUN-38 AC3)', () => {
    // The next Monday arrives with no target row yet; the week seeds from
    // profile.defaultWeeklyGoalKm, exactly what the server would snapshot.
    seedProfile({ defaultWeeklyGoalKm: 35 });
    freezeDateAt(new Date(2026, 7, 10, 9, 0, 0));

    render(<WeeklyGoalCard />);

    expect(within(readout()).getByText('/ 35 km')).toBeInTheDocument();
    expect(screen.getByText('35 km to go')).toBeInTheDocument();
  });

  it('clamps the bar and the remaining caption when the goal is exceeded', () => {
    freezeDateAt(FRIDAY);
    seedRuns([runOn('2026-08-05', 25, 7500)]);

    render(<WeeklyGoalCard />);

    expect(screen.getByText('0 km to go')).toBeInTheDocument();
    expect(progressFill()).toHaveStyle({ width: '100%' });
    const bar = screen.getByRole('progressbar', { name: 'Weekly goal progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '20');
    // The readout stays the one place the overshoot is visible.
    expect(bar).toHaveAttribute('aria-valuetext', '25 of 20 kilometres');
  });
});

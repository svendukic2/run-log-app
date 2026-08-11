import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import {
  applyGoalTarget,
  getAppliedGoal,
  getDefaultGoal,
  resolveGoalTarget,
  saveDefaultGoal,
  saveGoal,
} from '@/lib/goal';
import { getPlanGeneratedAt, stampPlanGenerated } from '@/lib/plan';
import { addRun, todayIso, type Run } from '@/lib/runs';
import { seedRuns } from '@/test/runsApiMock';
import CurrentPlanCard from './CurrentPlanCard';
import WeeklyGoalCard from './WeeklyGoalCard';

function runDraft(overrides: Partial<Omit<Run, 'id'>> = {}): Omit<Run, 'id'> {
  return {
    routeName: 'Morning loop',
    distanceKm: 10,
    durationSeconds: 3000,
    date: todayIso(),
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

describe('Current plan card (RUN-32)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the header, the updated caption and Regenerate (AC1)', () => {
    seedRun();

    render(<CurrentPlanCard />);

    const card = screen.getByRole('region', { name: "This week's plan" });
    expect(within(card).getByText(/updated just now/)).toBeInTheDocument();
    // Without an orchestrator wiring onRegenerate (CoachView, RUN-35), the
    // control announces itself as not yet available.
    const regenerate = within(card).getByRole('button', { name: 'Regenerate' });
    expect(regenerate).toHaveAttribute('aria-disabled', 'true');
    expect(regenerate).toHaveAccessibleDescription(
      'Not available yet: regenerating arrives in an upcoming update.',
    );
  });

  it('hands the Regenerate click to the page when wired (RUN-35)', async () => {
    const user = userEvent.setup();
    const onRegenerate = jest.fn();
    seedRun();

    render(<CurrentPlanCard onRegenerate={onRegenerate} />);

    const regenerate = screen.getByRole('button', { name: 'Regenerate' });
    expect(regenerate).not.toHaveAttribute('aria-disabled');
    await user.click(regenerate);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('respects a stored generation stamp in the caption (A16)', () => {
    stampPlanGenerated(Date.now() - 2 * 3_600_000);
    seedRun();

    render(<CurrentPlanCard />);

    expect(screen.getByText(/updated 2h ago/)).toBeInTheDocument();
  });

  it('stamps the first generation once and keeps it (A16, AC4)', () => {
    seedRun();
    expect(getPlanGeneratedAt()).toBeNull();

    const { unmount } = render(<CurrentPlanCard />);
    const stamped = getPlanGeneratedAt();
    expect(stamped).not.toBeNull();
    unmount();

    render(<CurrentPlanCard />);
    expect(getPlanGeneratedAt()).toBe(stamped);
  });

  it('derives the first plan from the weekly goal (AC2)', () => {
    saveGoal({ km: 20, startDate: todayIso(), endDate: null });
    seedRun({ distanceKm: 5 });

    render(<CurrentPlanCard />);

    expect(screen.getByText('Aim for 20 km this week')).toBeInTheDocument();
    expect(screen.getByText(/Your first plan starts from your weekly goal\./)).toBeInTheDocument();
    // No last week to compare against.
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('steps a real last week up by 10% and shows all four stats (AC2, AC3)', () => {
    // Wed 5 Aug 2026; last week (Jul 27-Aug 2) holds two 10 km runs.
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5, 9, 0));
    seedRun({ date: '2026-07-28' });
    seedRun({ date: '2026-07-30', routeName: 'River trail' });

    render(<CurrentPlanCard />);

    expect(screen.getByText('Aim for 22 km this week')).toBeInTheDocument();
    expect(screen.getByText(/a \+10% step up from last week/)).toBeInTheDocument();

    const card = screen.getByRole('region', { name: "This week's plan" });
    const labels = within(card)
      .getAllByRole('term')
      .map((dt) => dt.textContent);
    expect(labels).toEqual(['Suggested target', 'Vs last week', 'Sessions', 'Key workout']);
    expect(within(card).getByText('22 km')).toBeInTheDocument();
    expect(within(card).getByText('+10%')).toBeInTheDocument();
    expect(within(card).getByText('2-3')).toBeInTheDocument();
    expect(within(card).getByText('1 tempo')).toBeInTheDocument();
  });

  it('follows the runs store: a new run moves the plan (no stale snapshot)', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5, 9, 0));
    seedRun({ date: '2026-07-28' });
    render(<CurrentPlanCard />);
    expect(screen.getByText('Aim for 11 km this week')).toBeInTheDocument();

    await logRun({ date: '2026-07-30', routeName: 'River trail' });

    expect(screen.getByText('Aim for 22 km this week')).toBeInTheDocument();
  });

  it('keeps "See the reasoning" visible but inert (RUN-33 AC3, A21)', () => {
    seedRun();

    render(<CurrentPlanCard />);

    const reasoning = screen.getByRole('button', { name: 'See the reasoning' });
    expect(reasoning).toHaveAttribute('aria-disabled', 'true');
    expect(reasoning).toHaveAccessibleDescription('Not available yet.');
  });

  describe('apply to weekly goal (RUN-33)', () => {
    function clock() {
      // Wed 5 Aug 2026; last week (Jul 27-Aug 2) is the plan's reference.
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5, 9, 0));
      return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    }

    it('makes the suggested target the current goal and stays on the card (AC1)', async () => {
      const user = clock();
      seedRun({ date: '2026-07-28' });
      seedRun({ date: '2026-07-30', routeName: 'River trail' });

      render(<CurrentPlanCard />);
      expect(screen.getByText('Aim for 22 km this week')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /apply to weekly goal/i }));

      expect(resolveGoalTarget(null, getDefaultGoal(), todayIso(), getAppliedGoal())).toBe(22);
      // No navigation, no confirmation dialog (A15): the card is still here,
      // with a status line acknowledging the click.
      expect(screen.getByRole('region', { name: "This week's plan" })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Weekly goal set to 22 km.');
    });

    it('follows a re-apply after new runs move the suggestion', async () => {
      const user = clock();
      seedRun({ date: '2026-07-28' });

      render(<CurrentPlanCard />);
      await user.click(screen.getByRole('button', { name: /apply to weekly goal/i }));
      expect(screen.getByRole('status')).toHaveTextContent('Weekly goal set to 11 km.');

      // A second last-week run doubles the reference distance: new suggestion,
      // and the old confirmation must not describe the old goal.
      await logRun({ date: '2026-07-30', routeName: 'River trail' });
      expect(screen.getByText('Aim for 22 km this week')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /apply to weekly goal/i }));

      expect(getAppliedGoal()?.km).toBe(22);
      expect(screen.getByRole('status')).toHaveTextContent('Weekly goal set to 22 km.');
    });

    it('drops the confirmation once the target moves from elsewhere', async () => {
      const user = clock();
      seedRun({ date: '2026-07-28' });
      seedRun({ date: '2026-07-30', routeName: 'River trail' });

      render(<CurrentPlanCard />);
      await user.click(screen.getByRole('button', { name: /apply to weekly goal/i }));
      expect(screen.getByRole('status')).toHaveTextContent('Weekly goal set to 22 km.');

      // Another surface (say a second tab) moves this week's target: the
      // confirmation would now be a lie, so it vanishes.
      act(() => {
        applyGoalTarget(30);
      });

      expect(screen.getByRole('status')).toHaveTextContent('');
    });

    it('claims nothing when the write fails (quota, private browsing)', async () => {
      const user = clock();
      seedRun({ date: '2026-07-28' });
      render(<CurrentPlanCard />);

      const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      await user.click(screen.getByRole('button', { name: /apply to weekly goal/i }));
      setItem.mockRestore();

      expect(getAppliedGoal()).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent('');
    });

    it('shows the applied target on the dashboard goal card (AC2)', async () => {
      const user = clock();
      seedRun({ date: '2026-07-28' });
      seedRun({ date: '2026-07-30', routeName: 'River trail' });

      render(
        <>
          <CurrentPlanCard />
          <WeeklyGoalCard />
        </>,
      );

      await user.click(screen.getByRole('button', { name: /apply to weekly goal/i }));

      // Both last-week runs sit outside the current week: 0 done of 22.
      const readout = within(screen.getByTestId('goal-readout'));
      expect(readout.getByText('0')).toBeInTheDocument();
      expect(readout.getByText('/ 22 km')).toBeInTheDocument();
    });

    it('does not disturb a pending Settings default for future weeks', async () => {
      const user = clock();
      saveDefaultGoal(45, todayIso());
      seedRun({ date: '2026-07-28' });

      render(<CurrentPlanCard />);
      await user.click(screen.getByRole('button', { name: /apply to weekly goal/i }));

      expect(resolveGoalTarget(null, getDefaultGoal(), todayIso(), getAppliedGoal())).toBe(11);
      expect(resolveGoalTarget(null, getDefaultGoal(), '2026-08-10', getAppliedGoal())).toBe(45);
    });
  });

  it('renders an empty server shell before hydration', () => {
    seedRun();

    // Runs hydrate on the client; the server ships nothing.
    expect(renderToString(<CurrentPlanCard />)).toBe('');
  });
});

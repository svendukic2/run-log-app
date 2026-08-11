import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { applyGoalTarget } from '@/lib/goal';
import { getProfileRecord } from '@/lib/onboarding';
import { getPlanGeneratedAt, stampPlanGenerated } from '@/lib/plan';
import { addRun, todayIso, type Run } from '@/lib/runs';
import {
  failWeekTargetApi,
  seedGoal,
  seedProfile,
  seedRuns,
  seedWeekTarget,
} from '@/test/runsApiMock';
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

// Clicks "Apply to weekly goal". Applying is a PUT since RUN-50, so each
// test waits for its visible outcome with waitFor (which knows how to
// drive jest's fake timers) instead of trying to drain the promise chain
// by hand here.
async function apply(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /apply to weekly goal/i }));
}

describe('Current plan card (RUN-32)', () => {
  beforeEach(() => {
    // The plan stamp still lives in localStorage (runlog.plan); clearing it
    // starts every test without a generation stamp. The session survives
    // this on purpose (memory-first since RUN-58).
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
    seedGoal({ km: 20, startDate: todayIso(), endDate: null });
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
      // Every test is signed in since RUN-58, so mounting the card fires the
      // week-target refresh. Materialize the week up front: the refresh then
      // has nothing to fetch, and its late merge cannot race the applies
      // under fake timers.
      seedWeekTarget(20);
      return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    }

    it('makes the suggested target the current goal and stays on the card (AC1)', async () => {
      const user = clock();
      seedRun({ date: '2026-07-28' });
      seedRun({ date: '2026-07-30', routeName: 'River trail' });

      render(<CurrentPlanCard />);
      expect(screen.getByText('Aim for 22 km this week')).toBeInTheDocument();

      await apply(user);

      // No navigation, no confirmation dialog (A15): the card is still here,
      // with a status line acknowledging the click. The line only renders
      // while the store's week target equals the applied km, so its presence
      // is also the proof that this week's target moved to 22.
      expect(screen.getByRole('region', { name: "This week's plan" })).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Weekly goal set to 22 km.'),
      );
    });

    it('follows a re-apply after new runs move the suggestion', async () => {
      const user = clock();
      seedRun({ date: '2026-07-28' });

      render(<CurrentPlanCard />);
      await apply(user);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Weekly goal set to 11 km.'),
      );

      // A second last-week run doubles the reference distance: new suggestion,
      // and the old confirmation must not describe the old goal.
      await logRun({ date: '2026-07-30', routeName: 'River trail' });
      expect(screen.getByText('Aim for 22 km this week')).toBeInTheDocument();

      await apply(user);

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Weekly goal set to 22 km.'),
      );
    });

    it('drops the confirmation once the target moves from elsewhere', async () => {
      const user = clock();
      seedRun({ date: '2026-07-28' });
      seedRun({ date: '2026-07-30', routeName: 'River trail' });

      render(<CurrentPlanCard />);
      await apply(user);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Weekly goal set to 22 km.'),
      );

      // Another surface (say a second tab) moves this week's target: the
      // confirmation would now be a lie, so it vanishes.
      await act(async () => {
        await applyGoalTarget(30);
      });

      expect(screen.getByRole('status')).toHaveTextContent('');
    });

    it('claims nothing when the server rejects the apply', async () => {
      const user = clock();
      seedRun({ date: '2026-07-28' });
      render(<CurrentPlanCard />);

      failWeekTargetApi(500);
      await apply(user);

      // The card confirms only what the server accepted: no status line,
      // just the server's own failure message inline (the app-wide write
      // convention since RUN-48).
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Applying the weekly goal failed (500).',
        ),
      );
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

      await apply(user);

      // Both last-week runs sit outside the current week: 0 done of 22.
      const readout = within(screen.getByTestId('goal-readout'));
      await waitFor(() => expect(readout.getByText('/ 22 km')).toBeInTheDocument());
      expect(readout.getByText('0')).toBeInTheDocument();
    });

    it('does not disturb the Settings default that seeds future weeks', async () => {
      const user = clock();
      seedProfile({
        firstName: 'Marko',
        lastName: 'Kovač',
        email: 'marko@email.com',
        defaultWeeklyGoalKm: 45,
      });
      seedRun({ date: '2026-07-28' });

      render(<CurrentPlanCard />);
      await apply(user);

      // The apply rewrote THIS week's target only; the profile default that
      // seeds every not-yet-materialized week is untouched.
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Weekly goal set to 11 km.'),
      );
      expect(getProfileRecord()?.defaultWeeklyGoalKm).toBe(45);
    });
  });

  it('renders an empty server shell before hydration', () => {
    seedRun();

    // Runs hydrate on the client; the server ships nothing.
    expect(renderToString(<CurrentPlanCard />)).toBe('');
  });
});

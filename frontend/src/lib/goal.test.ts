import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  breakRunsAuth,
  failGoalApi,
  installRunsApiMock,
  makeGoalLoadFail,
  plantTestSession,
  seedGoal,
  seedProfile,
  seedWeekTarget,
} from '@/test/runsApiMock';
import { fetchWeekTarget } from './accountApi';
import { finishOnboarding, saveDraftGoal, saveDraftProfile } from './onboarding';
import {
  __resetGoalStoreForTests,
  applyGoalTarget,
  clampGoal,
  formatGoalDate,
  GOAL_DEFAULT_KM,
  GOAL_MAX_KM,
  GOAL_MIN_KM,
  reloadGoal,
  todayIso,
  useGoal,
  useGoalStoreError,
  useGoalStoreStatus,
  useGoalTarget,
  type Goal,
} from './goal';
import { startOfWeek } from './runs';

// A minimal component exposing the store status, the cached goal, the
// current week's target and the error line, for the store tests.
function GoalProbe() {
  const goal = useGoal();
  const error = useGoalStoreError();
  const target = useGoalTarget(todayIso());
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { 'data-testid': 'goal-status' }, useGoalStoreStatus()),
    React.createElement('span', { 'data-testid': 'goal-km' }, goal ? String(goal.km) : ''),
    React.createElement('span', { 'data-testid': 'goal-target' }, String(target)),
    React.createElement('span', { 'data-testid': 'goal-error' }, error?.message ?? ''),
  );
}

const GOAL_30: Goal = { km: 30, startDate: '2026-08-03', endDate: null };
const ANA = { firstName: 'Ana', lastName: 'Anić', email: 'ana@example.com' };

function fetchCalls(): Array<[string, RequestInit?]> {
  return (global.fetch as jest.Mock).mock.calls as Array<[string, RequestInit?]>;
}

describe('goal bounds (A17)', () => {
  it('clamps into the slider scale', () => {
    expect(clampGoal(75)).toBe(GOAL_MAX_KM);
    expect(clampGoal(-5)).toBe(GOAL_MIN_KM);
    expect(clampGoal(30)).toBe(30);
  });

  it('keeps the documented 0 / 60 / 20 km scale', () => {
    expect(GOAL_MIN_KM).toBe(0);
    expect(GOAL_MAX_KM).toBe(60);
    expect(GOAL_DEFAULT_KM).toBe(20);
  });
});

describe('formatGoalDate', () => {
  it('renders the date the way the designs write it', () => {
    expect(formatGoalDate('2026-07-14')).toBe('Tue, 14 Jul 2026');
  });
});

describe('todayIso', () => {
  it('produces a local-time ISO day string', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('goal store (API-backed since RUN-50)', () => {
  // jest.setup.ts installs a fresh in-memory backend and primes the store to
  // ready-and-empty before every test; localStorage is cleared here so a
  // session from another test never leaks into the load path.
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('answers a fresh device without the network: ready, no goal, the 20 km default', async () => {
    // Same lazy rule as the runs and profile stores: asking the server here
    // would mint an account as a side effect of a page view.
    __resetGoalStoreForTests();

    render(React.createElement(GoalProbe));

    await waitFor(() => expect(screen.getByTestId('goal-status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('goal-km')).toBeEmptyDOMElement();
    expect(screen.getByTestId('goal-target')).toHaveTextContent(String(GOAL_DEFAULT_KM));
    expect(fetchCalls()).toHaveLength(0);
  });

  it("loads the goal and materializes the current week's target on mount", async () => {
    plantTestSession();
    seedGoal(GOAL_30);
    // seedGoal primes the cache; re-arm so mounting walks the real load path
    // against the seeded backend.
    __resetGoalStoreForTests();

    render(React.createElement(GoalProbe));

    await waitFor(() => expect(screen.getByTestId('goal-status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('goal-km')).toHaveTextContent('30');
    // The load's GET is what materializes the week server-side (the RUN-49
    // snapshot rule): the target is the frozen row, seeded from the goal km.
    expect(screen.getByTestId('goal-target')).toHaveTextContent('30');
    const monday = startOfWeek(todayIso());
    expect(
      fetchCalls().some(
        ([url, init]) => url === `/api/week-targets/${monday}` && (init?.method ?? 'GET') === 'GET',
      ),
    ).toBe(true);
  });

  it('prefers the profile default over the goal km as the not-yet-materialized seed', () => {
    // The fallback answers with the same number the server WOULD freeze, so
    // the figure on screen never changes when the real row lands.
    seedGoal(GOAL_30);
    seedProfile({ ...ANA, defaultWeeklyGoalKm: 45 });

    render(React.createElement(GoalProbe));

    expect(screen.getByTestId('goal-target')).toHaveTextContent('45');
  });

  it('falls back to the goal km without a profile, and to 20 km without either', () => {
    seedGoal(GOAL_30);
    const { unmount } = render(React.createElement(GoalProbe));
    expect(screen.getByTestId('goal-target')).toHaveTextContent('30');
    unmount();

    __resetGoalStoreForTests({ goal: null, weekTarget: null });
    render(React.createElement(GoalProbe));
    expect(screen.getByTestId('goal-target')).toHaveTextContent(String(GOAL_DEFAULT_KM));
  });

  it('serves a materialized week target over any seed', () => {
    seedProfile({ ...ANA, defaultWeeklyGoalKm: 45 });
    seedGoal(GOAL_30);
    seedWeekTarget(26);

    render(React.createElement(GoalProbe));

    expect(screen.getByTestId('goal-target')).toHaveTextContent('26');
  });

  it('applyGoalTarget PUTs the current week and updates the cache synchronously', async () => {
    await applyGoalTarget(32);

    // The cache already holds the new target: no async settling after await.
    render(React.createElement(GoalProbe));
    expect(screen.getByTestId('goal-target')).toHaveTextContent('32');

    // The backend row changed too, not just the cache.
    const monday = startOfWeek(todayIso());
    await expect(fetchWeekTarget(monday)).resolves.toEqual({ weekStart: monday, targetKm: 32 });
  });

  it.each<[string, number]>([
    ['zero', 0],
    ['negative', -5],
    ['NaN', NaN],
    ['infinite', Infinity],
  ])('applyGoalTarget rejects a %s km without a request', async (_label, km) => {
    // Throws like every other write path (the card shows the message);
    // nothing reaches the network for a number that can never be a target.
    await expect(applyGoalTarget(km)).rejects.toThrow('not a usable number');
    expect(fetchCalls()).toHaveLength(0);
  });

  it('applyGoalTarget refuses a km above the server ceiling instead of storing a different number', async () => {
    // Clamping here would confirm "applied" for a number the runner never
    // chose; refusing keeps the confirmation honest.
    await expect(applyGoalTarget(5000)).rejects.toThrow('above the maximum of 1000 km');
    expect(fetchCalls()).toHaveLength(0);
  });

  it('applyGoalTarget rejects when the PUT cannot land, cache untouched', async () => {
    // A device whose identity terminally fails to authenticate: login 401s,
    // signup 409s. The card catches and shows the ApiError message.
    breakRunsAuth();

    await expect(applyGoalTarget(25)).rejects.toThrow(/no longer matches its account/);

    // The cache did not pretend the apply landed either.
    render(React.createElement(GoalProbe));
    expect(screen.getByTestId('goal-target')).toHaveTextContent(String(GOAL_DEFAULT_KM));
  });

  it('lands in the error state when the initial load fails, and recovers on retry', async () => {
    // The store logs load failures outside production; keep the output clean.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    makeGoalLoadFail();
    render(React.createElement(GoalProbe));

    await waitFor(() => expect(screen.getByTestId('goal-status')).toHaveTextContent('error'));
    expect(screen.getByTestId('goal-error')).toHaveTextContent(/failed \(500\)/);

    // The mock has no per-endpoint restore for the account GETs; a fresh
    // install clears the simulated failure. The planted session survives in
    // localStorage, so the retry walks the whole load path again.
    installRunsApiMock();
    act(() => {
      reloadGoal();
    });
    await waitFor(() => expect(screen.getByTestId('goal-status')).toHaveTextContent('ready'));
    consoleError.mockRestore();
  });
});

// The account-replacement and refresh-failure paths the RUN-50 review
// demanded proof for.
describe('account replacement and refresh failures (RUN-50 review)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('reloads after onboarding finishes even though nothing was mounted for the event', async () => {
    // The store settled ready-and-empty on the welcome screen, then every
    // subscriber unmounted; finishOnboarding fires its event into a window
    // with no listeners. The next subscribe must notice the account
    // generation moved and reload - without that, the dashboard would read
    // pre-onboarding nulls forever.
    saveDraftProfile({ firstName: 'Ana', lastName: 'Anić', email: 'ana@example.com' });
    saveDraftGoal({ km: 31, startDate: '2026-08-03', endDate: null });
    await finishOnboarding('Beginner');

    render(React.createElement(GoalProbe));

    await waitFor(() => expect(screen.getByTestId('goal-km')).toHaveTextContent('31'));
    expect(screen.getByTestId('goal-status')).toHaveTextContent('ready');
  });

  it('notices a generation bump that lands while a load is in flight', async () => {
    // The generation is captured BEFORE the fetches: a bump racing the load
    // must stay visible as a mismatch, or the store would record the new
    // generation against stale data and never notice. holdRunsLoading is
    // runs-only, so the race is staged with the real async load: start it,
    // finish onboarding while it settles, and assert the follow-up reload
    // (queued by the in-flight guard) delivers the fresh records.
    plantTestSession();
    __resetGoalStoreForTests();
    render(React.createElement(GoalProbe));

    // While the initial load's promises are still settling, the account's
    // records change wholesale.
    saveDraftProfile({ firstName: 'Ana', lastName: 'Anić', email: 'ana@example.com' });
    saveDraftGoal({ km: 37, startDate: '2026-08-03', endDate: null });
    await finishOnboarding('Beginner');

    await waitFor(() => expect(screen.getByTestId('goal-km')).toHaveTextContent('37'));
    expect(screen.getByTestId('goal-status')).toHaveTextContent('ready');
  });

  it('lands in the error state when the week-rollover refresh fails, for the boundary to retry', async () => {
    // The page stayed open across a Monday midnight: the cached target is
    // last week's, the refresh for the new week hits a 500. A silently kept
    // fallback number would have no retry path at all, so the store goes to
    // 'error' like any load failure.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    plantTestSession();
    __resetGoalStoreForTests({
      goal: GOAL_30,
      weekTarget: { weekStart: '2020-01-06', targetKm: 15 },
    });
    failGoalApi(500);

    render(React.createElement(GoalProbe));

    await waitFor(() => expect(screen.getByTestId('goal-status')).toHaveTextContent('error'));
    expect(screen.getByTestId('goal-error')).toHaveTextContent(/failed \(500\)/);
    consoleError.mockRestore();
  });
});

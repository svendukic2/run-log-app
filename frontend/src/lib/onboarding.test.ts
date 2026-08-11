import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  clearTestSession,
  failProfileApi,
  installRunsApiMock,
  makeProfileLoadFail,
  plantTestSession,
  restoreProfileApi,
  seedProfile,
} from '@/test/runsApiMock';
import { type Goal } from './goalMath';
import {
  __resetProfileStoreForTests,
  finishOnboarding,
  getAccountGeneration,
  getOnboardingDraft,
  getProfileRecord,
  reloadProfile,
  saveDraftGoal,
  saveWeeklyDefault,
  useLandingRoute,
  useProfile,
  useProfileError,
  useProfileStatus,
} from './onboarding';
import { ROUTES } from './routes';

// A minimal component exposing the store status, the cached record and the
// error line, for the load-path tests.
function StatusProbe() {
  const profile = useProfile();
  const error = useProfileError();
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { 'data-testid': 'profile-status' }, useProfileStatus()),
    React.createElement('span', { 'data-testid': 'profile-level' }, profile?.runningLevel ?? ''),
    React.createElement('span', { 'data-testid': 'profile-error' }, error?.message ?? ''),
  );
}

function RouteProbe() {
  return React.createElement('span', { 'data-testid': 'landing-route' }, useLandingRoute() ?? '');
}

const GOAL_30: Goal = { km: 30, startDate: '2026-08-03', endDate: null };
const DRAFT_KEY = 'runlog.onboardingDraft';

function fetchCalls(): Array<[string, RequestInit?]> {
  return (global.fetch as jest.Mock).mock.calls as Array<[string, RequestInit?]>;
}

// The PUT sequence in call order: finishOnboarding promises "goal before
// profile", and these tests hold it to it.
function putUrls(): string[] {
  return fetchCalls()
    .filter(([, init]) => init?.method === 'PUT')
    .map(([url]) => url);
}

function putBodies(): Array<Record<string, unknown>> {
  return fetchCalls()
    .filter(([, init]) => init?.method === 'PUT')
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

describe('onboarding wizard draft (RUN-50, goal-only since RUN-59)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips the drafted goal and persists it for a reload', () => {
    // Nothing identity-shaped is drafted any more: name and email live on
    // the account from signup onwards (account.ts).
    saveDraftGoal(GOAL_30);

    expect(getOnboardingDraft()).toEqual({ goal: GOAL_30 });
    // Persisted too, so an abandoned tab resumes the wizard prefilled.
    expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null')).toEqual({ goal: GOAL_30 });
  });

  it('keeps the current walk alive in memory when storage writes are blocked', () => {
    // Safari private mode throws on setItem: durability degrades (a reload
    // starts over), the wizard underway does not.
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    saveDraftGoal(GOAL_30);
    setItem.mockRestore();

    expect(getOnboardingDraft()).toEqual({ goal: GOAL_30 });
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe('profile store (API-backed since RUN-50)', () => {
  // jest.setup.ts installs a fresh in-memory backend, plants a signed-in
  // session and primes the store to ready-and-empty before every test;
  // localStorage is cleared here so a draft from another test never leaks
  // into the load path (the session survives the wipe: its memory copy is
  // the source of truth, RUN-58).
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('answers a signed-out visitor without the network: no session, no requests', async () => {
    // Signed out means no profile by definition (RUN-58): the sign-in
    // screen must not fire doomed, 401-bound requests.
    clearTestSession();
    __resetProfileStoreForTests();

    render(React.createElement(StatusProbe));

    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));
    expect(getProfileRecord()).toBeNull();
    expect(fetchCalls()).toHaveLength(0);
  });

  it('loads the profile from the API for a signed-in account', async () => {
    plantTestSession();
    seedProfile({ runningLevel: 'Advanced', defaultWeeklyGoalKm: 42 });
    // seedProfile primes the cache; re-arm so mounting walks the real load
    // path against the seeded backend.
    __resetProfileStoreForTests();

    render(React.createElement(StatusProbe));

    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('profile-level')).toHaveTextContent('Advanced');
    expect(getProfileRecord()).toEqual({ runningLevel: 'Advanced', defaultWeeklyGoalKm: 42 });
    // The record really crossed the wire; it was not the primed cache.
    expect(fetchCalls().some(([url]) => url === '/api/profile')).toBe(true);
  });

  it('treats a 404 as "not onboarded yet", not an error', async () => {
    // The account exists but onboarding never finished: a routing state the
    // landing redirect acts on.
    plantTestSession();
    __resetProfileStoreForTests();

    render(React.createElement(StatusProbe));

    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));
    expect(getProfileRecord()).toBeNull();
    expect(screen.getByTestId('profile-error')).toBeEmptyDOMElement();
  });

  it('lands in the error state when the initial load fails, and recovers on retry', async () => {
    // The store logs load failures outside production; keep the output clean.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    makeProfileLoadFail();
    render(React.createElement(StatusProbe));

    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('error'));
    expect(screen.getByTestId('profile-error')).toHaveTextContent(/failed \(500\)/);

    // The mock has no per-endpoint restore for the account GETs; a fresh
    // install clears the simulated failure (and plants a fresh session), so
    // the retry walks the whole load path again.
    installRunsApiMock();
    act(() => {
      reloadProfile();
    });
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));
    consoleError.mockRestore();
  });
});

describe('finishOnboarding (RUN-11, narrowed by RUN-59)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('PUTs the goal then the profile, clears the draft and primes the store', async () => {
    saveDraftGoal(GOAL_30);

    await finishOnboarding('Intermediate');

    // Goal first, so the profile PUT (which creates the profile row the
    // seed reads look at) never races it.
    expect(putUrls()).toEqual(['/api/goal', '/api/profile']);
    const bodies = putBodies();
    expect(bodies[0]).toEqual(GOAL_30);
    // The setup answers only: the level is the step's answer and the default
    // weekly goal starts as the onboarding goal km (the Settings stepper
    // edits it from there, SET-3). Name and email are the account's already.
    expect(bodies[1]).toEqual({ runningLevel: 'Intermediate', defaultWeeklyGoalKm: 30 });

    // The draft died with the finish: a stale one would re-route the next
    // visit back into the wizard.
    expect(getOnboardingDraft()).toEqual({});
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();

    // The store was primed with the response: the record is on screen with
    // no async settling.
    render(React.createElement(StatusProbe));
    expect(screen.getByTestId('profile-status')).toHaveTextContent('ready');
    expect(screen.getByTestId('profile-level')).toHaveTextContent('Intermediate');
  });

  it('refuses to finish without a drafted goal instead of fabricating one', async () => {
    // The goal step always drafts (Skip drafts the 20 km default
    // explicitly), so a missing goal means this screen was reached out of
    // order - and a fabricated start date would be displayed as if the user
    // chose it.
    await expect(finishOnboarding('Beginner')).rejects.toThrow(
      'Your weekly goal from the first step is missing. Go back a step.',
    );
    expect(fetchCalls()).toHaveLength(0);
  });
});

describe('useLandingRoute (RUN-13 AC1, reshaped by RUN-58)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('answers nothing until the store settles, then routes an unfinished account to setup', async () => {
    plantTestSession();
    __resetProfileStoreForTests();

    render(React.createElement(RouteProbe));

    // Still loading: callers render nothing rather than flashing a redirect.
    expect(screen.getByTestId('landing-route')).toBeEmptyDOMElement();
    // A session with no profile is an account whose onboarding never
    // finished (signup creates no profile row, RUN-56): the goal step is
    // where it resumes.
    await waitFor(() =>
      expect(screen.getByTestId('landing-route').textContent).toBe(ROUTES.setupGoal),
    );
  });

  it('routes an onboarded account to the dashboard', () => {
    seedProfile();
    render(React.createElement(RouteProbe));
    expect(screen.getByTestId('landing-route').textContent).toBe(ROUTES.dashboard);
  });

  it('sends a signed-out visitor to Sign in', () => {
    clearTestSession();
    render(React.createElement(RouteProbe));
    expect(screen.getByTestId('landing-route').textContent).toBe(ROUTES.signIn);
  });
});

// The failure paths the RUN-50 review demanded proof for: places where a
// partial write could turn into silent data loss without the guards under
// test.
describe('failure paths (RUN-50 review)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps the draft and repairs on retry when the profile PUT fails after the goal landed', async () => {
    saveDraftGoal(GOAL_30);
    failProfileApi(500);

    await expect(finishOnboarding('Beginner')).rejects.toThrow('Saving your profile failed (500).');

    // The goal PUT landed (an account with a goal row and no profile), the
    // draft survived whole for the retry.
    expect(putUrls()).toEqual(['/api/goal', '/api/profile']);
    expect(getOnboardingDraft().goal).toEqual(GOAL_30);

    // The retry repairs the half-written account: both PUTs are full
    // replaces, so re-sending the goal is harmless.
    restoreProfileApi();
    await finishOnboarding('Beginner');
    expect(getProfileRecord()).toEqual({ runningLevel: 'Beginner', defaultWeeklyGoalKm: 30 });
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('refuses a Settings save while no profile record is loaded', async () => {
    // A full-replace PUT with a guessed runningLevel would silently rewrite
    // data; a missing record must be a hard error instead.
    await expect(saveWeeklyDefault(25)).rejects.toThrow('Your profile has not loaded yet.');
    expect(fetchCalls()).toHaveLength(0);
  });

  it('clamps the new default and bumps the account generation for the goal store', async () => {
    seedProfile({ runningLevel: 'Advanced', defaultWeeklyGoalKm: 20 });
    expect(getAccountGeneration()).toBe(0);

    await saveWeeklyDefault(75);

    // Clamped into the slider scale, with the stored level riding along (it
    // is not editable after onboarding).
    expect(putBodies()).toEqual([{ defaultWeeklyGoalKm: 60, runningLevel: 'Advanced' }]);
    expect(getProfileRecord()).toEqual({ runningLevel: 'Advanced', defaultWeeklyGoalKm: 60 });
    // The SET-6 freeze happened server-side during the PUT, so the goal
    // store must reload rather than keep showing the old seed.
    expect(getAccountGeneration()).toBe(1);
  });
});

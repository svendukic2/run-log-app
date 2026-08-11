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
  getOnboardingDraft,
  getProfileRecord,
  profileInitials,
  profileShortName,
  reloadProfile,
  saveDraftGoal,
  saveDraftProfile,
  saveProfileSettings,
  useLandingRoute,
  useProfile,
  useProfileError,
  useProfileStatus,
  type Profile,
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
    React.createElement('span', { 'data-testid': 'profile-name' }, profile?.firstName ?? ''),
    React.createElement('span', { 'data-testid': 'profile-error' }, error?.message ?? ''),
  );
}

function RouteProbe() {
  return React.createElement('span', { 'data-testid': 'landing-route' }, useLandingRoute() ?? '');
}

const ANA: Profile = { firstName: 'Ana', lastName: 'Anić', email: 'ana@example.com' };
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

function names(firstName: string, lastName: string): Profile {
  return { firstName, lastName, email: 'test@email.com' };
}

describe('profileInitials (RUN-14)', () => {
  it('takes the first letters of first and last name, uppercased', () => {
    expect(profileInitials(names('Marko', 'Kovačić'))).toBe('MK');
    expect(profileInitials(names('ana', 'barić'))).toBe('AB');
  });

  it('survives surrounding whitespace', () => {
    expect(profileInitials(names('  Marko ', ' Kovačić '))).toBe('MK');
  });

  it('keeps non-ASCII first letters intact', () => {
    expect(profileInitials(names('Đurđa', 'Šarić'))).toBe('ĐŠ');
  });

  it('degrades to a single letter when one name is empty', () => {
    expect(profileInitials(names('Marko', ''))).toBe('M');
  });
});

describe('profileShortName (RUN-14)', () => {
  it('renders "{First name} {L}." from the profile', () => {
    expect(profileShortName(names('Marko', 'Kovačić'))).toBe('Marko K.');
  });

  it('uppercases the last-name initial but leaves the first name as typed', () => {
    expect(profileShortName(names('ana', 'barić'))).toBe('ana B.');
  });

  it('falls back to the first name alone when the last name is empty', () => {
    expect(profileShortName(names('Marko', ''))).toBe('Marko');
  });
});

describe('onboarding wizard draft (RUN-50)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips the wizard answers and persists them for a reload', () => {
    saveDraftProfile(ANA);
    saveDraftGoal(GOAL_30);

    expect(getOnboardingDraft()).toEqual({ profile: ANA, goal: GOAL_30 });
    // Persisted too, so an abandoned tab resumes the wizard prefilled.
    expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null')).toEqual({
      profile: ANA,
      goal: GOAL_30,
    });
  });

  it('keeps the current walk alive in memory when storage writes are blocked', () => {
    // Safari private mode throws on setItem: durability degrades (a reload
    // starts over), the wizard underway does not.
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    saveDraftProfile(ANA);
    setItem.mockRestore();

    expect(getOnboardingDraft()).toEqual({ profile: ANA });
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
    seedProfile({ ...ANA, runningLevel: 'Advanced', defaultWeeklyGoalKm: 42 });
    // seedProfile primes the cache; re-arm so mounting walks the real load
    // path against the seeded backend.
    __resetProfileStoreForTests();

    render(React.createElement(StatusProbe));

    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Ana');
    expect(getProfileRecord()).toEqual({
      ...ANA,
      runningLevel: 'Advanced',
      defaultWeeklyGoalKm: 42,
    });
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

describe('finishOnboarding (RUN-11)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('PUTs the goal then the profile, clears the draft and primes the store', async () => {
    saveDraftProfile(ANA);
    saveDraftGoal(GOAL_30);

    await finishOnboarding('Intermediate');

    // Goal first, so the profile PUT (which creates the profile row the
    // seed reads look at) never races it.
    expect(putUrls()).toEqual(['/api/goal', '/api/profile']);
    const bodies = fetchCalls()
      .filter(([, init]) => init?.method === 'PUT')
      .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(bodies[0]).toEqual(GOAL_30);
    // The level is the step's answer; the default weekly goal starts as the
    // onboarding goal km (the Settings stepper edits it from there, SET-3).
    expect(bodies[1]).toEqual({ ...ANA, runningLevel: 'Intermediate', defaultWeeklyGoalKm: 30 });

    // The draft died with the finish: a stale one would re-route the next
    // visit back into the wizard.
    expect(getOnboardingDraft()).toEqual({});
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();

    // The store was primed with the response: the record is on screen with
    // no async settling.
    render(React.createElement(StatusProbe));
    expect(screen.getByTestId('profile-status')).toHaveTextContent('ready');
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Ana');
  });

  it('rejects without a draft profile and creates nothing', async () => {
    // The sign-up details never reached this device (signed in on a fresh
    // device with unfinished setup): the finish must not fabricate a
    // profile from nothing.
    await expect(finishOnboarding('Beginner')).rejects.toThrow(
      'Your sign-up details are missing on this device, so setup cannot finish here yet.',
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
    seedProfile(ANA);
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
  const ANA_DRAFT: Profile = { firstName: 'Ana', lastName: 'Anić', email: 'ana@example.com' };

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps the draft and repairs on retry when the profile PUT fails after the goal landed', async () => {
    saveDraftProfile(ANA_DRAFT);
    saveDraftGoal({ km: 30, startDate: '2026-08-03', endDate: null });
    failProfileApi(500);

    await expect(finishOnboarding('Beginner')).rejects.toThrow('Saving your profile failed (500).');

    // The goal PUT landed (an account with a goal row and no profile), the
    // draft survived whole for the retry.
    expect(putUrls()).toEqual(['/api/goal', '/api/profile']);
    expect(getOnboardingDraft().profile).toEqual(ANA_DRAFT);

    // The retry repairs the half-written account: both PUTs are full
    // replaces, so re-sending the goal is harmless.
    restoreProfileApi();
    await finishOnboarding('Beginner');
    expect(getProfileRecord()?.firstName).toBe('Ana');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('refuses a Settings save while no profile record is loaded', async () => {
    // A full-replace PUT with a guessed runningLevel would silently rewrite
    // data; a missing record must be a hard error instead.
    await expect(saveProfileSettings({ ...ANA_DRAFT, defaultWeeklyGoalKm: 25 })).rejects.toThrow(
      'Your profile has not loaded yet.',
    );
    expect(fetchCalls()).toHaveLength(0);
  });
});

describe('finishOnboarding draft symmetry (RUN-50 review, round 2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('refuses to finish without a drafted goal instead of fabricating one', async () => {
    // The goal step always drafts (Skip drafts the 20 km default
    // explicitly), so a missing goal means this screen was reached out of
    // order - and a fabricated start date would be displayed as if the
    // user chose it.
    saveDraftProfile(ANA);

    await expect(finishOnboarding('Beginner')).rejects.toThrow(
      'Your weekly goal from the second step is missing. Go back a step.',
    );
    expect(fetchCalls()).toHaveLength(0);
  });
});

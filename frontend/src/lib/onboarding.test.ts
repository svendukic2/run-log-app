import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  failProfileApi,
  installRunsApiMock,
  makeProfileLoadFail,
  plantTestSession,
  restoreProfileApi,
  seedProfile,
} from '@/test/runsApiMock';
import { fetchWeekTarget } from './accountApi';
import { todayIso, type Goal } from './goalMath';
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
import { startOfWeek } from './runs';

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

// The PUT sequence in call order: the import and finishOnboarding both
// promise "goal before profile", and these tests hold them to it.
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
  // jest.setup.ts installs a fresh in-memory backend and primes the store to
  // ready-and-empty before every test; localStorage is cleared here so a
  // session or draft from another test never leaks into the load path.
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('answers a fresh device without the network: no session, no legacy keys, no requests', async () => {
    // Asking the server here would mint an account as a side effect of a
    // page view (crawlers, previews, incognito), same rule as the runs store.
    __resetProfileStoreForTests();

    render(React.createElement(StatusProbe));

    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));
    expect(getProfileRecord()).toBeNull();
    expect(fetchCalls()).toHaveLength(0);
  });

  it('loads the profile from the API for a device with a session', async () => {
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
    // An account exists (something forced a write earlier) but onboarding
    // never finished: a routing state the landing redirect acts on.
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
    // install clears the simulated failure. The planted session survives in
    // localStorage, so the retry walks the whole load path again.
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
    // The first step's answers are gone (cleared storage mid-wizard): the
    // finish must not fabricate an account from nothing.
    await expect(finishOnboarding('Beginner')).rejects.toThrow(/Start from the beginning/);
    expect(fetchCalls()).toHaveLength(0);
  });
});

describe('one-time import of v1 localStorage data (RUN-50)', () => {
  const LEGACY_KEYS = [
    'runlog.profile',
    'runlog.onboardingComplete',
    'runlog.level',
    'runlog.goal',
    'runlog.defaultGoal',
    'runlog.appliedGoal',
  ];

  const MARKO: Profile = { firstName: 'Marko', lastName: 'Kovačić', email: 'marko@example.com' };

  beforeEach(() => {
    window.localStorage.clear();
  });

  // Plants the pre-RUN-50 keys and re-arms the store, so the next mounted
  // hook runs the load (and with it the import).
  function plantLegacy(entries: Record<string, string>): void {
    for (const [key, value] of Object.entries(entries)) {
      window.localStorage.setItem(key, value);
    }
    __resetProfileStoreForTests();
  }

  function legacyLeftovers(): string[] {
    return LEGACY_KEYS.filter((key) => window.localStorage.getItem(key) !== null);
  }

  it('imports a completed v1 onboarding into the account, goal first, then deletes the keys', async () => {
    plantLegacy({
      'runlog.profile': JSON.stringify(MARKO),
      'runlog.onboardingComplete': 'true',
      'runlog.level': 'intermediate',
      'runlog.goal': JSON.stringify(GOAL_30),
      'runlog.defaultGoal': JSON.stringify({ km: 25 }),
    });

    render(React.createElement(StatusProbe));
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));

    // The lowercase v1 level spelling becomes the API's capitalized one, and
    // the v1 Settings default becomes the profile default.
    expect(getProfileRecord()).toEqual({
      ...MARKO,
      runningLevel: 'Intermediate',
      defaultWeeklyGoalKm: 25,
    });
    expect(putUrls()).toEqual(['/api/goal', '/api/profile']);
    // The keys are gone: the import can never run twice.
    expect(legacyLeftovers()).toEqual([]);
  });

  it('moves a mid-wizard v1 state into the draft without creating an account', async () => {
    // No onboardingComplete flag: v1 never finished, so there is nothing an
    // account could truthfully hold yet.
    plantLegacy({
      'runlog.profile': JSON.stringify(MARKO),
      'runlog.goal': JSON.stringify(GOAL_30),
    });

    render(React.createElement(StatusProbe));
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));

    expect(getProfileRecord()).toBeNull();
    // The half-finished answers prefill the wizard instead of vanishing.
    expect(getOnboardingDraft()).toEqual({ profile: MARKO, goal: GOAL_30 });
    expect(legacyLeftovers()).toEqual([]);
    // No account was minted as a side effect: not a single request went out.
    expect(fetchCalls()).toHaveLength(0);
  });

  it('parks an invalid v1 profile in the draft instead of fabricating an account', async () => {
    // Hand-edited storage may no longer pass the WEL-5 rules; the visitor
    // finishes the wizard (prefilled) rather than the import wedging on a 400.
    plantLegacy({
      'runlog.profile': JSON.stringify({ ...MARKO, firstName: '' }),
      'runlog.onboardingComplete': 'true',
    });

    render(React.createElement(StatusProbe));
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));

    expect(getProfileRecord()).toBeNull();
    expect(getOnboardingDraft()).toEqual({ profile: { ...MARKO, firstName: '' } });
    expect(legacyLeftovers()).toEqual([]);
    expect(fetchCalls()).toHaveLength(0);
  });

  it("turns a current-week applied goal into this week's target", async () => {
    const monday = startOfWeek(todayIso());
    plantLegacy({
      'runlog.profile': JSON.stringify(MARKO),
      'runlog.onboardingComplete': 'true',
      'runlog.goal': JSON.stringify(GOAL_30),
      'runlog.appliedGoal': JSON.stringify({ km: 26, weekStart: monday }),
    });

    render(React.createElement(StatusProbe));
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));

    expect(putUrls()).toEqual(['/api/goal', '/api/profile', `/api/week-targets/${monday}`]);
    // The server's row holds the applied km, not a re-derived seed.
    await expect(fetchWeekTarget(monday)).resolves.toEqual({ weekStart: monday, targetKm: 26 });
  });

  it('drops an applied goal for a past week instead of fabricating history', async () => {
    plantLegacy({
      'runlog.profile': JSON.stringify(MARKO),
      'runlog.onboardingComplete': 'true',
      // A long-gone Monday: the server has no row for that week and RUN-49
      // refuses to invent one, so the import must not try.
      'runlog.appliedGoal': JSON.stringify({ km: 26, weekStart: '2020-01-06' }),
    });

    render(React.createElement(StatusProbe));
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));

    // No goal key was planted either, so no goal row is fabricated: the
    // profile is the only record this import can honestly write.
    expect(putUrls()).toEqual(['/api/profile']);
    expect(legacyLeftovers()).toEqual([]);
  });
});

describe('useLandingRoute (RUN-13 AC1)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('answers nothing until the store settles, then routes', async () => {
    plantTestSession();
    __resetProfileStoreForTests();

    render(React.createElement(RouteProbe));

    // Still loading: callers render nothing rather than flashing a redirect.
    expect(screen.getByTestId('landing-route')).toBeEmptyDOMElement();
    // A session with no profile and no draft is a first launch as far as
    // routing is concerned.
    await waitFor(() =>
      expect(screen.getByTestId('landing-route').textContent).toBe(ROUTES.welcome),
    );
  });

  it('routes an onboarded account to the dashboard', () => {
    seedProfile(ANA);
    render(React.createElement(RouteProbe));
    expect(screen.getByTestId('landing-route').textContent).toBe(ROUTES.dashboard);
  });

  it('resumes a half-finished wizard at the goal step', () => {
    saveDraftProfile(ANA);
    render(React.createElement(RouteProbe));
    expect(screen.getByTestId('landing-route').textContent).toBe(ROUTES.setupGoal);
  });

  it('sends a first launch to the welcome screen', () => {
    render(React.createElement(RouteProbe));
    expect(screen.getByTestId('landing-route').textContent).toBe(ROUTES.welcome);
  });
});

// The failure paths the RUN-50 review demanded proof for: every one of
// these is a place where a partial write or a blocked storage could turn
// into silent data loss without the guards under test.
describe('failure paths (RUN-50 review)', () => {
  const ANA_DRAFT: Profile = { firstName: 'Ana', lastName: 'Anić', email: 'ana@example.com' };
  const LEGACY: Profile = { firstName: 'Marko', lastName: 'Kovačić', email: 'marko@example.com' };
  const LEGACY_KEYS = [
    'runlog.profile',
    'runlog.onboardingComplete',
    'runlog.level',
    'runlog.goal',
    'runlog.defaultGoal',
    'runlog.appliedGoal',
  ];

  function legacyLeftovers(): string[] {
    return LEGACY_KEYS.filter((key) => window.localStorage.getItem(key) !== null);
  }

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps the draft and repairs on retry when the profile PUT fails after the goal landed', async () => {
    saveDraftProfile(ANA_DRAFT);
    saveDraftGoal({ km: 30, startDate: '2026-08-03', endDate: null });
    failProfileApi(500);

    await expect(finishOnboarding('Beginner')).rejects.toThrow(
      'Saving your profile failed (500).',
    );

    // The goal PUT landed (one already-minted account with a goal row and
    // no profile), the draft survived whole for the retry.
    expect(putUrls()).toEqual(['/api/goal', '/api/profile']);
    expect(getOnboardingDraft().profile).toEqual(ANA_DRAFT);

    // The retry repairs the half-written account: both PUTs are full
    // replaces, so re-sending the goal is harmless.
    restoreProfileApi();
    await finishOnboarding('Beginner');
    expect(getProfileRecord()?.firstName).toBe('Ana');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('resumes a legacy import that failed mid-flight: keys survive, writes are re-sent', async () => {
    window.localStorage.setItem('runlog.profile', JSON.stringify(LEGACY));
    window.localStorage.setItem('runlog.onboardingComplete', 'true');
    window.localStorage.setItem('runlog.goal', JSON.stringify(GOAL_30));
    __resetProfileStoreForTests();
    failProfileApi(500);

    render(React.createElement(StatusProbe));
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('error'));

    // Nothing was deleted: the failed import must be resumable.
    expect(legacyLeftovers().sort()).toEqual(
      ['runlog.goal', 'runlog.onboardingComplete', 'runlog.profile'].sort(),
    );

    restoreProfileApi();
    await act(async () => {
      reloadProfile();
    });
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));

    // The resumed import re-sent the goal AND the profile (idempotent full
    // replaces) and only then cleared the keys.
    expect(putUrls()).toEqual(['/api/goal', '/api/profile', '/api/goal', '/api/profile']);
    expect(legacyLeftovers()).toEqual([]);
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Marko');
  });

  it('routes a salvaged INVALID v1 profile back through the Welcome form, never past it', async () => {
    // Broken email: the import parks it in the draft, and the landing route
    // must send its owner to the one screen where names and email are
    // editable - going to setup/goal would dead-end at a "Finish setup"
    // whose PUT can never pass validation.
    window.localStorage.setItem(
      'runlog.profile',
      JSON.stringify({ ...LEGACY, email: 'not-an-email' }),
    );
    window.localStorage.setItem('runlog.onboardingComplete', 'true');
    __resetProfileStoreForTests();

    render(React.createElement(RouteProbe));
    await waitFor(() =>
      expect(screen.getByTestId('landing-route')).toHaveTextContent(ROUTES.welcome),
    );

    // The data is in the draft for the form to prefill, not lost.
    expect(getOnboardingDraft().profile?.email).toBe('not-an-email');
    expect(legacyLeftovers()).toEqual([]);
  });

  it('keeps the legacy keys when the draft salvage cannot write durably (blocked storage)', async () => {
    // Half-finished v1 wizard on a device that now blocks writes: the
    // salvage lands only in memory, so deleting the keys would turn the
    // next reload into data loss. The keys must survive for the retry.
    window.localStorage.setItem('runlog.profile', JSON.stringify(LEGACY));
    __resetProfileStoreForTests();
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    render(React.createElement(StatusProbe));
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('ready'));
    setItem.mockRestore();

    expect(legacyLeftovers()).toEqual(['runlog.profile']);
    // The memory copy still carries this tab's wizard.
    expect(getOnboardingDraft().profile).toEqual(LEGACY);
  });

  it('lands a device account minted WITHOUT onboarding on Welcome (signup creates no profile row)', async () => {
    // The load-bearing contract of "profile exists = onboarded": an account
    // created by the runs import alone (or any apiFetch) has no profile row,
    // so the landing route still runs onboarding. The backend e2e suite
    // proves the server side; this pins the frontend's reading of it.
    plantTestSession();
    __resetProfileStoreForTests();

    render(React.createElement(RouteProbe));
    await waitFor(() =>
      expect(screen.getByTestId('landing-route')).toHaveTextContent(ROUTES.welcome),
    );
  });

  it('refuses a Settings save while no profile record is loaded', async () => {
    // A full-replace PUT with a guessed runningLevel would silently rewrite
    // data; a missing record must be a hard error instead.
    await expect(
      saveProfileSettings({ ...ANA_DRAFT, defaultWeeklyGoalKm: 25 }),
    ).rejects.toThrow('Your profile has not loaded yet.');
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

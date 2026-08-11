import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { getAccountRecord, type AccountRecord } from '@/lib/account';
import { fetchWeekTarget } from '@/lib/accountApi';
import { todayIso } from '@/lib/goal';
import { __resetProfileStoreForTests, getProfileRecord } from '@/lib/onboarding';
import { startOfWeek } from '@/lib/runs';
import {
  failAccountApi,
  failPrivacyApi,
  failProfileApi,
  seedAccount,
  seedPrivacy,
  seedProfile,
} from '@/test/runsApiMock';
import SettingsView from './SettingsView';

// The screen sends an un-onboarded account to the wizard (RUN-59), so the
// router has to be mocked like on every other routing screen.
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
}));

// Two records behind one form since RUN-59: the name and email are the
// ACCOUNT's, the default weekly goal is the profile's.
const STORED: AccountRecord = { firstName: 'Marko', lastName: 'Kovač', email: 'marko@email.com' };

// The state every test starts from: a named account that finished setup with
// the default 20 km weekly goal.
function seedSettings() {
  seedAccount(STORED);
  seedProfile({ defaultWeeklyGoalKm: 20 });
}

function profileCard() {
  return within(screen.getByRole('region', { name: 'Profile' }));
}

function trainingCard() {
  return within(screen.getByRole('region', { name: 'Training' }));
}

function decrease() {
  return trainingCard().getByRole('button', { name: 'Decrease default weekly goal' });
}

function increase() {
  return trainingCard().getByRole('button', { name: 'Increase default weekly goal' });
}

// Every PUT body the mock backend received for a path: the persistence
// assertions read what actually went over the wire, the way the old suite
// read localStorage back.
function putBodies(path: string): Array<Record<string, unknown>> {
  return (global.fetch as jest.Mock).mock.calls
    .filter(([url, init]) => url === path && (init as RequestInit)?.method === 'PUT')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

function accountPutBodies() {
  return putBodies('/api/account');
}

function profilePutBodies() {
  return putBodies('/api/profile');
}

// The same, for the privacy resource (RUN-64): its toggles ride the same
// Save button but persist through their own endpoint.
function privacyPutBodies(): Array<Record<string, boolean>> {
  return putBodies('/api/privacy') as Array<Record<string, boolean>>;
}

// Clicks Save changes and lets every PUT settle: the save is async since

// RUN-50, so assertions wait for the promise chain, not just the click.
async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /save changes/i }));
  await act(async () => {});
}

describe('Settings profile card (RUN-37)', () => {
  beforeEach(() => {
    // Each save mints a device session into localStorage; left behind, the
    // next test's first PUT would 401 and silently re-auth, doubling the
    // requests the assertions count.
    window.localStorage.clear();
    seedSettings();
  });

  it('shows the avatar block with initials, label and caption, and no upload control (AC1)', () => {
    render(<SettingsView />);

    const avatar = within(screen.getByTestId('avatar-block'));
    expect(avatar.getByText('MK')).toBeInTheDocument();
    expect(avatar.getByText('Your avatar')).toBeInTheDocument();
    expect(
      avatar.getByText('Your initials are used automatically across Run Log.'),
    ).toBeInTheDocument();

    // "No upload exists" (SET-2): no file input and no button inside the card;
    // the page's only button is Save changes.
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(profileCard().queryByRole('button')).toBeNull();
  });

  it('prefills First name, Last name and Email from the stored account (AC2)', () => {
    render(<SettingsView />);

    expect(profileCard().getByLabelText('First name')).toHaveValue('Marko');
    expect(profileCard().getByLabelText('Last name')).toHaveValue('Kovač');
    expect(profileCard().getByLabelText('Email')).toHaveValue('marko@email.com');
  });

  it('rejects an emptied first name with an inline message and persists nothing (AC3)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.clear(profileCard().getByLabelText('First name'));
    await save(user);

    expect(screen.getByRole('alert')).toHaveTextContent('First name is required');
    // Neither write happened and the store still holds the seeded identity.
    expect(accountPutBodies()).toHaveLength(0);
    expect(profilePutBodies()).toHaveLength(0);
    expect(getAccountRecord()).toEqual(STORED);
  });

  it('rejects an invalid email with an inline message and persists nothing (AC3)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    const email = profileCard().getByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'not-an-email');
    await save(user);

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
    expect(accountPutBodies()).toHaveLength(0);
    expect(getAccountRecord()).toEqual(STORED);
  });

  it('requires the last name too, matching the Sign up rules (WEL-5)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.clear(profileCard().getByLabelText('Last name'));
    await save(user);

    expect(screen.getByRole('alert')).toHaveTextContent('Last name is required');
    expect(accountPutBodies()).toHaveLength(0);
    expect(getAccountRecord()).toEqual(STORED);
  });

  it('persists a valid draft and updates the avatar initials automatically (AC4)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    const firstName = profileCard().getByLabelText('First name');
    await user.clear(firstName);
    await user.type(firstName, 'Ana');
    await save(user);

    expect(getAccountRecord()).toEqual({ ...STORED, firstName: 'Ana' });
    expect(within(screen.getByTestId('avatar-block')).getByText('AK')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('trims whitespace before persisting, so the card shows what a reload would show', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    const firstName = profileCard().getByLabelText('First name');
    await user.clear(firstName);
    await user.type(firstName, '  Ana  ');
    await save(user);

    expect(getAccountRecord()).toEqual({ ...STORED, firstName: 'Ana' });
    expect(firstName).toHaveValue('Ana');
  });

  it('clears the inline message once a corrected draft saves', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    const firstName = profileCard().getByLabelText('First name');
    await user.clear(firstName);
    await save(user);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.type(firstName, 'Ana');
    await save(user);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(getAccountRecord()).toEqual({ ...STORED, firstName: 'Ana' });
  });

  it('keeps the failure on screen when the identity write fails (RUN-59)', async () => {
    const user = userEvent.setup();
    failAccountApi(500);
    render(<SettingsView />);

    const firstName = profileCard().getByLabelText('First name');
    await user.clear(firstName);
    await user.type(firstName, 'Ana');
    await user.click(increase());
    await save(user);

    // Pessimistic like every write since RUN-48: the failure is inline,
    // nothing pretends to be saved, and the button is back for a retry. The
    // identity goes first, so a failure there leaves the weekly default
    // untouched as well.
    expect(screen.getByRole('alert')).toHaveTextContent('Saving your details failed (500).');
    expect(getAccountRecord()).toEqual(STORED);
    expect(profilePutBodies()).toHaveLength(0);
    expect(getProfileRecord()).toMatchObject({ defaultWeeklyGoalKm: 20 });
    // The initials derive from the STORED record, so they did not follow the
    // typed name anywhere.
    expect(within(screen.getByTestId('avatar-block')).getByText('MK')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  it('names the PARTIAL result when only the weekly-default write fails (RUN-59)', async () => {
    // The two writes are two requests, so this state is reachable: the
    // identity is already live in the sidebar and the greeting. Saying
    // "nothing was saved" here would be a lie, and leaving the stepper on the
    // rejected number would be a second one.
    const user = userEvent.setup();
    failProfileApi(500);
    render(<SettingsView />);

    const firstName = profileCard().getByLabelText('First name');
    await user.clear(firstName);
    await user.type(firstName, 'Ana');
    await user.click(increase());
    await save(user);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Saved: name and email. The rest was not saved: Saving your profile failed (500).',
    );
    // The identity really did land; the default really did not.
    expect(getAccountRecord()).toEqual({ ...STORED, firstName: 'Ana' });
    expect(getProfileRecord()).toMatchObject({ defaultWeeklyGoalKm: 20 });
    // The stepper keeps the pending edit rather than deleting the user's work
    // over a transient failure: pressing Save again re-sends it.
    expect(trainingCard().getByRole('status')).toHaveTextContent('21');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  it('adopts the email spelling the server stored, not the one typed (RUN-59)', async () => {
    // The address is the login credential and the server normalizes it, so
    // the input and the sidebar footer must not show two spellings of it.
    const user = userEvent.setup();
    render(<SettingsView />);

    const email = profileCard().getByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'Marko.Kovac@Example.COM');
    await save(user);

    expect(email).toHaveValue('marko.kovac@example.com');
    expect(getAccountRecord()?.email).toBe('marko.kovac@example.com');
  });

  it('sends an account that never finished setup to the wizard instead of a half-usable form', async () => {
    // Reachable only by deep link (the landing route sends them to setup):
    // with no profile row the Training card has nothing to save into, so
    // showing the form would promise a save that cannot happen.
    __resetProfileStoreForTests(null);
    render(<SettingsView />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/setup/goal'));
    expect(screen.queryByTestId('settings-body')).toBeNull();
  });

  it('renders no store-derived values on the server, where the account is unknown', () => {
    // The pre-hydration markup must not contain the prefilled inputs: the
    // draft is seeded from the client-side account cache, which the server
    // snapshot never reads.
    expect(renderToString(<SettingsView />)).not.toMatch(/Marko/);
  });
});

describe('Settings training card (RUN-38)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedSettings();
  });

  it('shows the label, the designed caption and the minus / value / plus stepper (AC1)', () => {
    render(<SettingsView />);

    expect(trainingCard().getByText('Default weekly goal')).toBeInTheDocument();
    expect(
      trainingCard().getByText('Applied to each new week. You can still adjust it per week.'),
    ).toBeInTheDocument();
    expect(decrease()).toBeInTheDocument();
    expect(increase()).toBeInTheDocument();
    expect(trainingCard().getByText('20 km')).toBeInTheDocument();
  });

  it('seeds the stepper from the stored default weekly goal', () => {
    // Onboarding bakes the goal km into profile.defaultWeeklyGoalKm
    // (finishOnboarding), so the profile default is the stepper's single
    // seed - there is no separate "onboarding goal" fallback anymore.
    seedProfile({ defaultWeeklyGoalKm: 45 });

    render(<SettingsView />);

    expect(trainingCard().getByText('45 km')).toBeInTheDocument();
  });

  it('steps the value up and down by 1 km (AC2)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(increase());
    await user.click(increase());
    expect(trainingCard().getByText('22 km')).toBeInTheDocument();

    await user.click(decrease());
    expect(trainingCard().getByText('21 km')).toBeInTheDocument();
  });

  it('stays within the 0-60 km bounds, disabling the button at each bound (AC2, A17)', async () => {
    const user = userEvent.setup();
    seedProfile({ defaultWeeklyGoalKm: 60 });
    const { unmount } = render(<SettingsView />);

    // At the ceiling only plus is out of play; a click must not move it.
    expect(increase()).toBeDisabled();
    expect(decrease()).toBeEnabled();
    await user.click(increase());
    expect(trainingCard().getByText('60 km')).toBeInTheDocument();
    unmount();

    seedProfile({ defaultWeeklyGoalKm: 0 });
    render(<SettingsView />);

    expect(decrease()).toBeDisabled();
    expect(increase()).toBeEnabled();
    await user.click(decrease());
    expect(trainingCard().getByText('0 km')).toBeInTheDocument();
  });

  it('persists the default on Save while the current week keeps its target (AC3, AC4)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(increase());
    await user.click(increase());
    await save(user);

    // The PUT carried the stepped default for future weeks to seed from...
    expect(profilePutBodies().at(-1)).toMatchObject({ defaultWeeklyGoalKm: 22 });
    // ...and the server froze the running week under the OLD default before
    // the new one landed (SET-6, mirrored by the mock): the week's row still
    // answers 20, not 22.
    const monday = startOfWeek(todayIso());
    await expect(fetchWeekTarget(monday)).resolves.toEqual({
      weekStart: monday,
      targetKm: 20,
    });
  });

  it('carries the untouched default and the stored level through the save unchanged', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await save(user);

    // The profile write is a full replace (RUN-39), so the untouched stepper
    // rides along at its stored value and the running level - not editable
    // after onboarding - rides along too.
    expect(profilePutBodies().at(-1)).toEqual({
      defaultWeeklyGoalKm: 20,
      runningLevel: 'Beginner',
    });
  });

  it('does not persist the stepper value while the profile draft is invalid', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.clear(profileCard().getByLabelText('First name'));
    await user.click(increase());
    await save(user);

    // A single Save gate: nothing on the page persists until the form is
    // valid (RUN-39 saves everything in one action).
    expect(accountPutBodies()).toHaveLength(0);
    expect(profilePutBodies()).toHaveLength(0);
  });
});

describe('Settings save changes persistence (RUN-39)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedSettings();
  });

  it('persists edited identity and training values in one action (AC1)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    const firstName = profileCard().getByLabelText('First name');
    await user.clear(firstName);
    await user.type(firstName, 'Ana');
    await user.click(increase());
    await save(user);

    // One click, one write per record; neither card waited for its own action.
    expect(accountPutBodies()).toHaveLength(1);
    expect(profilePutBodies()).toHaveLength(1);
    expect(getAccountRecord()).toEqual({ ...STORED, firstName: 'Ana' });
    expect(getProfileRecord()).toMatchObject({ defaultWeeklyGoalKm: 21 });
  });

  it('saves silently and stays on the page: no confirmation or success state (AC2)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    const email = profileCard().getByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'ana@email.com');
    await user.click(increase());
    await save(user);

    // Silent save (A23): no inline alert and no success copy appear anywhere;
    // the form is still on the page with the values it just saved, ready for
    // the next edit. (queryByRole('status') is no use here: the stepper's
    // <output> carries that role by design.)
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/saved|success|updated/i)).toBeNull();
    expect(profileCard().getByLabelText('Email')).toHaveValue('ana@email.com');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('shows the saved identity and training values again after a reload (AC3)', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsView />);

    const email = profileCard().getByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'ana@email.com');
    await user.click(decrease());
    await save(user);
    unmount();

    // A fresh mount seeds every draft from the stores alone, so this render is
    // exactly what a full app reload would show.
    render(<SettingsView />);

    expect(profileCard().getByLabelText('First name')).toHaveValue('Marko');
    expect(profileCard().getByLabelText('Email')).toHaveValue('ana@email.com');
    expect(trainingCard().getByText('19 km')).toBeInTheDocument();
  });

  it('keeps the last saved values when a later invalid draft is rejected (AC3)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(increase());
    await save(user);

    // A follow-up invalid save must not disturb what the first one stored.
    await user.clear(profileCard().getByLabelText('Email'));
    await user.click(increase());
    await save(user);

    expect(screen.getByRole('alert')).toHaveTextContent('Email is required');
    expect(accountPutBodies()).toHaveLength(1);
    expect(profilePutBodies()).toHaveLength(1);
    expect(getAccountRecord()).toEqual(STORED);
    expect(getProfileRecord()).toMatchObject({ defaultWeeklyGoalKm: 21 });
  });
});

describe('Settings privacy card (RUN-64)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Identity and setup answers are two records since RUN-59; the privacy
    // card needs the profile to exist at all (an un-onboarded account is
    // sent to the wizard instead).
    seedSettings();
  });

  function toggle(name: string) {
    return within(screen.getByRole('region', { name: 'Privacy' })).getByRole('switch', { name });
  }

  it('shows the three toggles off, with helper copy, for a fresh account (AC1, AC3)', () => {
    render(<SettingsView />);

    // All three private by default: nothing is shared until the owner says
    // so, and each switch explains what turning it on exposes.
    for (const name of ['Public profile', 'Show me on leaderboards', 'Show my route maps']) {
      expect(toggle(name)).toHaveAttribute('aria-checked', 'false');
      expect(toggle(name)).toHaveAccessibleDescription();
    }
  });

  it('persists a flipped toggle on Save and leaves untouched settings alone (AC2)', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsView />);

    await user.click(toggle('Show me on leaderboards'));
    await save(user);

    // One PUT carrying all three values, the two untouched ones unchanged.
    expect(privacyPutBodies()).toEqual([
      { profilePublic: false, showOnLeaderboard: true, showRoutes: false },
    ]);

    // A fresh mount seeds from the store, so this is what a reload shows.
    unmount();
    render(<SettingsView />);
    expect(toggle('Show me on leaderboards')).toHaveAttribute('aria-checked', 'true');

    // Saving again without touching a toggle writes nothing: editing a name
    // must not rewrite settings the user never opened.
    await save(user);
    expect(privacyPutBodies()).toHaveLength(1);
  });

  it('carries all three resources on one Save, each to its own endpoint (RUN-59 + RUN-64)', async () => {
    // One button, three resources: identity, setup answers, privacy grants.
    // The integration point is worth one test - a regression here would save
    // some of what the user changed and quietly drop the rest.
    const user = userEvent.setup();
    render(<SettingsView />);

    const firstName = profileCard().getByLabelText('First name');
    await user.clear(firstName);
    await user.type(firstName, 'Ana');
    await user.click(increase());
    await user.click(toggle('Public profile'));
    await save(user);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(accountPutBodies()).toEqual([{ ...STORED, firstName: 'Ana' }]);
    expect(profilePutBodies()).toEqual([{ runningLevel: 'Beginner', defaultWeeklyGoalKm: 21 }]);
    expect(privacyPutBodies()).toEqual([
      { profilePublic: true, showOnLeaderboard: false, showRoutes: false },
    ]);
  });

  it('renders the stored settings and keeps a failed save on screen (AC1)', async () => {
    seedPrivacy({ profilePublic: true });
    failPrivacyApi();
    const user = userEvent.setup();
    const { unmount } = render(<SettingsView />);

    // The stored state, not the defaults: an opted-in setting shows as on.
    expect(toggle('Public profile')).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle('Show my route maps'));
    await save(user);

    // Pessimistic: the failure stays on screen and nothing pretends to be
    // stored, so a reload still shows what the server actually holds.
    expect(screen.getByRole('alert')).toHaveTextContent(/privacy settings failed/i);
    unmount();
    render(<SettingsView />);
    expect(toggle('Public profile')).toHaveAttribute('aria-checked', 'true');
    expect(toggle('Show my route maps')).toHaveAttribute('aria-checked', 'false');
  });
});

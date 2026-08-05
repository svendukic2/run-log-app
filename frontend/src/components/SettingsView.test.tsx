import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { getDefaultGoal, nextWeekStart, saveDefaultGoal, saveGoal, todayIso } from '@/lib/goal';
import { getProfile, saveProfile, type Profile } from '@/lib/onboarding';
import SettingsView from './SettingsView';

const STORED: Profile = { firstName: 'Marko', lastName: 'Kovač', email: 'marko@email.com' };

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

describe('Settings profile card (RUN-37)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    saveProfile(STORED);
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

  it('prefills First name, Last name and Email from the stored profile (AC2)', () => {
    render(<SettingsView />);

    expect(profileCard().getByLabelText('First name')).toHaveValue('Marko');
    expect(profileCard().getByLabelText('Last name')).toHaveValue('Kovač');
    expect(profileCard().getByLabelText('Email')).toHaveValue('marko@email.com');
  });

  it('rejects an emptied first name with an inline message and persists nothing (AC3)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.clear(profileCard().getByLabelText('First name'));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('First name is required');
    expect(getProfile()).toEqual(STORED);
  });

  it('rejects an invalid email with an inline message and persists nothing (AC3)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    const email = profileCard().getByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'not-an-email');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
    expect(getProfile()).toEqual(STORED);
  });

  it('requires the last name too, matching the Welcome rules (WEL-5)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.clear(profileCard().getByLabelText('Last name'));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Last name is required');
    expect(getProfile()).toEqual(STORED);
  });

  it('persists a valid draft and updates the avatar initials automatically (AC4)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    const firstName = profileCard().getByLabelText('First name');
    await user.clear(firstName);
    await user.type(firstName, 'Ana');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(getProfile()).toEqual({ ...STORED, firstName: 'Ana' });
    expect(within(screen.getByTestId('avatar-block')).getByText('AK')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('trims whitespace before persisting, so the card shows what a reload would show', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    const firstName = profileCard().getByLabelText('First name');
    await user.clear(firstName);
    await user.type(firstName, '  Ana  ');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(getProfile()).toEqual({ ...STORED, firstName: 'Ana' });
    expect(firstName).toHaveValue('Ana');
  });

  it('clears the inline message once a corrected draft saves', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    const firstName = profileCard().getByLabelText('First name');
    await user.clear(firstName);
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.type(firstName, 'Ana');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(getProfile()).toEqual({ ...STORED, firstName: 'Ana' });
  });

  it('renders no storage-derived values on the server, where the profile is unknown', () => {
    // The pre-hydration markup must not contain the prefilled inputs: the
    // draft is seeded from localStorage, which only the client can read.
    expect(renderToString(<SettingsView />)).not.toMatch(/Marko/);
  });
});

describe('Settings training card (RUN-38)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    saveProfile(STORED);
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

  it('seeds the stepper from the onboarding goal when no default was saved yet', () => {
    saveGoal({ km: 30, startDate: '2026-08-03', endDate: null });

    render(<SettingsView />);

    expect(trainingCard().getByText('30 km')).toBeInTheDocument();
  });

  it('seeds the stepper from the latest saved default', () => {
    saveDefaultGoal(45);

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
    saveDefaultGoal(60);
    const { unmount } = render(<SettingsView />);

    // At the ceiling only plus is out of play; a click must not move it.
    expect(increase()).toBeDisabled();
    expect(decrease()).toBeEnabled();
    await user.click(increase());
    expect(trainingCard().getByText('60 km')).toBeInTheDocument();
    unmount();

    saveDefaultGoal(0);
    render(<SettingsView />);

    expect(decrease()).toBeDisabled();
    expect(increase()).toBeEnabled();
    await user.click(decrease());
    expect(trainingCard().getByText('0 km')).toBeInTheDocument();
  });

  it('persists the default on Save, seeding future weeks but not the current one (AC3, AC4)', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(increase());
    await user.click(increase());
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // The new default applies from next Monday; the current week keeps the
    // target it started with (SET-6).
    expect(getDefaultGoal()).toEqual({
      km: 22,
      effectiveFromWeek: nextWeekStart(todayIso()),
      previousKm: 20,
    });
  });

  it('writes no default record when the stepper was not touched', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // Creating the record permanently switches week resolution away from the
    // onboarding goal, so a profile-only save must not create one.
    expect(getDefaultGoal()).toBeNull();
  });

  it('does not persist the stepper value while the profile draft is invalid', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.clear(profileCard().getByLabelText('First name'));
    await user.click(increase());
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // A single Save gate: nothing on the page persists until the form is
    // valid (RUN-39 saves everything in one action).
    expect(getDefaultGoal()).toBeNull();
  });
});

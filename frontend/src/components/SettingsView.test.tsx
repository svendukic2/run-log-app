import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { getProfile, saveProfile, type Profile } from '@/lib/onboarding';
import SettingsView from './SettingsView';

const STORED: Profile = { firstName: 'Marko', lastName: 'Kovač', email: 'marko@email.com' };

function profileCard() {
  return within(screen.getByRole('region', { name: 'Profile' }));
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

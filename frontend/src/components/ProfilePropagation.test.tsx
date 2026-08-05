import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { saveProfile, type Profile } from '@/lib/onboarding';
import DashboardGreeting from './DashboardGreeting';
import SettingsView from './SettingsView';
import Sidebar from './Sidebar';

// Integration coverage for RUN-40: a profile edit saved on 17 · Settings must
// reach every identity surface - the sidebar footer (name, initials, email)
// and the dashboard greeting - through the real save flow, not through a
// direct store write. The single-component suites (Sidebar RUN-14,
// DashboardGreeting RUN-16, SettingsView RUN-37/39) each check their own
// surface in isolation; this one checks the propagation between them.

// The edits happen on Settings, so that is the pathname the sidebar sees.
jest.mock('next/navigation', () => ({
  usePathname: () => '/settings',
}));

const STORED: Profile = { firstName: 'Marko', lastName: 'Kovač', email: 'marko@email.com' };

function footer() {
  return within(screen.getByTestId('profile-footer'));
}

function profileCard() {
  return within(screen.getByRole('region', { name: 'Profile' }));
}

async function replaceValue(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  const input = profileCard().getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
}

function save(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: /save changes/i }));
}

// Sidebar and Settings are mounted together in the real (app) layout, so the
// footer must pick the save up live - no navigation, no remount (AC1, AC2).
function renderSettingsScreen() {
  return render(
    <>
      <Sidebar isOpen onClose={() => {}} />
      <SettingsView />
    </>,
  );
}

describe('Profile propagation (RUN-40)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    saveProfile(STORED);
  });

  it('updates the sidebar footer name and initials after a saved name change (AC1)', async () => {
    const user = userEvent.setup();
    renderSettingsScreen();

    expect(footer().getByText('Marko K.')).toBeInTheDocument();
    expect(footer().getByText('MK')).toBeInTheDocument();

    await replaceValue(user, 'First name', 'Ana');
    await replaceValue(user, 'Last name', 'Barić');
    await save(user);

    expect(footer().getByText('Ana B.')).toBeInTheDocument();
    expect(footer().getByText('AB')).toBeInTheDocument();
    expect(footer().queryByText('Marko K.')).not.toBeInTheDocument();
    expect(footer().queryByText('MK')).not.toBeInTheDocument();
  });

  it('updates the sidebar footer email after a saved email change (AC2)', async () => {
    const user = userEvent.setup();
    renderSettingsScreen();

    expect(footer().getByText('marko@email.com')).toBeInTheDocument();

    await replaceValue(user, 'Email', 'ana@email.com');
    await save(user);

    expect(footer().getByText('ana@email.com')).toBeInTheDocument();
    expect(footer().queryByText('marko@email.com')).not.toBeInTheDocument();
  });

  it('keeps the footer untouched while the save is rejected by validation', async () => {
    const user = userEvent.setup();
    renderSettingsScreen();

    await user.clear(profileCard().getByLabelText('First name'));
    await save(user);

    // Invalid drafts persist nothing (RUN-37 AC3), so nothing may propagate.
    expect(footer().getByText('Marko K.')).toBeInTheDocument();
    expect(footer().getByText('MK')).toBeInTheDocument();
  });

  it('greets with the new first name once the Dashboard renders after the save (AC3)', async () => {
    const user = userEvent.setup();
    const settings = renderSettingsScreen();

    await replaceValue(user, 'First name', 'Ana');
    await save(user);

    // Dashboard and Settings never share a mount: switching screens unmounts
    // the settings body and mounts the greeting fresh, exactly like the app.
    settings.unmount();
    render(<DashboardGreeting />);

    // The time of day is the machine's; only the name matters here (RUN-16
    // owns the variants).
    expect(screen.getByText(/^Good (morning|afternoon|evening), Ana$/)).toBeInTheDocument();
  });

  it('updates the Settings avatar initials from the same save (SET-5)', async () => {
    const user = userEvent.setup();
    renderSettingsScreen();

    const avatar = within(screen.getByTestId('avatar-block'));
    expect(avatar.getByText('MK')).toBeInTheDocument();

    await replaceValue(user, 'Last name', 'Barić');
    await save(user);

    expect(avatar.getByText('MB')).toBeInTheDocument();
  });

  it('keeps long saved names and emails on one truncating footer line (responsive addendum)', async () => {
    const user = userEvent.setup();
    renderSettingsScreen();

    await replaceValue(user, 'First name', 'Maximilian-Aleksander');
    await replaceValue(user, 'Email', 'maximilian.aleksander.kovacic@very-long-domain.example.com');
    await save(user);

    // jsdom cannot measure overflow; the contract is the `truncate` utility on
    // both footer lines, which is what keeps the 264px drawer intact on a
    // phone once real names get long.
    expect(footer().getByText('Maximilian-Aleksander K.')).toHaveClass('truncate');
    expect(
      footer().getByText('maximilian.aleksander.kovacic@very-long-domain.example.com'),
    ).toHaveClass('truncate');
  });
});

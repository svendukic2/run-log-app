import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { __resetProfileStoreForTests, saveDraftProfile } from '@/lib/onboarding';
import { plantTestSession, seedProfile } from '@/test/runsApiMock';
import WelcomePage from './page';

const replace = jest.fn();
const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
}));

function fillForm(values: { firstName?: string; lastName?: string; email?: string }) {
  const user = userEvent.setup();
  return {
    user,
    type: async () => {
      if (values.firstName) await user.type(screen.getByLabelText('First name'), values.firstName);
      if (values.lastName) await user.type(screen.getByLabelText('Last name'), values.lastName);
      if (values.email) await user.type(screen.getByLabelText('Email'), values.email);
      await user.click(screen.getByRole('button', { name: /get started/i }));
    },
  };
}

// The wizard draft as persisted (RUN-50): submitting the welcome form must
// write a local draft, never a profile - no account exists until the last
// step's "Finish setup".
function draftInStorage() {
  return JSON.parse(window.localStorage.getItem('runlog.onboardingDraft') ?? 'null');
}

describe('Welcome screen (RUN-7)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
    push.mockClear();
  });

  it('shows the logo, Welcome badge, heading and intro copy', () => {
    render(<WelcomePage />);

    expect(screen.getByText('Run Log')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome to Run Log' })).toBeInTheDocument();
    expect(screen.getByText(/track every run, hit your weekly goals/i)).toBeInTheDocument();
  });

  it('shows the no-password caption under the form card', () => {
    render(<WelcomePage />);

    expect(
      screen.getByText('No password needed - your runs stay on this device.'),
    ).toBeInTheDocument();
  });

  it('has no password field anywhere on the screen', () => {
    const { container } = render(<WelcomePage />);

    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('shows the three profile inputs with the designed placeholders', () => {
    render(<WelcomePage />);

    expect(screen.getByLabelText('First name')).toHaveAttribute('placeholder', 'Your first name');
    expect(screen.getByLabelText('Last name')).toHaveAttribute('placeholder', 'Your last name');
    expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'you@email.com');
  });

  it('does not redirect on first launch (fresh device, no profile anywhere)', () => {
    render(<WelcomePage />);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Welcome to Run Log' })).toBeInTheDocument();
  });

  it('skips the Welcome screen when the profile exists on the server', () => {
    // A profile on the server IS "onboarding complete" since RUN-50; there
    // is no separate flag anymore.
    seedProfile({ firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' });

    render(<WelcomePage />);

    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('resumes setup when the wizard draft holds the first step', () => {
    saveDraftProfile({ firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' });

    render(<WelcomePage />);

    expect(replace).toHaveBeenCalledWith('/setup/goal');
  });
});

describe('Onboarding is outside the app shell (RUN-13)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
    push.mockClear();
  });

  it('renders no sidebar on the Welcome screen (AC4)', () => {
    render(<WelcomePage />);

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  });

  it('does not flash the Welcome form on the way to the Dashboard (AC1)', async () => {
    // The onboarded account's profile is on the (mock) server but NOT in
    // the store cache: the landing route is unknown until the fetch lands,
    // and the form must never show in the meantime.
    seedProfile({ firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' });
    plantTestSession();
    __resetProfileStoreForTests();

    render(<WelcomePage />);

    // While the profile store loads, the boundary keeps the screen blank.
    expect(screen.queryByRole('heading', { name: 'Welcome to Run Log' })).toBeNull();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByRole('heading', { name: 'Welcome to Run Log' })).toBeNull();
  });
});

describe('Welcome profile form (RUN-8)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
    push.mockClear();
  });

  it('saves the wizard draft and opens the weekly goal step on valid submit', async () => {
    render(<WelcomePage />);

    await fillForm({ firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' }).type();

    expect(draftInStorage()).toEqual({
      profile: { firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' },
    });
    expect(push).toHaveBeenCalledWith('/setup/goal');
    // The draft is local ON PURPOSE: an abandoned wizard must not have
    // minted a server account.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows an inline message and does not navigate when first name is empty', async () => {
    render(<WelcomePage />);

    await fillForm({ lastName: 'Horvat', email: 'marko@email.com' }).type();

    expect(screen.getByText('First name is required')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(draftInStorage()).toBeNull();
  });

  it('shows an inline message and does not save the draft for an invalid email', async () => {
    render(<WelcomePage />);

    await fillForm({ firstName: 'Marko', lastName: 'Horvat', email: 'not-an-email' }).type();

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(draftInStorage()).toBeNull();
  });
});

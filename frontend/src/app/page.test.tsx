import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('does not redirect on first launch (no stored profile)', () => {
    render(<WelcomePage />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('skips the Welcome screen when onboarding was already completed', () => {
    window.localStorage.setItem(
      'runlog.profile',
      JSON.stringify({ firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' }),
    );
    window.localStorage.setItem('runlog.onboardingComplete', 'true');

    render(<WelcomePage />);

    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('resumes setup when a profile exists but onboarding is unfinished', () => {
    window.localStorage.setItem(
      'runlog.profile',
      JSON.stringify({ firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' }),
    );

    render(<WelcomePage />);

    expect(replace).toHaveBeenCalledWith('/setup/goal');
  });
});

describe('Welcome profile form (RUN-8)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
    push.mockClear();
  });

  it('stores the profile and opens the weekly goal step on valid submit', async () => {
    render(<WelcomePage />);

    await fillForm({ firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' }).type();

    expect(JSON.parse(window.localStorage.getItem('runlog.profile') ?? 'null')).toEqual({
      firstName: 'Marko',
      lastName: 'Horvat',
      email: 'marko@email.com',
    });
    expect(push).toHaveBeenCalledWith('/setup/goal');
  });

  it('shows an inline message and does not navigate when first name is empty', async () => {
    render(<WelcomePage />);

    await fillForm({ lastName: 'Horvat', email: 'marko@email.com' }).type();

    expect(screen.getByText('First name is required')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('runlog.profile')).toBeNull();
  });

  it('shows an inline message and does not store the profile for an invalid email', async () => {
    render(<WelcomePage />);

    await fillForm({ firstName: 'Marko', lastName: 'Horvat', email: 'not-an-email' }).type();

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('runlog.profile')).toBeNull();
  });
});

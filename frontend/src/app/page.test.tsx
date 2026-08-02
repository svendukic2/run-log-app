import { render, screen } from '@testing-library/react';
import WelcomePage from './page';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
}));

describe('Welcome screen (RUN-7)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
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

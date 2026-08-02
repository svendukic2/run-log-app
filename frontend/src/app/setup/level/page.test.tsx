import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RunningLevelPage from './page';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
}));

describe('Running level step (RUN-11)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
  });

  it('shows Step 2 of 2, the Last step badge and the heading', () => {
    render(<RunningLevelPage />);

    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Last step')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /what.s your running level\?/i }),
    ).toBeInTheDocument();
  });

  it('shows the three option cards with their descriptions', () => {
    render(<RunningLevelPage />);

    expect(screen.getByText('Beginner')).toBeInTheDocument();
    expect(screen.getByText('New to running or getting back into it')).toBeInTheDocument();
    expect(screen.getByText('Intermediate')).toBeInTheDocument();
    expect(screen.getByText('Run regularly, comfortable with 5-10K')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('Training consistently, chasing new PRs')).toBeInTheDocument();
  });

  it('preselects Beginner so Finish setup is never invalid', () => {
    render(<RunningLevelPage />);

    expect(screen.getByRole('radio', { name: 'Beginner' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Intermediate' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Advanced' })).not.toBeChecked();
  });

  it('selecting a card highlights it and deselects the previous one', async () => {
    const user = userEvent.setup();
    render(<RunningLevelPage />);

    await user.click(screen.getByRole('radio', { name: 'Intermediate' }));

    expect(screen.getByRole('radio', { name: 'Intermediate' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Beginner' })).not.toBeChecked();
  });

  it('Back returns to the weekly goal step', async () => {
    const user = userEvent.setup();
    render(<RunningLevelPage />);

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(push).toHaveBeenCalledWith('/setup/goal');
  });

  it('Finish setup stores the level, completes onboarding and opens the Dashboard', async () => {
    const user = userEvent.setup();
    render(<RunningLevelPage />);

    await user.click(screen.getByRole('radio', { name: 'Advanced' }));
    await user.click(screen.getByRole('button', { name: /finish setup/i }));

    expect(window.localStorage.getItem('runlog.level')).toBe('advanced');
    expect(window.localStorage.getItem('runlog.onboardingComplete')).toBe('true');
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('renders no sidebar, onboarding sits outside the app shell (RUN-13 AC4)', () => {
    render(<RunningLevelPage />);

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  });
});

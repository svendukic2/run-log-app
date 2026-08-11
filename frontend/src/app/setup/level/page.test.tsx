import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayIso } from '@/lib/goal';
import { getOnboardingDraft, saveDraftGoal, saveDraftProfile } from '@/lib/onboarding';
import { breakRunsAuth } from '@/test/runsApiMock';
import RunningLevelPage from './page';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
}));

// A wizard that reached this step: both earlier steps drafted. Finishing
// without the profile draft is rejected by design (the account would have
// no name), so the finish tests always plant this first.
function plantDraft() {
  saveDraftProfile({ firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' });
  saveDraftGoal({ km: 35, startDate: todayIso(), endDate: null });
}

// The body of the PUT the mock backend received for the given path, so the
// tests assert what was actually written, not just that something was.
function putBody(url: string) {
  const call = (global.fetch as jest.Mock).mock.calls.find(
    ([callUrl, init]) => callUrl === url && (init as RequestInit)?.method === 'PUT',
  );
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : null;
}

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

  it('renders no sidebar, onboarding sits outside the app shell (RUN-13 AC4)', () => {
    render(<RunningLevelPage />);

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  });
});

describe('Finish setup writes the account (RUN-11, RUN-50)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
  });

  it('PUTs the drafted goal and profile with the chosen level, then opens the Dashboard', async () => {
    const user = userEvent.setup();
    plantDraft();
    render(<RunningLevelPage />);

    await user.click(screen.getByRole('radio', { name: 'Advanced' }));
    await user.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    // Both writes carry the wizard's answers: the goal exactly as drafted,
    // the profile with the level chosen here and the goal km as the
    // starting default (the Settings stepper edits it from there, SET-3).
    expect(putBody('/api/goal')).toEqual({ km: 35, startDate: todayIso(), endDate: null });
    expect(putBody('/api/profile')).toEqual({
      firstName: 'Marko',
      lastName: 'Horvat',
      email: 'marko@email.com',
      runningLevel: 'Advanced',
      defaultWeeklyGoalKm: 35,
    });
    // The draft dies with a successful finish: the account is now the truth.
    expect(getOnboardingDraft()).toEqual({});
  });

  it('keeps the wizard here on a failed finish: inline error, button back, no navigation', async () => {
    const user = userEvent.setup();
    plantDraft();
    // The device account cannot be minted (login 401, signup 409): the
    // finish must fail visibly instead of claiming success.
    breakRunsAuth();
    render(<RunningLevelPage />);

    await user.click(screen.getByRole('button', { name: /finish setup/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no longer matches its account \(409\)/,
    );
    expect(screen.getByRole('button', { name: /finish setup/i })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
    // The answers survive the failure, so retrying costs nothing.
    expect(getOnboardingDraft().profile).toEqual({
      firstName: 'Marko',
      lastName: 'Horvat',
      email: 'marko@email.com',
    });
  });

  it('refuses to finish when the first step was never drafted', async () => {
    const user = userEvent.setup();
    render(<RunningLevelPage />);

    await user.click(screen.getByRole('button', { name: /finish setup/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your details from the first step are missing or incomplete. Start from the beginning.',
    );
    expect(push).not.toHaveBeenCalled();
    // Nothing reached the server: no half-created account without a name.
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

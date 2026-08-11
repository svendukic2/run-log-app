import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { breakRunsAuth, clearTestSession, hardNavigationsMade } from '@/test/runsApiMock';
import { getOnboardingDraft } from '@/lib/onboarding';
import { ROUTES } from '@/lib/routes';
import { hasStoredSession } from '@/lib/session';
import SignUpPage from './page';

const push = jest.fn();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
}));

const ANA = { firstName: 'Ana', lastName: 'Anić', email: 'ana@example.com' };

async function fillForm(overrides: Partial<typeof ANA & { password: string }> = {}) {
  const values = { ...ANA, password: 'correct-horse', ...overrides };
  const user = userEvent.setup();
  if (values.firstName) await user.type(screen.getByLabelText('First name'), values.firstName);
  if (values.lastName) await user.type(screen.getByLabelText('Last name'), values.lastName);
  if (values.email) await user.type(screen.getByLabelText('Email'), values.email);
  if (values.password) await user.type(screen.getByLabelText('Password'), values.password);
  await user.click(screen.getByRole('button', { name: /Create account/ }));
}

// Sign up took over the v1 Welcome form's job (RUN-58): it collects names
// and email, creates the account and hands the user to the setup steps.
describe('Sign up page (RUN-58)', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    clearTestSession();
  });

  it('creates the account, seeds the wizard draft and opens the goal step (AC2)', async () => {
    render(<SignUpPage />);
    await fillForm();

    // A hard navigation, not router.push: same broom as Sign in.
    await waitFor(() => expect(hardNavigationsMade()).toContain(ROUTES.setupGoal));
    expect(hasStoredSession()).toBe(true);
    // The draft is what "Finish setup" PUTs into the profile record.
    expect(getOnboardingDraft().profile).toEqual(ANA);
  });

  it('rejects a short password locally, before any request', async () => {
    render(<SignUpPage />);
    await fillForm({ password: 'short' });

    expect(screen.getByText(/at least 8 characters/)).toBeVisible();
    expect(hasStoredSession()).toBe(false);
    expect(hardNavigationsMade()).toHaveLength(0);
  });

  it('shows the taken-email error inline on a 409', async () => {
    breakRunsAuth();
    render(<SignUpPage />);
    await fillForm();

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/);
    expect(hasStoredSession()).toBe(false);
  });

  it('links to Sign in', () => {
    render(<SignUpPage />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', ROUTES.signIn);
  });
});

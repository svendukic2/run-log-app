import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { breakRunsAuth, clearTestSession, hardNavigationsMade } from '@/test/runsApiMock';
import { hasStoredSession, WRONG_CREDENTIALS_MESSAGE } from '@/lib/session';
import { ROUTES } from '@/lib/routes';
import SignInPage from './page';

const push = jest.fn();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
}));

async function submit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: /Sign in/ }));
}

// The front door since RUN-58: real credentials, one deliberately vague
// error for wrong ones (AC4), and a session in localStorage on success.
describe('Sign in page (RUN-58)', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    clearTestSession();
  });

  it('signs in and routes through the landing page with a full load (AC3)', async () => {
    render(<SignInPage />);
    await submit('ana@example.com', 'correct-horse');

    // A hard navigation, not router.push: the store caches from the
    // signed-out state must die with the page.
    await waitFor(() => expect(hardNavigationsMade()).toContain(ROUTES.welcome));
    expect(hasStoredSession()).toBe(true);
  });

  it('shows ONE vague inline error for wrong credentials, and stays signed out (AC4)', async () => {
    breakRunsAuth();
    render(<SignInPage />);
    await submit('ana@example.com', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent(WRONG_CREDENTIALS_MESSAGE);
    expect(hasStoredSession()).toBe(false);
    expect(hardNavigationsMade()).toHaveLength(0);
  });

  it('links to Sign up (AC1)', () => {
    render(<SignInPage />);
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', ROUTES.signUp);
  });

  it('redirects an already signed-in visitor to the landing page', () => {
    // installRunsApiMock plants a session; skip the beforeEach sign-out by
    // re-planting here.
    window.localStorage.setItem(
      'runlog.session',
      JSON.stringify({ email: 'test@example.com', token: 'test-token-99' }),
    );
    render(<SignInPage />);
    expect(replace).toHaveBeenCalledWith(ROUTES.welcome);
  });
});

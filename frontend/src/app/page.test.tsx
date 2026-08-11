import { render, waitFor } from '@testing-library/react';
import { __resetGoalStoreForTests } from '@/lib/goal';
import { __resetProfileStoreForTests } from '@/lib/onboarding';
import { __resetRunsStoreForTests } from '@/lib/runs';
import { clearTestSession, seedProfile } from '@/test/runsApiMock';
import LandingPage from './page';

const replace = jest.fn();
const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
}));

// '/' is a pure router since RUN-58 (the Welcome form moved to Sign up): it
// renders nothing itself and replace()s to wherever the visitor belongs.
describe('Landing router (RUN-13, reshaped by RUN-58)', () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
  });

  it('redirects a signed-out visitor to Sign in, rendering nothing', async () => {
    // A fresh visitor: no session, and every store still has its initial
    // load ahead of it (all three settle without the network when signed out).
    clearTestSession();
    __resetProfileStoreForTests();
    __resetGoalStoreForTests();
    __resetRunsStoreForTests(null);

    const { container } = render(<LandingPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/signin'));
    expect(container).toBeEmptyDOMElement();
  });

  it('redirects to the Dashboard when the profile exists on the server', async () => {
    // A profile on the server IS "onboarding complete" (RUN-50 derivation).
    seedProfile({ firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' });

    const { container } = render(<LandingPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(container).toBeEmptyDOMElement();
  });

  it('redirects a signed-in account without a profile to the setup steps', async () => {
    // The default test state: signed in (installRunsApiMock plants the
    // session) with an empty backend - a fresh signup mid-onboarding.
    const { container } = render(<LandingPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/setup/goal'));
    expect(container).toBeEmptyDOMElement();
  });
});

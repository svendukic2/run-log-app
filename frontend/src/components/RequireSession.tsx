'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/routes';
import { hasStoredSession } from '@/lib/session';

// The session never changes under a mounted guard (signing out navigates
// away with a full page load), so the "subscription" has nothing to listen
// to; useSyncExternalStore is here for its hydration semantics - the server
// snapshot is false, the client snapshot reads localStorage, and React
// reconciles the two without a mismatch warning.
const emptySubscribe = () => () => {};

function useHasSession(): boolean {
  return useSyncExternalStore(emptySubscribe, hasStoredSession, () => false);
}

// The route guard (RUN-58 AC1): every guarded screen renders through this,
// and an unauthenticated visitor lands on Sign in. Nothing renders until
// the client-side check ran - flashing a guarded screen at a signed-out
// visitor would be worse than one empty frame.
export default function RequireSession({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasSession = useHasSession();

  useEffect(() => {
    // Read the session HERE rather than trusting the render-time value: on a
    // hydrating page that value is still the server snapshot (false, because
    // the server cannot see localStorage), and redirecting on it would bounce
    // every deep link into a guarded route through Sign in - which, for a
    // signed-in visitor, lands them on the Dashboard instead of the page they
    // asked for. By effect time the real session is readable.
    if (!hasStoredSession()) router.replace(ROUTES.signIn);
  }, [router]);

  if (!hasSession) return null;
  return <>{children}</>;
}

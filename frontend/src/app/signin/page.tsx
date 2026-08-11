'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Badge from '@/components/Badge';
import Brand from '@/components/Brand';
import TextField from '@/components/TextField';
import { ROUTES } from '@/lib/routes';
import {
  ApiError,
  hasStoredSession,
  navigateAfterAuth,
  sessionPersistenceDegraded,
  signIn,
  STORAGE_BLOCKED_MESSAGE,
} from '@/lib/session';

// V2 · Sign in (RUN-58). Replaces the v1 Welcome flow as the app's front
// door: every guarded route redirects here when no session exists. The
// error line is deliberately ONE message for wrong credentials (AC4) - no
// hint about which field was wrong.
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const hasNavigated = useRef(false);

  // An already signed-in visitor does not belong here; the landing page
  // routes them by server state (dashboard or setup resume).
  useEffect(() => {
    if (hasNavigated.current || !hasStoredSession()) return;
    hasNavigated.current = true;
    router.replace(ROUTES.welcome);
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await signIn(email.trim(), password);
      // Blocked storage cannot keep the session across the page load below:
      // navigating would bounce straight back here looking like wrong
      // credentials forever. An honest error beats that loop.
      if (sessionPersistenceDegraded()) {
        setError(STORAGE_BLOCKED_MESSAGE);
        setSubmitting(false);
        return;
      }
      hasNavigated.current = true;
      // Through the landing route (a user who abandoned setup resumes it
      // instead of hitting an app shell with no profile), with a FULL page
      // load: the stores' module-level caches settled under the signed-out
      // identity and must not leak into this one.
      navigateAfterAuth(ROUTES.welcome);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Signing in failed. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col bg-canvas">
      <header className="px-6 pt-[30px] md:px-12">
        <Brand />
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-6 pt-5 pb-16 md:px-12">
        <div className="flex w-full max-w-[520px] flex-col items-center">
          <Badge>Sign in</Badge>
          <h1 className="mt-[22px] text-center font-display text-[32px] leading-[1.08] font-bold tracking-[-0.8px] text-ink md:text-[40px]">
            Welcome back
          </h1>
          <p className="mt-[14px] max-w-[440px] text-center text-[15px] leading-[1.55] text-secondary">
            Sign in to see your runs, goals and coaching on any device.
          </p>
          <form
            noValidate
            onSubmit={(event) => void handleSubmit(event)}
            className="mt-8 flex w-full flex-col gap-[18px] rounded-[22px] border border-line bg-white px-6 py-7 md:px-[38px] md:py-[34px]"
          >
            <TextField
              id="email"
              type="email"
              label="Email"
              placeholder="you@email.com"
              value={email}
              onChange={setEmail}
            />
            <TextField
              id="password"
              type="password"
              label="Password"
              placeholder="Your password"
              value={password}
              onChange={setPassword}
            />
            {error && (
              <p role="alert" className="text-[13.5px] text-accent-pressed">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-[9px] rounded-[14px] bg-accent px-7 py-4 font-semibold text-white hover:bg-accent-pressed disabled:opacity-60"
            >
              <span className="text-[16px]">{submitting ? 'Signing in…' : 'Sign in'}</span>
              <span aria-hidden className="text-[17px]">
                →
              </span>
            </button>
          </form>
          <p className="mt-[18px] text-center text-[13px] text-tertiary">
            New to Run Log?{' '}
            <Link
              href={ROUTES.signUp}
              className="font-semibold text-ink underline underline-offset-2"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

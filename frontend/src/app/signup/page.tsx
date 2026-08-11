'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Badge from '@/components/Badge';
import Brand from '@/components/Brand';
import TextField from '@/components/TextField';
import { saveDraftProfile } from '@/lib/onboardingDraft';
import { validateProfileForm, type ProfileFormErrors } from '@/lib/profileValidation';
import { ROUTES } from '@/lib/routes';
import {
  ApiError,
  hasStoredSession,
  navigateAfterAuth,
  sessionPersistenceDegraded,
  signUp,
  STORAGE_BLOCKED_MESSAGE,
} from '@/lib/session';

// The backend's password rules (SignupDto, RUN-56), mirrored so the form
// rejects locally what the server would reject anyway. Bytes, not
// characters, for the maximum: bcrypt keys on the first 72 BYTES.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72;

// Counted by hand instead of TextEncoder, which jsdom does not provide.
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

// V2 · Sign up (RUN-58). Takes over the v1 Welcome form's job of collecting
// names and email, plus the password that makes it a real account. On
// success the user continues straight into the goal/level setup steps
// (AC2); the names/email are also saved into the wizard draft, which is
// what "Finish setup" PUTs into the profile record.
export default function SignUpPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<ProfileFormErrors & { password?: string }>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (hasNavigated.current || !hasStoredSession()) return;
    hasNavigated.current = true;
    router.replace(ROUTES.welcome);
  }, [router]);

  const validatePassword = (): string | undefined => {
    if (password.length < PASSWORD_MIN_LENGTH) {
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    }
    if (utf8ByteLength(password) > PASSWORD_MAX_BYTES) {
      return 'That password is too long';
    }
    return undefined;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors: ProfileFormErrors & { password?: string } = {
      ...validateProfileForm({ firstName, lastName, email }),
    };
    const passwordError = validatePassword();
    if (passwordError) nextErrors.password = passwordError;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const profile = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      };
      await signUp({ ...profile, password });
      // Same guard as Sign in: with blocked storage the session dies with
      // the page load below, so navigating would strand the fresh account
      // behind a sign-in bounce. (The account exists server-side; signing
      // in works once storage is allowed.)
      if (sessionPersistenceDegraded()) {
        setSubmitError(STORAGE_BLOCKED_MESSAGE);
        setSubmitting(false);
        return;
      }
      // The wizard draft is what "Finish setup" turns into the profile
      // record; seeding it here is what lets the setup steps greet by name
      // and finish without re-asking anything.
      saveDraftProfile(profile);
      hasNavigated.current = true;
      // Full page load for the same reason as Sign in: module-level store
      // caches from the signed-out state must not survive the identity
      // change.
      navigateAfterAuth(ROUTES.setupGoal);
    } catch (caught) {
      setSubmitError(
        caught instanceof ApiError ? caught.message : 'Creating the account failed. Try again.',
      );
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
          <Badge>Sign up</Badge>
          <h1 className="mt-[22px] text-center font-display text-[32px] leading-[1.08] font-bold tracking-[-0.8px] text-ink md:text-[40px]">
            Create your account
          </h1>
          <p className="mt-[14px] max-w-[440px] text-center text-[15px] leading-[1.55] text-secondary">
            Track every run, hit your weekly goals and get simple AI coaching.
          </p>
          <form
            noValidate
            onSubmit={(event) => void handleSubmit(event)}
            className="mt-8 flex w-full flex-col gap-[18px] rounded-[22px] border border-line bg-white px-6 py-7 md:px-[38px] md:py-[34px]"
          >
            <div className="flex flex-col gap-[18px] md:flex-row md:gap-4">
              <TextField
                id="first-name"
                label="First name"
                placeholder="Your first name"
                value={firstName}
                onChange={setFirstName}
                error={errors.firstName}
              />
              <TextField
                id="last-name"
                label="Last name"
                placeholder="Your last name"
                value={lastName}
                onChange={setLastName}
                error={errors.lastName}
              />
            </div>
            <TextField
              id="email"
              type="email"
              label="Email"
              placeholder="you@email.com"
              value={email}
              onChange={setEmail}
              error={errors.email}
            />
            <TextField
              id="password"
              type="password"
              label="Password"
              placeholder="At least 8 characters"
              value={password}
              onChange={setPassword}
              error={errors.password}
            />
            {submitError && (
              <p role="alert" className="text-[13.5px] text-accent-pressed">
                {submitError}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-[9px] rounded-[14px] bg-accent px-7 py-4 font-semibold text-white hover:bg-accent-pressed disabled:opacity-60"
            >
              <span className="text-[16px]">
                {submitting ? 'Creating account…' : 'Create account'}
              </span>
              <span aria-hidden className="text-[17px]">
                →
              </span>
            </button>
          </form>
          <p className="mt-[18px] text-center text-[13px] text-tertiary">
            Already have an account?{' '}
            <Link
              href={ROUTES.signIn}
              className="font-semibold text-ink underline underline-offset-2"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

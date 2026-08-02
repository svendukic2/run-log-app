'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Badge from '@/components/Badge';
import Brand from '@/components/Brand';
import TextField from '@/components/TextField';
import { saveProfile, useLandingRoute } from '@/lib/onboarding';
import { ROUTES } from '@/lib/routes';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
}

// 01 · Welcome (Figma node 78:145). First-launch entry point only: once a
// profile exists there is no way back to this screen.
export default function WelcomePage() {
  const router = useRouter();
  const landing = useLandingRoute();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const hasNavigated = useRef(false);

  // Send a visitor who does not belong on this screen where they do (RUN-13
  // AC1). Guarded so that submitting the form, which also changes the stored
  // landing route, does not fire a second navigation on top of its own push.
  useEffect(() => {
    if (hasNavigated.current || !landing || landing === ROUTES.welcome) return;
    hasNavigated.current = true;
    router.replace(landing);
  }, [landing, router]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: FormErrors = {};
    if (!firstName.trim()) nextErrors.firstName = 'First name is required';
    if (!lastName.trim()) nextErrors.lastName = 'Last name is required';
    if (!email.trim()) {
      nextErrors.email = 'Email is required';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    saveProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
    });
    hasNavigated.current = true;
    router.push(ROUTES.setupGoal);
  };

  // Rendering nothing until the landing route is known keeps an onboarded
  // visitor from seeing this form flash before the Dashboard (RUN-13 AC1).
  if (landing !== ROUTES.welcome) return null;

  return (
    <main className="flex flex-1 flex-col bg-canvas">
      <header className="px-6 pt-[30px] md:px-12">
        <Brand />
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-6 pt-5 pb-16 md:px-12">
        <div className="flex w-full max-w-[520px] flex-col items-center">
          <Badge>Welcome</Badge>
          <h1 className="mt-[22px] text-center font-display text-[32px] leading-[1.08] font-bold tracking-[-0.8px] text-ink md:text-[40px]">
            Welcome to Run Log
          </h1>
          <p className="mt-[14px] max-w-[440px] text-center text-[15px] leading-[1.55] text-secondary">
            Track every run, hit your weekly goals and get simple AI coaching. First, tell us who
            you are.
          </p>
          <form
            noValidate
            onSubmit={handleSubmit}
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
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-[9px] rounded-[14px] bg-accent px-7 py-4 font-semibold text-white hover:bg-accent-pressed"
            >
              <span className="text-[16px]">Get started</span>
              <span aria-hidden className="text-[17px]">
                →
              </span>
            </button>
          </form>
          <p className="mt-[18px] text-center text-[13px] text-tertiary">
            No password needed - your runs stay on this device.
          </p>
        </div>
      </div>
    </main>
  );
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Badge from '@/components/Badge';
import Brand from '@/components/Brand';
import { getProfile, isOnboardingComplete } from '@/lib/onboarding';

// 01 · Welcome (Figma node 78:145). First-launch entry point only: once a
// profile exists there is no way back to this screen.
export default function WelcomePage() {
  const router = useRouter();

  useEffect(() => {
    if (getProfile()) {
      router.replace(isOnboardingComplete() ? '/dashboard' : '/setup/goal');
    }
  }, [router]);

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
          <div className="mt-8 flex w-full flex-col gap-[18px] rounded-[22px] border border-line bg-white px-6 py-7 md:px-[38px] md:py-[34px]">
            <div className="flex flex-col gap-[18px] md:flex-row md:gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <label htmlFor="first-name" className="text-[13px] font-medium text-secondary">
                  First name
                </label>
                <input
                  id="first-name"
                  name="firstName"
                  type="text"
                  placeholder="Your first name"
                  className="w-full rounded-[12px] border border-line-strong bg-white px-[15px] py-[13px] text-[15px] leading-[1.55] text-ink placeholder:text-tertiary"
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <label htmlFor="last-name" className="text-[13px] font-medium text-secondary">
                  Last name
                </label>
                <input
                  id="last-name"
                  name="lastName"
                  type="text"
                  placeholder="Your last name"
                  className="w-full rounded-[12px] border border-line-strong bg-white px-[15px] py-[13px] text-[15px] leading-[1.55] text-ink placeholder:text-tertiary"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-[13px] font-medium text-secondary">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@email.com"
                className="w-full rounded-[12px] border border-line-strong bg-white px-[15px] py-[13px] text-[15px] leading-[1.55] text-ink placeholder:text-tertiary"
              />
            </div>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-[9px] rounded-[14px] bg-accent px-7 py-4 font-semibold text-white hover:bg-accent-pressed"
            >
              <span className="text-[16px]">Get started</span>
              <span aria-hidden className="text-[17px]">
                →
              </span>
            </button>
          </div>
          <p className="mt-[18px] text-center text-[13px] text-tertiary">
            No password needed - your runs stay on this device.
          </p>
        </div>
      </div>
    </main>
  );
}

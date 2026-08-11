'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Badge from '@/components/Badge';
import Brand from '@/components/Brand';
import StepDots from '@/components/StepDots';
import { ApiError } from '@/lib/session';
import { finishOnboarding, type RunningLevel } from '@/lib/onboarding';
import { ROUTES } from '@/lib/routes';

const LEVELS: Array<{ value: RunningLevel; title: string; description: string }> = [
  { value: 'Beginner', title: 'Beginner', description: 'New to running or getting back into it' },
  {
    value: 'Intermediate',
    title: 'Intermediate',
    description: 'Run regularly, comfortable with 5-10K',
  },
  {
    value: 'Advanced',
    title: 'Advanced',
    description: 'Training consistently, chasing new PRs',
  },
];

// 03 · Setup - Running level (Figma node 43:2). Beginner is preselected so
// "Finish setup" is never invalid; finishing writes the wizard's answers to
// the account (RUN-50: the goal and profile PUTs that make onboarding
// "complete" - complete IS the profile existing server-side) and opens the
// Dashboard. Pessimistic like every write since RUN-48: the button disables
// while saving and a failure keeps the wizard here with an inline line, so
// the user is never told they finished when nothing was saved.
export default function RunningLevelPage() {
  const router = useRouter();
  const [level, setLevel] = useState<RunningLevel>('Beginner');
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');

  const handleFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    setFinishError('');
    try {
      await finishOnboarding(level);
      router.push(ROUTES.dashboard);
    } catch (error) {
      setFinishError(
        error instanceof ApiError ? error.message : 'Finishing the setup failed. Try again.',
      );
      setFinishing(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col bg-canvas">
      <header className="px-6 pt-[30px] md:px-12">
        <Brand />
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-6 pt-5 pb-16 md:px-12">
        <div className="flex w-full max-w-[480px] flex-col items-center">
          <StepDots step={2} label="Step 2 of 2" />
          <div className="mt-[26px]">
            <Badge>Last step</Badge>
          </div>
          <h1 className="mt-[22px] text-center font-display text-[32px] leading-[1.08] font-bold tracking-[-0.8px] text-ink md:text-[40px]">
            What&apos;s your
            <br />
            running level?
          </h1>
          <p className="mt-[14px] max-w-[440px] text-center text-[15px] leading-[1.55] text-secondary">
            This helps your AI Coach set the right pace and weekly targets for you.
          </p>
          <fieldset className="mt-[34px] flex w-full flex-col gap-3">
            <legend className="sr-only">Running level</legend>
            {LEVELS.map((option) => {
              const selected = level === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-4 rounded-[16px] px-[22px] py-[18px] ${
                    selected
                      ? 'border-2 border-accent bg-accent-soft'
                      : 'border border-line bg-white hover:border-line-strong'
                  }`}
                >
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="text-[16px] font-semibold text-ink">{option.title}</span>
                    <span className="text-[14px] text-secondary">{option.description}</span>
                  </span>
                  <input
                    type="radio"
                    name="running-level"
                    value={option.value}
                    checked={selected}
                    onChange={() => setLevel(option.value)}
                    aria-label={option.title}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={`flex size-[22px] shrink-0 items-center justify-center rounded-full ${
                      selected ? 'bg-accent' : 'border border-line-strong bg-white'
                    }`}
                  >
                    {selected ? <span className="size-[8px] rounded-full bg-white" /> : null}
                  </span>
                </label>
              );
            })}
          </fieldset>
          {finishError && (
            <p role="alert" className="mt-[18px] w-full text-[13.5px] text-accent-pressed">
              {finishError}
              {/* "Start from the beginning" needs a road there: this screen's
                  only other exit is Back, which stops one step short of the
                  form that can fix missing first-step details. */}
              {finishError.includes('first step') && (
                <>
                  {' '}
                  <Link
                    href={ROUTES.welcome}
                    className="font-semibold underline underline-offset-2"
                  >
                    Go to the first step
                  </Link>
                </>
              )}
            </p>
          )}
          <div className="mt-[30px] flex w-full items-center justify-between">
            <button
              type="button"
              onClick={() => router.push(ROUTES.setupGoal)}
              className="rounded-[14px] border border-line-strong bg-white px-7 py-4 text-[16px] font-semibold text-ink hover:bg-muted"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void handleFinish()}
              disabled={finishing}
              className="flex items-center justify-center gap-[9px] rounded-[14px] bg-accent px-7 py-4 font-semibold text-white hover:bg-accent-pressed disabled:opacity-60"
            >
              <span className="text-[16px]">{finishing ? 'Finishing…' : 'Finish setup'}</span>
              <span aria-hidden className="text-[17px]">
                →
              </span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

'use client';

import { useState } from 'react';
import Badge from '@/components/Badge';
import Brand from '@/components/Brand';
import StepDots from '@/components/StepDots';
import { clampGoal, GOAL_DEFAULT_KM, GOAL_MAX_KM, GOAL_MIN_KM } from '@/lib/goal';
import { useProfile } from '@/lib/onboarding';

// 02 · Setup - Weekly goal (Figma node 5:2). Stepper and slider edit the same
// clamped value; dates and step navigation arrive with RUN-10.
export default function WeeklyGoalPage() {
  const profile = useProfile();
  const [km, setKm] = useState(GOAL_DEFAULT_KM);

  return (
    <main className="flex flex-1 flex-col bg-canvas">
      <header className="px-6 pt-[30px] md:px-12">
        <Brand />
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-6 pt-5 pb-16 md:px-12">
        <div className="flex w-full max-w-[600px] flex-col items-center">
          <StepDots step={1} label="Step 1 of 2" />
          <div className="mt-[26px]">
            <Badge>{profile ? `Welcome, ${profile.firstName}` : 'Welcome'}</Badge>
          </div>
          <h1 className="mt-[22px] text-center font-display text-[32px] leading-[1.08] font-bold tracking-[-0.8px] text-ink md:text-[40px]">
            How far do you want
            <br />
            to run each week?
          </h1>
          <p className="mt-[14px] max-w-[460px] text-center text-[15px] leading-[1.55] text-secondary">
            Set a weekly distance target. Run Log tracks your progress against it and your AI Coach
            adapts as you go. You can change this anytime.
          </p>
          <div className="mt-[34px] flex w-full flex-col rounded-[22px] border border-line bg-white px-6 py-7 md:px-10 md:py-[38px]">
            <div className="flex w-full flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-0">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[56px] font-bold tracking-[-2.4px] text-ink md:text-[80px]">
                  {km}
                </span>
                <span className="text-[19px] font-medium text-secondary">km / week</span>
              </div>
              <div className="flex gap-[10px]">
                <button
                  type="button"
                  aria-label="Decrease weekly goal"
                  onClick={() => setKm((value) => clampGoal(value - 1))}
                  className="flex size-[54px] items-center justify-center rounded-[15px] border border-line-strong bg-white text-[26px] text-ink hover:bg-muted"
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="Increase weekly goal"
                  onClick={() => setKm((value) => clampGoal(value + 1))}
                  className="flex size-[54px] items-center justify-center rounded-[15px] border border-line-strong bg-white text-[26px] text-ink hover:bg-muted"
                >
                  +
                </button>
              </div>
            </div>
            <input
              type="range"
              aria-label="Weekly goal in kilometres"
              min={GOAL_MIN_KM}
              max={GOAL_MAX_KM}
              step={1}
              value={km}
              onChange={(event) => setKm(clampGoal(Number(event.target.value)))}
              className="mt-[26px] h-2 w-full cursor-pointer accent-accent"
            />
            <div className="mt-2 flex w-full justify-between text-[13px] text-tertiary">
              <span>0 km</span>
              <span>30 km</span>
              <span>60 km</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

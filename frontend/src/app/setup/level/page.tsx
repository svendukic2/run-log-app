'use client';

import Badge from '@/components/Badge';
import Brand from '@/components/Brand';
import StepDots from '@/components/StepDots';

// 03 · Setup - Running level. Placeholder shell reached from step 02; the
// level option cards and step navigation arrive with RUN-11.
export default function RunningLevelPage() {
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
        </div>
      </div>
    </main>
  );
}

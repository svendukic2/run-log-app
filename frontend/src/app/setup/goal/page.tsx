'use client';

import Badge from '@/components/Badge';
import Brand from '@/components/Brand';
import { useProfile } from '@/lib/onboarding';

// 02 · Setup - Weekly goal. Placeholder shell: the goal controls arrive with
// RUN-9/RUN-10; this step already greets the user by first name (RUN-8).
export default function WeeklyGoalPage() {
  const profile = useProfile();

  return (
    <main className="flex flex-1 flex-col bg-canvas">
      <header className="px-6 pt-[30px] md:px-12">
        <Brand />
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-6 pt-5 pb-16 md:px-12">
        <div className="flex w-full max-w-[600px] flex-col items-center">
          <Badge>{profile ? `Welcome, ${profile.firstName}` : 'Welcome'}</Badge>
        </div>
      </div>
    </main>
  );
}

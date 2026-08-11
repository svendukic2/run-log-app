'use client';

import { useState } from 'react';
import { useAccount } from '@/lib/account';
import { greetingForHour } from '@/lib/greeting';
import { useHydrated } from '@/lib/useHydrated';

// The dashboard overline: "Good morning, Marko" (DSH-2), varying with the
// visitor's time of day (RUN-16). The server's clock and time zone are not the
// visitor's, so nothing renders until hydration; PageHeader reserves the
// overline's line so the title does not shift while that happens.
export default function DashboardGreeting() {
  const hydrated = useHydrated();
  // The account, not the profile: the name is the account's since RUN-59, so
  // the greeting works before setup finishes too.
  const account = useAccount();
  // Read once per mount rather than in the render body: the render stays pure,
  // and navigating back to the Dashboard remounts it, which is when a fresher
  // greeting matters.
  const [hour] = useState(() => new Date().getHours());

  if (!hydrated) return null;

  const greeting = greetingForHour(hour);
  // No account record yet means the identity is still loading; the greeting
  // simply drops the name rather than inventing one.
  return <>{account ? `${greeting}, ${account.firstName}` : greeting}</>;
}

'use client';

import { useState } from 'react';
import { greetingForHour } from '@/lib/greeting';
import { useProfile } from '@/lib/onboarding';
import { useHydrated } from '@/lib/useHydrated';

// The dashboard overline: "Good morning, Marko" (DSH-2), varying with the
// visitor's time of day (RUN-16). The server's clock and time zone are not the
// visitor's, so nothing renders until hydration; PageHeader reserves the
// overline's line so the title does not shift while that happens.
export default function DashboardGreeting() {
  const hydrated = useHydrated();
  const profile = useProfile();
  // Read once per mount rather than in the render body: the render stays pure,
  // and navigating back to the Dashboard remounts it, which is when a fresher
  // greeting matters.
  const [hour] = useState(() => new Date().getHours());

  if (!hydrated) return null;

  const greeting = greetingForHour(hour);
  // No profile happens only when /dashboard is opened directly before
  // onboarding; the greeting simply drops the name rather than inventing one.
  return <>{profile ? `${greeting}, ${profile.firstName}` : greeting}</>;
}

'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AppDataBoundary from '@/components/AppDataBoundary';
import { useLandingRoute } from '@/lib/onboarding';

// The app's front door is a pure ROUTER since RUN-58: the v1 Welcome form
// is gone (names and email moved to Sign up), so "/" only decides where the
// visitor belongs - Sign in when signed out, the Dashboard once onboarding
// is finished, the setup steps otherwise - and renders nothing itself.
function LandingContent() {
  const router = useRouter();
  const landing = useLandingRoute();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (hasNavigated.current || !landing) return;
    hasNavigated.current = true;
    router.replace(landing);
  }, [landing, router]);

  return null;
}

// The landing decision needs the profile store settled (finished vs
// unfinished onboarding is server state), so the page renders through the
// app-data boundary like every store-reading screen. For a signed-out
// visitor the route is known synchronously and no store loads.
export default function LandingPage() {
  return (
    <AppDataBoundary>
      <LandingContent />
    </AppDataBoundary>
  );
}

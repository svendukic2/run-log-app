'use client';

import { useEffect, useState } from 'react';
import { todayIso } from '@/lib/runs';

// Today's ISO date as state, not a render-body clock read: it seeds once on
// mount and refreshes when the user returns to a tab left open across
// midnight, so week-scoped cards never keep reporting last week's numbers
// against this week's goal.
export function useToday(): string {
  const [today, setToday] = useState(() => todayIso());

  useEffect(() => {
    const refresh = () => setToday(todayIso());
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return today;
}

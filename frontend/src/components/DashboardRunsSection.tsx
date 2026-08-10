'use client';

import DistanceChartCard from '@/components/DistanceChartCard';
import FirstRunPrompt from '@/components/FirstRunPrompt';
import RecentRunsCard from '@/components/RecentRunsCard';
import { useRuns } from '@/lib/runs';
import { useHydrated } from '@/lib/useHydrated';

// Switches the dashboard's main area between the first-run prompt (04, RUN-18)
// and the logged-runs content (05). Reading the runs store here means saving
// the first run swaps the prompt out immediately (AC3).
export default function DashboardRunsSection() {
  const hydrated = useHydrated();
  const runs = useRuns();

  // The server and the hydration pass cannot see localStorage, so until the
  // store has actually been read the shell stays neutral: a returning user
  // with months of runs must not get "Log your first run" flashed at them.
  if (!hydrated) return null;

  if (runs.length === 0) return <FirstRunPrompt />;

  // 05's left column: the distance chart above the recent runs card. The
  // parent flex column provides the gap between them.
  return (
    <>
      <DistanceChartCard />
      <RecentRunsCard />
    </>
  );
}

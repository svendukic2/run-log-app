import AddRunButton from '@/components/AddRunButton';
import DashboardGreeting from '@/components/DashboardGreeting';
import PageHeader from '@/components/PageHeader';
import RunList from '@/components/RunList';
import WeeklyGoalCard from '@/components/WeeklyGoalCard';

// 05 · Dashboard. The header is rendered by the page itself, above the body, so
// the empty (04) and filled (05) states cannot render different headers between
// them (RUN-15 AC3). This is the default view the app opens on once onboarding
// is done.
export default function DashboardPage() {
  return (
    <>
      <PageHeader overline={<DashboardGreeting />} title="Dashboard" action={<AddRunButton />} />

      <div
        data-testid="dashboard-body"
        className="flex flex-col gap-5 px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]"
      >
        <WeeklyGoalCard />
        {/* Provisional stand-ins for the chart and recent runs (RUN-19,
            RUN-20) and the first-run prompt (RUN-18): they read the store the
            Add run modal writes to, so a saved run shows up here immediately
            (RUN-23 AC2, AC6). */}
        <RunList
          title="Recent runs"
          emptyMessage="No runs logged yet. Add your first one to get started."
          limit={5}
        />
      </div>
    </>
  );
}

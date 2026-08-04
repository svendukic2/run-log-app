import AddRunButton from '@/components/AddRunButton';
import CoachTeaserCard from '@/components/CoachTeaserCard';
import DashboardGreeting from '@/components/DashboardGreeting';
import DashboardRunsSection from '@/components/DashboardRunsSection';
import PageHeader from '@/components/PageHeader';
import WeeklyGoalCard from '@/components/WeeklyGoalCard';

// 05 · Dashboard. The header is rendered by the page itself, above the body, so
// the empty (04) and filled (05) states cannot render different headers between
// them (RUN-15 AC3). This is the default view the app opens on once onboarding
// is done.
export default function DashboardPage() {
  return (
    <>
      <PageHeader overline={<DashboardGreeting />} title="Dashboard" action={<AddRunButton />} />

      {/* 04/05 use the same two-column shape: main content left, the coach
          card right, stacking on narrow screens. The right column renders in
          both dashboard states. */}
      <div
        data-testid="dashboard-body"
        className="grid items-start gap-5 px-5 pb-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-[40px] lg:pb-[32px]"
      >
        <div className="flex min-w-0 flex-col gap-5">
          <WeeklyGoalCard />
          <DashboardRunsSection />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <CoachTeaserCard />
        </div>
      </div>
    </>
  );
}

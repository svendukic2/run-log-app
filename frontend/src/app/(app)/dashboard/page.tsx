import AddRunButton from '@/components/AddRunButton';
import PageHeader from '@/components/PageHeader';

// 05 · Dashboard. The header is rendered by the page itself, above the body, so
// the empty (04) and filled (05) states cannot render different headers between
// them (RUN-15 AC3). This is the default view the app opens on once onboarding
// is done.
export default function DashboardPage() {
  return (
    <>
      <PageHeader
        // Static designed copy for now: the time-of-day variants and the real
        // first name arrive with RUN-16.
        overline="Good morning, Marko"
        title="Dashboard"
        action={<AddRunButton />}
      />

      <div data-testid="dashboard-body" className="px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]">
        {/* Weekly goal card, chart and recent runs (RUN-17, RUN-19, RUN-20) or
            the first-run prompt (RUN-18) render here. */}
      </div>
    </>
  );
}

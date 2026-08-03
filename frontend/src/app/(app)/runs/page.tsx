import AddRunButton from '@/components/AddRunButton';
import PageHeader from '@/components/PageHeader';
import RunsView from '@/components/RunsView';

// 07 · Runs. The topbar matches the Dashboard's, down to the Add run action
// (design node 67:104), which makes this the second designed entry point into
// the Add run modal (RUN-23 AC1, RUN-24 AC1). Underneath, the tabbed, sortable
// runs table (RUN-24); the record cards (RUN-26), the designed empty state
// (RUN-25), run detail (RUN-27) and the row menu (RUN-29) plug into it later.
export default function RunsPage() {
  return (
    <>
      <PageHeader overline="Your activity" title="Runs" action={<AddRunButton />} />

      <div className="px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]">
        <RunsView />
      </div>
    </>
  );
}

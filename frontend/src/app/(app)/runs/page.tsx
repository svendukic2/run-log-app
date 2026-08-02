import AddRunButton from '@/components/AddRunButton';
import PageHeader from '@/components/PageHeader';
import RunList from '@/components/RunList';

// 07 · Runs. The topbar matches the Dashboard's, down to the Add run action
// (design node 67:104), which makes this the second designed entry point into
// the Add run modal (RUN-23 AC1). The sortable, filterable table underneath
// arrives with RUN-24; until then the runs are simply listed.
export default function RunsPage() {
  return (
    <>
      <PageHeader overline="Your activity" title="Runs" action={<AddRunButton />} />

      <div className="px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]">
        <RunList title="All runs" emptyMessage="No runs logged yet. Add your first one above." />
      </div>
    </>
  );
}

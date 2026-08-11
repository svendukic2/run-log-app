import CreateEventButton from '@/components/CreateEventButton';
import EventsBoundary from '@/components/EventsBoundary';
import EventsView from '@/components/EventsView';
import PageHeader from '@/components/PageHeader';

// V2 · Community - Events (RUN-68). The topbar matches the Dashboard's, with
// "Create event" as the primary action (AC3's entry point); underneath, the
// cards grouped by derived state (AC1) or the designed empty state (AC4).
export default function EventsPage() {
  return (
    <>
      <PageHeader overline="Community" title="Events" action={<CreateEventButton />} />

      {/* One screen-level gate for the events store: the grouped grid and
          the empty state wait for the same load. */}
      <EventsBoundary>
        <div className="px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]">
          <EventsView />
        </div>
      </EventsBoundary>
    </>
  );
}

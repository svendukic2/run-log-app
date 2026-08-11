import EventDetailView from '@/components/EventDetailView';
import EventsBoundary from '@/components/EventsBoundary';

// Event detail (thin first cut, RUN-68 AC5; the designed page with
// participants and leaderboard is RUN-69). The event lives behind the API,
// so this server shell only unwraps the id; the boundary keeps "event not
// found" honest while the store is still loading (the run detail
// construction).
export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <EventsBoundary>
      <EventDetailView eventId={id} />
    </EventsBoundary>
  );
}

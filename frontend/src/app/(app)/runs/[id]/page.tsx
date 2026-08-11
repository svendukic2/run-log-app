import RunDetailView from '@/components/RunDetailView';
import RunsBoundary from '@/components/RunsBoundary';

// 09 · Run detail (RUN-27). The run lives behind the API (RUN-48), so this
// server shell only unwraps the id; everything visible renders client-side.
// The boundary keeps "run not found" honest: without it the view would
// declare a perfectly real run missing while the store is still loading.
export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RunsBoundary>
      <RunDetailView runId={id} />
    </RunsBoundary>
  );
}

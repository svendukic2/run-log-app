import RunDetailView from '@/components/RunDetailView';

// 09 · Run detail (RUN-27). Runs live in the device's localStorage, so the
// server knows nothing about any id: the page only unwraps the route param and
// hands it to the client view, which looks the run up in the store.
export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunDetailView runId={id} />;
}

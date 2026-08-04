import RunDetailView from '@/components/RunDetailView';

// 09 · Run detail (RUN-27). The run itself lives in localStorage, so this
// server shell only unwraps the id; everything visible renders client-side.
export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunDetailView runId={id} />;
}

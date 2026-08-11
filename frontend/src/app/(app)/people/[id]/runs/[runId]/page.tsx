import PublicRunDetailView from '@/components/PublicRunDetailView';

// A read-only run detail on someone's public profile (RUN-63 AC4). Nested
// under the profile because the run is only readable through it: the run
// comes from the profile's own payload, so the same server-side privacy
// gate covers both and there is no second endpoint to forget it on.
export default async function PersonRunPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  return <PublicRunDetailView userId={id} runId={runId} />;
}

import PublicProfileView from '@/components/PublicProfileView';

// One runner's public profile (RUN-63), replacing the RUN-69 placeholder
// wholesale. The profile lives behind GET /api/users/:id, so this server
// shell only unwraps the id; everything visible renders client-side.
//
// No AppDataBoundary here, unlike the dashboard: this page reads someone
// ELSE'S data from its own per-entity store, so its loading, not-found and
// error states belong to the view itself (the event detail construction).
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicProfileView userId={id} />;
}

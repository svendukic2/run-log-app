import LeaderboardView from '@/components/LeaderboardView';
import PageHeader from '@/components/PageHeader';

// V2 · Community - Leaderboard (RUN-70). The topbar matches the rest of the
// shell; underneath, the week switcher and the ranked rows.
//
// No screen-level boundary here, unlike the Events page: the board is
// per-week data from its own store (leaderboard.ts), so its loading and
// error states live inside the card that owns them - the same arrangement
// the event detail page uses for its per-event lists.
//
// The sidebar has no link to this page yet: RUN-62 owns the COMMUNITY
// section and adds it there. Until then the page is reached by URL.
export default function LeaderboardPage() {
  return (
    <>
      <PageHeader overline="Community" title="Leaderboard" />
      <LeaderboardView />
    </>
  );
}

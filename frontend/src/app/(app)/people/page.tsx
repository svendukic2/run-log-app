import PageHeader from '@/components/PageHeader';
import PeopleView from '@/components/PeopleView';

// V2 · Community - People (RUN-62). The topbar matches the rest of the
// shell; underneath, the search box, my follow counts and the result rows.
//
// No screen-level AppDataBoundary here, like the Leaderboard page and
// unlike the Dashboard: the search is per-query data from its own store
// (userSearch.ts), so its loading and error states live in the card that
// owns them.
export default function PeoplePage() {
  return (
    <>
      <PageHeader overline="Community" title="People" />
      <PeopleView />
    </>
  );
}

'use client';

import DistanceChartCard from '@/components/DistanceChartCard';
import FollowButton from '@/components/FollowButton';
import PersonalRecordsCard from '@/components/PersonalRecordsCard';
import {
  PROFILE_PAGE,
  ProfileLoadError,
  ProfileLoading,
  ProfileNotFound,
} from '@/components/publicProfileStates';
import RecentRunsCard from '@/components/RecentRunsCard';
import { CARD } from '@/components/runDetailParts';
import { initialsOf } from '@/lib/eventMath';
import { usePublicProfile, type PublicProfile } from '@/lib/publicProfile';
import { personRunRoute } from '@/lib/routes';

// One runner's public profile (RUN-63, Figma "V2 - Public profile"): header
// with initials avatar, name, follow button and counts, then their records,
// weekly distance and recent runs, rendered by the very same v1 dashboard
// cards, given this runner's runs instead of the store's.
//
// READ ONLY, and structurally so: no AddRunButton, no RunRowMenu, no edit or
// delete anywhere on this page or on the run detail it opens. There is
// nothing to disable, because nothing that writes is mounted.
//
// Everything below the header is gated on the SERVER (backend/src/users):
// a private profile's response carries no runs at all, so `visible` here is
// a rendering decision about an answer already made, never the gate itself.
export default function PublicProfileView({ userId }: { userId: string }) {
  const { status, profile, error } = usePublicProfile(userId);

  // Every non-content status is answered before anything reads `profile`,
  // so a load that failed can never be mistaken for a runner who is not
  // there (the states themselves live in publicProfileStates.tsx).
  if (status === 'loading') return <ProfileLoading />;
  if (status === 'missing') return <ProfileNotFound />;
  if (status === 'error' || !profile) {
    return <ProfileLoadError userId={userId} error={error} />;
  }

  return (
    <div className={PROFILE_PAGE}>
      <ProfileHeader profile={profile} />
      <ProfileBody profile={profile} />
    </div>
  );
}

// Always rendered, on a public and a private profile alike (AC2): the name,
// the initials avatar, both follow counts and a working follow button.
function ProfileHeader({ profile }: { profile: PublicProfile }) {
  const { followers, following } = profile.counts;

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-center gap-4">
        <span
          aria-hidden="true"
          className="grid size-[58px] shrink-0 place-items-center rounded-full bg-accent-soft font-display text-[20px] font-bold text-accent"
        >
          {initialsOf(profile.firstName, profile.lastName)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[24px] font-bold tracking-[-0.6px] text-text-primary lg:text-[28px]">
            {profile.firstName} {profile.lastName}
            {profile.me && (
              <span className="pl-3 align-middle text-[13px] font-semibold text-accent-pressed">
                You
              </span>
            )}
          </h1>
          <p className="pt-[4px] text-[13.5px] text-secondary">
            {formatCount(followers, 'follower')} · {following} following
          </p>
        </div>
      </div>
      <FollowButton profile={profile} />
    </header>
  );
}

// Everything the privacy setting decides. `visible: false` is not "no
// runs": the server sent nothing below the header, so there is nothing here
// to reveal.
function ProfileBody({ profile }: { profile: PublicProfile }) {
  if (!profile.visible) {
    return (
      <section className={`${CARD} flex flex-col items-start gap-[10px] p-[28px]`}>
        <h2 className="font-display text-[19px] font-bold tracking-[-0.3px] text-text-primary">
          This profile is private
        </h2>
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          {profile.firstName} keeps their records, weekly distance and runs to themselves. You can
          still follow them.
        </p>
      </section>
    );
  }

  const runs = profile.runs ?? [];

  // A public profile with nothing logged gets one honest line rather than
  // three empty cards, each of which would otherwise address the reader in
  // the second person about someone else's running.
  if (runs.length === 0) {
    return (
      <section className={`${CARD} flex flex-col items-start gap-[10px] p-[28px]`}>
        <h2 className="font-display text-[19px] font-bold tracking-[-0.3px] text-text-primary">
          No runs yet
        </h2>
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          {profile.firstName} hasn&apos;t logged a run yet. Their records and weekly distance show
          up here once they do.
        </p>
      </section>
    );
  }

  // The dashboard's two-column shape, stacking on narrow screens: chart and
  // recent runs left, records right.
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <DistanceChartCard runs={runs} />
        {/* Rows open the read-only run detail (AC4); there is no "all runs"
            screen for another runner, so the card's "View all" is dropped. */}
        <RecentRunsCard
          runs={runs}
          runHref={(runId) => personRunRoute(profile.id, runId)}
          viewAllHref={null}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <PersonalRecordsCard runs={runs} title="Records" />
      </div>
    </div>
  );
}

function formatCount(value: number, noun: string): string {
  return `${value} ${value === 1 ? noun : `${noun}s`}`;
}

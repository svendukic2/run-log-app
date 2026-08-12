'use client';

import Link from 'next/link';
import {
  PROFILE_PAGE,
  ProfileLoadError,
  ProfileLoading,
  ProfileNotFound,
} from '@/components/publicProfileStates';
import { CARD, RouteSketch, StatCard } from '@/components/runDetailParts';
import { usePublicProfile } from '@/lib/publicProfile';
import { personRoute } from '@/lib/routes';
import { EFFORT_CHIP, formatDate, formatDistanceKm, formatDuration, formatPace } from '@/lib/runs';

// One run on someone else's public profile (RUN-63 AC4). The same page as
// 09 · Run detail minus every write: no Edit, no Delete, no modals, and not
// a disabled version of them either - the buttons and the components behind
// them are simply not mounted here. That is why this is its own view rather
// than a readOnly flag on RunDetailView: a flag is one bad merge away from
// putting Delete on a stranger's run.
//
// The run comes from the profile's own payload, not a second endpoint, so
// it inherits that response's privacy gate for free: a private profile
// carries no runs, so there is no run here to find. The Route card is gated
// once more by showRoutes (route maps themselves are RUN-72; the decorative
// sketch stands in for one until then).
export default function PublicRunDetailView({ userId, runId }: { userId: string; runId: string }) {
  const { status, profile, error } = usePublicProfile(userId);

  // Every non-content status first (review fix): without this a timeout or
  // a 5xx fell through to the "isn't available" copy below and told the
  // reader a perfectly real run had been deleted, with no way to retry.
  if (status === 'loading') return <ProfileLoading />;
  if (status === 'missing') return <ProfileNotFound />;
  if (status === 'error' || !profile) {
    return <ProfileLoadError userId={userId} error={error} />;
  }

  const run = profile.runs?.find((candidate) => candidate.id === runId);
  // Now genuinely one of two things: the run was deleted, or this profile is
  // private and carried no runs at all.
  if (!run) {
    return (
      <div className={PROFILE_PAGE}>
        <section className={`${CARD} flex flex-col items-start gap-[10px] p-[28px]`}>
          <h1 className="font-display text-[19px] font-bold tracking-[-0.3px] text-text-primary">
            This run isn&apos;t available
          </h1>
          <p className="text-[13.5px] leading-[1.55] text-secondary">
            It may have been deleted, or this profile may not be shared with you.
          </p>
          <Link
            href={personRoute(userId)}
            className="mt-[6px] text-[14px] font-semibold text-accent hover:text-accent-pressed"
          >
            ← Back to the profile
          </Link>
        </section>
      </div>
    );
  }

  const details: Array<{ label: string; value: string }> = [
    { label: 'Route name', value: run.routeName },
    { label: 'Date', value: formatDate(run.date) },
    { label: 'Effort', value: run.effort },
    { label: 'Logged', value: 'Manual entry' },
  ];

  return (
    <div className={PROFILE_PAGE}>
      <header className="flex flex-col gap-[10px]">
        <Link
          href={personRoute(userId)}
          className="flex items-center gap-[8px] self-start text-[13px] text-tertiary hover:text-secondary"
        >
          <span aria-hidden="true">←</span>
          {`${profile.firstName} ${profile.lastName}`}
        </Link>

        {/* Same free-text guard as the owner's run detail (RUN-75, AC2). No
            min-w-0 here: this heading is a column-axis child, where the
            automatic minimum size is already 0. */}
        <h1 className="font-display text-[28px] font-bold tracking-[-0.6px] break-words text-text-primary lg:text-[30px]">
          {run.routeName}
        </h1>

        <p
          data-testid="run-detail-caption"
          className="flex items-center gap-[12px] text-[14px] text-secondary"
        >
          {formatDate(run.date)}
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-[12px] py-[5px] text-[12.5px] font-semibold ${EFFORT_CHIP[run.effort]}`}
          >
            {run.effort} effort
          </span>
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Distance" value={formatDistanceKm(run.distanceKm)} />
        <StatCard label="Duration" value={formatDuration(run.durationSeconds)} />
        <StatCard label="Avg pace" value={formatPace(run)} />
        {/* Elevation is display-only and never captured (A10). */}
        <StatCard
          label="Elevation"
          value={
            <>
              <span aria-hidden="true">–</span>
              <span className="sr-only">Not captured</span>
            </>
          }
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* showRoutes off means no Route card at all, not a blurred one:
            the response carries no route data either way (RUN-72 adds the
            real maps and the data behind them). */}
        {profile.showRoutes && (
          <section aria-labelledby="route-title" className={CARD}>
            <div className="border-b border-line px-[28px] py-[20px]">
              <h2
                id="route-title"
                className="font-display text-[17px] font-bold tracking-[-0.2px] text-text-primary"
              >
                Route
              </h2>
            </div>
            <div className="p-[6px]">
              <div className="rounded-[14px] bg-muted px-6 py-10">
                <RouteSketch />
              </div>
            </div>
          </section>
        )}

        <div className="flex flex-col gap-5">
          {/* A run without a note shows no Note card at all (A11); a
              whitespace-only note counts as none. */}
          {run.note?.trim() ? (
            <section aria-labelledby="note-title" className={`${CARD} px-[24px] py-[22px]`}>
              <h2
                id="note-title"
                className="font-display text-[17px] font-bold tracking-[-0.2px] text-text-primary"
              >
                Note
              </h2>
              <p className="mt-[10px] text-[14px] leading-[1.6] whitespace-pre-line text-secondary">
                {run.note}
              </p>
            </section>
          ) : null}

          <section aria-label="Details" className={`${CARD} px-[24px] py-[6px]`}>
            <dl>
              {details.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 border-b border-line py-[14px] last:border-b-0"
                >
                  <dt className="text-[14px] text-secondary">{row.label}</dt>
                  <dd className="min-w-0 text-[14px] font-semibold break-words text-text-primary">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

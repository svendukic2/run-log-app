'use client';

import Link from 'next/link';
import { CARD } from '@/components/runDetailParts';
import { reloadPublicProfile } from '@/lib/publicProfile';
import { ROUTES } from '@/lib/routes';

// The three non-content states of a public profile read (RUN-63), shared by
// the profile itself and by the read-only run detail reached from it.
// Extracted in the review: the run detail originally handled only 'loading',
// so a timeout or a 5xx fell through to its "this run isn't available" copy
// and told the reader a perfectly real run had been deleted.
//
// Anything reading the profile store must therefore branch on all three of
// these before it looks inside `profile`.

export const PROFILE_PAGE =
  'flex flex-col gap-5 px-5 pt-6 pb-6 sm:px-8 lg:px-[40px] lg:pt-[32px] lg:pb-[32px]';

// The load is in flight. A line rather than nothing: the store's read is
// bounded by apiFetch's 8s timeout, and a blank page for that long reads as
// a broken app. Same treatment the event detail's cards give their own
// per-entity read; the 250ms-then-spinner dance belongs to AppDataBoundary,
// which gates the signed-in user's own app-wide stores, not this one.
export function ProfileLoading() {
  return (
    <div className={PROFILE_PAGE}>
      <p role="status" className="px-[10px] py-[6px] text-[13.5px] text-secondary">
        Loading profile…
      </p>
    </div>
  );
}

// The id matches no account (AC5): a stale link or a deleted account.
export function ProfileNotFound() {
  return (
    <div className={PROFILE_PAGE}>
      <section className={`${CARD} flex flex-col items-start gap-[10px] p-[28px]`}>
        <h1 className="font-display text-[19px] font-bold tracking-[-0.3px] text-text-primary">
          This runner doesn&apos;t exist
        </h1>
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          The link may be out of date, or the account may have been deleted.
        </p>
        <Link
          href={ROUTES.events}
          className="mt-[6px] text-[14px] font-semibold text-accent hover:text-accent-pressed"
        >
          ← Back to events
        </Link>
      </section>
    </div>
  );
}

// The read failed (network, timeout, 5xx). Retryable, so it offers a retry -
// which is exactly what distinguishes it from the not-found state above.
export function ProfileLoadError({ userId, error }: { userId: string; error: string | null }) {
  return (
    <div className={PROFILE_PAGE}>
      <section
        role="alert"
        className={`${CARD} flex flex-col items-start gap-[10px] px-[24px] py-[22px]`}
      >
        <h1 className="font-display text-[16px] font-bold tracking-[-0.3px] text-text-primary">
          This profile didn&apos;t load
        </h1>
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          {error ?? 'Something went wrong loading this profile.'}
        </p>
        <button
          type="button"
          onClick={() => reloadPublicProfile(userId)}
          className="mt-[6px] rounded-[12px] bg-accent px-[22px] py-[11px] text-[14px] font-semibold text-white hover:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Try again
        </button>
      </section>
    </div>
  );
}

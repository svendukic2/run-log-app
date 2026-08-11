'use client';

import { useState } from 'react';
import { setFollowing, type PublicProfile } from '@/lib/publicProfile';
import { mutationErrorMessage } from '@/lib/session';

// The Follow / Following toggle on a public profile header (RUN-63), built
// on the RUN-61 follow API. Same rules as JoinEventButton, which is the
// app's other membership toggle: the round trip is awaited, a second click
// while it runs is ignored, and a failure lands inline as role="alert"
// rather than as a silently reverted button.
//
// Renders on a PRIVATE profile too (AC2): following someone is not reading
// their data, so the one action a gated profile still offers is this one.
// Renders nothing on your own profile - the follow endpoint rejects
// following yourself, so there is no action to offer.
export default function FollowButton({ profile }: { profile: PublicProfile }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profile.me) return null;

  const toggleFollow = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setFollowing(profile.id, !profile.following);
      // The mutation patched the cache, so this component re-renders with
      // the flipped state and the fresh follower count.
      setBusy(false);
    } catch (cause) {
      setBusy(false);
      setError(mutationErrorMessage(cause));
    }
  };

  return (
    <div className="flex flex-col items-start gap-[2px] sm:items-end sm:text-right">
      <button
        type="button"
        onClick={toggleFollow}
        disabled={busy}
        className={`shrink-0 rounded-full px-[20px] py-[9px] text-[13.5px] font-semibold disabled:cursor-default disabled:opacity-60 ${
          profile.following
            ? 'border border-line-strong bg-white text-text-primary hover:bg-muted'
            : 'bg-accent text-white hover:bg-accent-pressed'
        }`}
      >
        {busy ? 'Saving…' : profile.following ? 'Following' : 'Follow'}
      </button>

      {error && (
        <p role="alert" className="pt-[6px] text-[12.5px] leading-[1.5] text-accent-pressed">
          {error}
        </p>
      )}
    </div>
  );
}

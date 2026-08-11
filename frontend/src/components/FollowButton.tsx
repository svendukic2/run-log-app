'use client';

import { useState } from 'react';
import { mutationErrorMessage } from '@/lib/session';

// Everything this button needs to know about who it follows. Structural, so
// a PublicProfile (RUN-63) and a search row (RUN-62) both satisfy it without
// either store having to shape itself around the other.
export interface FollowTarget {
  id: string;
  following: boolean;
  // Your own row, which offers no action. Absent means "not you": search
  // results exclude the caller server-side, so those rows never set it.
  me?: boolean;
}

interface FollowButtonProps {
  target: FollowTarget;
  // The STORE's mutation: it calls the follow API and patches its own
  // cache, which is the only part that differs between callers. Passed in
  // rather than imported so this component belongs to no single store.
  setFollowing: (userId: string, next: boolean) => Promise<void>;
  // 'row' is the smaller pill the People rows use, where the button sits at
  // the end of a line of text rather than beside a page heading.
  size?: 'page' | 'row';
  className?: string;
}

// The Follow / Following toggle, built on the RUN-61 follow API. Born on the
// public profile header (RUN-63) and generalized by RUN-62 when the People
// rows needed the same button with the same rules: the round trip is
// awaited, a second click while it runs is ignored, and a failure lands
// inline as role="alert" rather than as a silently reverted button.
//
// Renders on a PRIVATE profile too (RUN-63 AC2): following someone is not
// reading their data, so the one action a gated profile still offers is
// this one. Renders nothing on your own row - the follow endpoint rejects
// following yourself, so there is no action to offer.
//
// `relative z-10` like JoinEventButton, and for the same reason: inside a
// People row the whole row is a stretched link, and the button has to sit
// above that overlay so following someone never also navigates (AC5).
export default function FollowButton({
  target,
  setFollowing,
  size = 'page',
  className,
}: FollowButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (target.me) return null;

  const toggleFollow = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setFollowing(target.id, !target.following);
      // The mutation patched its store, so this component re-renders with
      // the flipped state and the fresh counts.
      setBusy(false);
    } catch (cause) {
      setBusy(false);
      setError(mutationErrorMessage(cause));
    }
  };

  return (
    <div
      className={
        className ?? 'flex min-w-0 flex-col items-start gap-[2px] sm:items-end sm:text-right'
      }
    >
      <button
        type="button"
        onClick={toggleFollow}
        disabled={busy}
        className={`relative z-10 shrink-0 rounded-full font-semibold disabled:cursor-default disabled:opacity-60 ${
          size === 'row' ? 'px-[16px] py-[7px] text-[12.5px]' : 'px-[20px] py-[9px] text-[13.5px]'
        } ${
          target.following
            ? 'border border-line-strong bg-white text-text-primary hover:bg-muted'
            : 'bg-accent text-white hover:bg-accent-pressed'
        }`}
      >
        {busy ? 'Saving…' : target.following ? 'Following' : 'Follow'}
      </button>

      {error && (
        <p role="alert" className="pt-[6px] text-[12.5px] leading-[1.5] text-accent-pressed">
          {error}
        </p>
      )}
    </div>
  );
}

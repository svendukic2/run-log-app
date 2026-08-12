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
  // the end of a line of text rather than beside a page heading. It carries
  // its own wrapper layout rather than taking a className beside it (review
  // fix): two knobs shaping one element is how the failure line ended up
  // under the row's link overlay instead of above it.
  size?: 'page' | 'row';
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
// above that overlay so following someone never also navigates (AC5). The
// 'row' WRAPPER carries it too, so the failure line below the button is
// above the overlay as well - clicking an error message must not navigate.
export default function FollowButton({ target, setFollowing, size = 'page' }: FollowButtonProps) {
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

  // 'row' also caps its width, so a wrapped failure sentence cannot squeeze
  // the name column off a phone screen.
  const wrapper =
    size === 'row'
      ? 'relative z-10 flex min-w-0 max-w-[45%] flex-col items-end gap-[2px] text-right'
      : 'flex min-w-0 flex-col items-start gap-[2px] sm:items-end sm:text-right';

  return (
    <div className={wrapper}>
      <button
        type="button"
        onClick={toggleFollow}
        disabled={busy}
        // Drawn ~33px ('row') and ~38px ('page') tall, both under the 44px
        // minimum, so a pseudo-element grows the hit area vertically to 44+.
        // Vertically only: the pill is already wider than 44px, and on the
        // People row it sits beside a stretched profile link that a sideways
        // expansion would eat into (RUN-75 AC3, the RUN-64 pattern), on
        // touch only: ungated it would enlarge :hover on a mouse as well.
        className={`relative z-10 shrink-0 rounded-full font-semibold pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:content-[''] disabled:cursor-default disabled:opacity-60 ${
          size === 'row'
            ? 'px-[16px] py-[7px] text-[12.5px] pointer-coarse:before:-inset-y-[6px]'
            : 'px-[20px] py-[9px] text-[13.5px] pointer-coarse:before:-inset-y-[3px]'
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

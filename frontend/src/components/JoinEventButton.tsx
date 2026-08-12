'use client';

import { useState } from 'react';
import { joinEvent, leaveEvent, type CommunityEvent } from '@/lib/events';
import { mutationErrorMessage } from '@/lib/session';

interface JoinEventButtonProps {
  event: CommunityEvent;
  // Ran after a membership change lands, for surfaces holding data the
  // change invalidates (the detail page's participant list).
  onChanged?: () => void;
  className?: string;
}

// The Join/Joined toggle, extracted from EventCard in RUN-69 when the
// detail header needed the same button with the same rules: the round trip
// (AC2 of RUN-68), the double-click guard, and the inline role="alert"
// failure line the app-wide pattern prescribes.
//
// Renders nothing for the owner. Their membership is structural - they
// joined at creation and cannot leave - so there is no action to offer;
// the "Your event" chip beside it already says why.
export default function JoinEventButton({ event, onChanged, className }: JoinEventButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (event.mine) return null;

  const toggleMembership = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (event.joined) {
        await leaveEvent(event.id);
      } else {
        await joinEvent(event.id);
      }
      // The mutation's own response updated the events cache, re-rendering
      // whoever reads it with the flipped flag and the fresh count; only
      // data the cache does not hold needs the callback.
      setBusy(false);
      onChanged?.();
    } catch (cause) {
      setBusy(false);
      setError(mutationErrorMessage(cause));
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggleMembership}
        disabled={busy}
        // Drawn ~36px tall, which is under the 44px minimum, so a
        // pseudo-element grows the hit area vertically only: horizontally the
        // pill is already wide enough, and expanding sideways would reach into
        // the card link beside it (RUN-75 AC3, the RUN-64 pattern), on
        // touch only: ungated it would enlarge :hover on a mouse as well.
        className={`relative z-10 shrink-0 rounded-full px-[18px] py-[8px] text-[13px] font-semibold pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-[4px] pointer-coarse:before:content-[''] disabled:cursor-default disabled:opacity-60 ${
          event.joined
            ? 'border border-line-strong bg-white text-text-primary hover:bg-muted'
            : 'bg-accent text-white hover:bg-accent-pressed'
        }`}
      >
        {busy ? 'Saving…' : event.joined ? 'Joined' : 'Join'}
      </button>

      {error && (
        <p role="alert" className="pt-[6px] text-[12.5px] leading-[1.5] text-accent-pressed">
          {error}
        </p>
      )}
    </div>
  );
}

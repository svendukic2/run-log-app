import { EVENT_STATE_CHIP, EVENT_STATE_LABEL, type CommunityEvent } from '@/lib/eventMath';

// The chip row every event header wears (RUN-68): the derived-state pill
// and, on the caller's own events, the "Your event" badge. Shared between
// the card and the detail header so their sizing and copy cannot drift
// (RUN-69 rebuilds the detail header on top of this).
export default function EventStateChips({ event }: { event: CommunityEvent }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`rounded-full px-[10px] py-[3px] text-[11.5px] font-semibold ${EVENT_STATE_CHIP[event.state]}`}
      >
        {EVENT_STATE_LABEL[event.state]}
      </span>
      {event.mine && (
        <span className="rounded-full bg-accent-soft px-[10px] py-[3px] text-[11.5px] font-semibold text-accent-pressed">
          Your event
        </span>
      )}
    </div>
  );
}

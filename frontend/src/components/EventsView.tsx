'use client';

import EventCard from '@/components/EventCard';
import EventsEmptyState from '@/components/EventsEmptyState';
import { EVENT_STATE_LABEL, EVENT_STATE_ORDER, groupEventsByState, useEvents } from '@/lib/events';

// The Events page body (RUN-68): cards grouped by derived state, Active
// first (AC1), each group keeping the API's chronological order; the
// designed empty state when the community has no events at all (AC4).
// Renders inside EventsBoundary, so by the time this mounts the store is
// 'ready' and an empty array really means "no events".
export default function EventsView() {
  const events = useEvents();

  if (events.length === 0) return <EventsEmptyState />;

  const groups = groupEventsByState(events);

  return (
    <div className="flex flex-col gap-8">
      {EVENT_STATE_ORDER.map((state) => {
        const group = groups[state];
        if (group.length === 0) return null;
        return (
          <section key={state} aria-labelledby={`events-${state}-heading`}>
            <h2
              id={`events-${state}-heading`}
              className="pb-[14px] font-display text-[17px] font-bold tracking-[-0.34px] text-text-primary"
            >
              {EVENT_STATE_LABEL[state]}
              <span className="pl-2 text-[13px] font-medium tracking-normal text-tertiary">
                {group.length}
              </span>
            </h2>
            {/* One column on a phone, two from `sm`, three from `xl`: the
                card's two-line header stays readable at every width
                (responsive addendum). */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

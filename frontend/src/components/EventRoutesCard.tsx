'use client';

// The event's route map card (RUN-77): where everyone actually ran, on one map.
//
// It reads the SAME store as EventRunsCard - no new endpoint and no second store,
// because the routes arrive on the run feed's own payload (GET
// /api/events/:id/runs since RUN-77). Two components calling useEventRuns is one
// fetch, not two: the store collapses concurrent reads of the same event by id
// (eventRuns.ts ensureLoaded).
//
// IT RENDERS NOTHING UNLESS THERE IS SOMETHING TO DRAW, in all four of the ways
// that can happen: while the feed is loading, after the feed failed, when no
// tagged run has a route, and when every route a runner has is one this viewer
// may not see. That covers AC4 - "no map is rendered at all, no empty map frame,
// and the Leaflet chunk is never fetched" - and it is why there is no spinner and
// no Try again button here. Those belong to EventRunsCard, which owns the same
// single read and already shows both; a second copy of each would put two
// spinners and two retry buttons on one screen for one request. A map is a
// decoration on data another card reports on.
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useEventRuns } from '@/lib/eventRuns';
import { eventRouteLines } from './eventRouteLines';

// ssr: false is not a preference: Leaflet reads `window` at module scope, so a
// server render of EventRoutesMap fails the production build outright ("window is
// not defined"). It is ALSO the other half of AC4 - the chunk, its CSS and the
// first tile request are fetched when <EventRoutesMap> first renders, which the
// guard below prevents entirely for an event with no drawable route.
//
// The skeleton holds the map's exact height so the page does not jump when the
// chunk lands.
const EventRoutesMap = dynamic(() => import('./EventRoutesMap'), {
  ssr: false,
  loading: () => (
    <div
      className="h-[320px] w-full animate-pulse rounded-[14px] border border-line-strong bg-muted sm:h-[420px] lg:h-[500px]"
      aria-hidden="true"
    />
  ),
});

const CARD = 'rounded-[18px] border border-line bg-white';

export default function EventRoutesCard({ eventId }: { eventId: string }) {
  const { status, runs } = useEventRuns(eventId);

  // Memoised on the feed's identity: decoding eight polylines is a few thousand
  // points, and EventRoutesMap's effect depends on the identity of this array -
  // a fresh one per render would tear the map down and rebuild it.
  const lines = useMemo(() => (status === 'ready' ? eventRouteLines(runs) : []), [status, runs]);

  if (lines.length === 0) return null;

  return (
    <section className={`${CARD} px-[24px] py-[22px]`} aria-labelledby="event-routes-heading">
      <h2
        id="event-routes-heading"
        className="pb-[14px] text-[11px] font-medium tracking-[0.66px] text-tertiary uppercase"
      >
        Where everyone ran
      </h2>
      <EventRoutesMap lines={lines} />
    </section>
  );
}

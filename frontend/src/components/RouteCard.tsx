'use client';

// The Route card, shared by the owner's run detail and the read-only one a
// public profile links to (RUN-55). One card rather than two, for the same
// reason runDetailParts exists: the choice between "draw the real route" and
// "draw the decorative sketch" is a rule about run data, and a rule copied into
// two screens is a rule that will be applied in two different ways.
import dynamic from 'next/dynamic';
import { type RunRoute } from '@/lib/runMath';
import { CARD, RouteSketch } from './runDetailParts';

// ssr: false is not a preference: Leaflet reads `window` at module scope, so a
// server render of RouteMap fails the production build outright ("window is not
// defined").
//
// It is ALSO what makes AC5 true. The chunk - Leaflet, its CSS, and the first
// tile request - is fetched when <RouteMap> first renders, which only happens
// for a run that has a route. A run without one costs nothing at all, and the
// skeleton below holds the map's exact height so the card does not jump when the
// chunk lands.
const RouteMap = dynamic(() => import('./RouteMap'), {
  ssr: false,
  loading: () => (
    <div
      className="h-[300px] w-full animate-pulse rounded-[14px] border border-line-strong bg-muted sm:h-[380px] lg:h-[440px]"
      aria-hidden="true"
    />
  ),
});

export default function RouteCard({ route }: { route?: RunRoute | null }) {
  return (
    <section aria-labelledby="route-title" className={CARD}>
      {/* The mock puts a "Road · out & back" caption beside the heading; a route
          type is never captured, so only the heading renders (A10). */}
      <div className="border-b border-line px-[28px] py-[20px]">
        <h2
          id="route-title"
          className="font-display text-[17px] font-bold tracking-[-0.2px] text-text-primary"
        >
          Route
        </h2>
      </div>
      <div className="p-[6px]">
        {route ? (
          <RouteMap polyline={route.polyline} trimmed={route.trimmed} />
        ) : (
          // Unchanged from v1, deliberately (AC2): a run with no route has no
          // coordinates to draw, and `route: null` is also what a viewer gets
          // for a route that is not theirs to see - so this is the one thing
          // both cases must look identical in.
          <div className="rounded-[14px] bg-muted px-6 py-10">
            <RouteSketch />
          </div>
        )}
      </div>
    </section>
  );
}

'use client';

// The route map both run detail screens draw (RUN-55, Figma node 214-744): the
// stored polyline over OpenStreetMap tiles, dashed, framed to the line, with
// Start and Finish pins and a zoom control.
//
// READ-ONLY BY CONSTRUCTION. It is the sibling of RouteMapPicker, not a mode of
// it: nothing here places, moves or removes a point, and there is no callback to
// hand one back. That is the same reasoning PublicRunDetailView gives for not
// being a readOnly flag on RunDetailView - a flag is one bad merge away from
// letting a stranger drag somebody else's route.
//
// It must be imported through next/dynamic with ssr: false (RouteCard does
// that). Leaflet touches `window` at module scope, so a server render of this
// file fails the production build with "window is not defined" - the import of
// its CSS below is the other half of the same rule. Reaching it only through
// RouteCard, and only for a run that HAS a route, is also what makes the tiles
// lazy (AC5): a run without one never loads the chunk, let alone a tile.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { decodePolyline } from '@/lib/polyline';
import {
  OSM_ATTRIBUTION,
  OSM_MAX_ZOOM,
  OSM_TILE_URL,
  ROUTE_LINE_COLOR,
} from './routeMapStyle';

export interface RouteMapProps {
  // The stored geometry, encoded (precision 5).
  polyline: string;
  // Whether the server cut the ends off before sending it (AC4). It changes
  // what may be DRAWN, not just what is said: the ends of a trimmed line are
  // not the run's start and finish, so they get no pins.
  trimmed: boolean;
}

// Start green, Finish coral with a label pill under each, as the design draws
// them. The dot sits exactly on the coordinate; the pill hangs below it and is
// allowed to overflow the icon box, which Leaflet does not clip.
function endpointIcon(label: 'Start' | 'Finish'): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span class="relative flex flex-col items-center">
      <span class="block size-[14px] rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] ${
        label === 'Start' ? 'bg-success' : 'bg-accent'
      }"></span>
      <span class="absolute top-[19px] rounded-full bg-white px-[9px] py-[2px] text-[11px] font-semibold whitespace-nowrap text-text-primary shadow-[0_1px_5px_rgba(0,0,0,0.18)]">${label}</span>
    </span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function RouteMap({ polyline, trimmed }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // The decoded line, memoised on the string rather than recomputed per render:
  // this is a few hundred points and the effect below depends on its identity.
  const line = useMemo(() => decodePolyline(polyline), [polyline]);
  const drawable = line.length > 1;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current || !drawable) return;

    const map = L.map(container, {
      // Both are replaced immediately by fitBounds; Leaflet simply refuses to
      // initialise without a view.
      center: [line[0].lat, line[0].lng],
      zoom: 13,
      // The page scrolls. A wheel that zooms the map instead of scrolling past
      // it is the one thing guaranteed to annoy every reader who is not looking
      // at the map; ctrl + wheel still zooms, and +/- is always there.
      scrollWheelZoom: false,
      // The touch equivalent of the same problem, and a worse one: a 300px-tall
      // map is most of a phone screen, so a swipe that starts on it would pan
      // the route instead of scrolling the page, with no way to get past it.
      // Nothing is lost - the view is already fitted to the whole route, and
      // the zoom buttons still work.
      dragging: !L.Browser.mobile,
      // Added below instead, so it can go in a corner the legend does not
      // cover; Leaflet has no map option for its position.
      zoomControl: false,
    });
    // Bottom right, as the design draws it (AC1 wants a zoom control, and the
    // default top-left corner is exactly where the legend sits).
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: OSM_MAX_ZOOM,
    }).addTo(map);

    const latlngs = line.map((point) => [point.lat, point.lng] as L.LatLngTuple);
    // Dashed on purpose, and the "Routed estimate" legend says the same thing in
    // words: this is a line reconstructed from a handful of taps, not a GPS
    // trace, and it should not look like one.
    L.polyline(latlngs, {
      color: ROUTE_LINE_COLOR,
      weight: 4,
      opacity: 0.9,
      dashArray: '8 8',
    }).addTo(map);

    // No pins on a trimmed line (AC4). Its first and last points are wherever
    // the 300 m cut happened to land, so a "Start" pin there would be a
    // confident lie - worse than the caption that replaces it.
    if (!trimmed) {
      L.marker(latlngs[0], {
        icon: endpointIcon('Start'),
        // Nothing here is interactive, so the markers are decoration: the
        // caption below the map is what a screen reader gets instead.
        interactive: false,
        keyboard: false,
      }).addTo(map);
      L.marker(latlngs[latlngs.length - 1], {
        icon: endpointIcon('Finish'),
        interactive: false,
        keyboard: false,
      }).addTo(map);
    }

    // The whole route, framed. Unlike the picker this fits unconditionally: the
    // line never changes while the map is open, so this runs once per mount and
    // cannot yank the view out from under someone who has panned.
    map.fitBounds(L.latLngBounds(latlngs), { padding: [26, 26] });
    // The card can still be mid-layout when the map reads its size; without
    // this the tiles render into a 0x0 box and stay broken until a resize.
    const raf = requestAnimationFrame(() => map.invalidateSize());
    mapRef.current = map;

    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
    };
  }, [line, drawable, trimmed]);

  // A stored polyline that will not decode: junk from a hand-edited row, or a
  // 3-D one (see decodePolyline). Unreachable through the API, which validates
  // on write - but drawing half a line would claim the runner went somewhere
  // they did not, so this says so instead of guessing.
  if (!drawable) {
    return (
      <div
        data-testid="route-map-undrawable"
        className="flex h-[160px] w-full items-center justify-center rounded-[14px] border border-line-strong bg-muted px-6 text-center text-[13.5px] text-secondary"
      >
        This route could not be drawn.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[8px]">
      {/* relative: the legend sits over the map, above every Leaflet pane
          (tiles 200, overlays 400, markers 600, controls 1000). */}
      <div className="relative">
        <div
          ref={containerRef}
          // Deliberately NOT "route-map", which is the picker's (RouteMapPicker):
          // opening Edit from a routed run's detail mounts both maps at once, and
          // one shared test id would make every getByTestId in either suite
          // ambiguous exactly when a regression is most likely.
          data-testid="route-map-display"
          // role=application, because arrow keys inside a Leaflet map pan it
          // rather than moving the reading cursor, and a screen reader has to be
          // told to hand them over.
          role="application"
          aria-label="Map of this run's route"
          className="h-[300px] w-full overflow-hidden rounded-[14px] border border-line-strong bg-muted sm:h-[380px] lg:h-[440px]"
        />
        {/* pointer-events-none so it cannot swallow a drag that starts on it. */}
        <div className="pointer-events-none absolute top-[14px] left-[14px] z-[1000] flex items-center gap-[8px] rounded-full border border-line bg-white/95 px-[12px] py-[6px] text-[11.5px] font-semibold text-secondary shadow-[0_1px_6px_rgba(0,0,0,0.12)]">
          <span
            aria-hidden="true"
            className="block h-0 w-[18px] border-t-[3px] border-dashed border-route"
          />
          Routed estimate
        </div>
      </div>

      {/* The trim is the runner's privacy setting doing its job, so it is said
          out loud rather than left as a mysteriously short line. Also the only
          thing a screen reader gets from a trimmed map, since the pins that
          would otherwise be announced are not drawn. */}
      {trimmed ? (
        <p className="px-[4px] text-[12.5px] leading-[1.5] text-tertiary">
          The first and last 300 m are hidden to protect this runner&apos;s privacy.
        </p>
      ) : null}
    </div>
  );
}

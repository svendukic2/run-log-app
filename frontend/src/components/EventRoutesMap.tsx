'use client';

// Every route of one event on one map (RUN-77 AC1): the tagged runs' polylines
// overlaid on OpenStreetMap tiles, one colour per runner, framed to all of them
// together.
//
// READ-ONLY BY CONSTRUCTION, and the THIRD sibling rather than a mode of either
// existing map. RouteMapPicker edits one route, RouteMap displays one route, this
// displays many; nothing here places, moves or removes a point and there is no
// callback to hand one back. That is AC5, and it is the same reasoning RouteMap
// already gives for not being a `readOnly` flag on the picker: a flag is one bad
// merge away from letting a stranger drag somebody else's route, and here the
// stranger would be dragging eight of them.
//
// It must be imported through next/dynamic with ssr: false (EventRoutesCard does
// that). Leaflet touches `window` at module scope, so a server render of this
// file fails the production build outright with "window is not defined" - the CSS
// import below is the other half of the same rule. Being reachable only through a
// card that renders nothing when there are no lines is also what makes AC4's
// "the Leaflet chunk is never fetched" true.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { type EventRouteLine, eventRouteLegend } from './eventRouteLines';
import { OSM_ATTRIBUTION, OSM_MAX_ZOOM, OSM_TILE_URL } from './routeMapStyle';

export interface EventRoutesMapProps {
  // Already decoded, filtered and coloured by eventRouteLines. Guaranteed
  // non-empty by the card: a map with nothing to draw is not rendered at all.
  lines: EventRouteLine[];
}

export default function EventRoutesMap({ lines }: EventRoutesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const legend = useMemo(() => eventRouteLegend(lines), [lines]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current || lines.length === 0) return;

    // Every point of every line, which is both the initial centre and what the
    // view gets fitted to below.
    const all = lines.flatMap((line) =>
      line.points.map((point) => [point.lat, point.lng] as L.LatLngTuple),
    );

    const map = L.map(container, {
      // Replaced immediately by fitBounds; Leaflet simply refuses to initialise
      // without a view.
      center: all[0],
      zoom: 12,
      // The page scrolls, and this map is the tallest thing on it. A wheel that
      // zoomed instead of scrolling past would annoy every reader who is not
      // looking at the map; ctrl + wheel still zooms and +/- is always there.
      // Same two opt-outs, for the same two reasons, as RouteMap.
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
      // Added below instead, so it lands in a corner nothing else covers;
      // Leaflet has no map option for its position.
      zoomControl: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: OSM_MAX_ZOOM,
    }).addTo(map);

    for (const line of lines) {
      // Dashed for the reason RouteMap dashes a single route: these are lines
      // reconstructed from a handful of tapped points, not GPS traces, and they
      // should not look like one. Slightly translucent so a crossing shows as a
      // crossing instead of one route appearing to end where another begins -
      // which matters here and not on run detail, because here they overlap.
      //
      // No Start or Finish pins, unlike RouteMap: eight routes would put sixteen
      // markers on one map, and the legend is what identifies a line anyway.
      L.polyline(
        line.points.map((point) => [point.lat, point.lng] as L.LatLngTuple),
        {
          color: line.color,
          weight: 4,
          opacity: 0.85,
          dashArray: '8 8',
        },
      ).addTo(map);
    }

    // AC2: the initial view frames every route together. Unconditional and once
    // per mount, like RouteMap's - the lines do not change while the map is open,
    // so this cannot yank the view out from under someone who has panned.
    map.fitBounds(L.latLngBounds(all), { padding: [26, 26] });
    // The card can still be mid-layout when the map reads its size; without this
    // the tiles render into a 0x0 box and stay broken until a window resize.
    const raf = requestAnimationFrame(() => map.invalidateSize());
    mapRef.current = map;

    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
    };
  }, [lines]);

  return (
    <div className="flex flex-col gap-[10px]">
      <div
        ref={containerRef}
        // Its own test id, deliberately neither "route-map" (the picker's) nor
        // "route-map-display" (RouteMap's): nothing mounts two of these at once
        // today, but a shared id would make every getByTestId in three suites
        // ambiguous exactly when a regression is most likely.
        data-testid="event-routes-map"
        // role=application, because arrow keys inside a Leaflet map pan it rather
        // than moving the reading cursor, and a screen reader has to be told to
        // hand them over.
        role="application"
        aria-label="Map of every route run for this event"
        className="h-[320px] w-full overflow-hidden rounded-[14px] border border-line-strong bg-muted sm:h-[420px] lg:h-[500px]"
      />

      {/* The legend (AC1). BELOW the map rather than floating over it, unlike
          RouteMap's single "Routed estimate" pill: up to eight names is enough to
          cover a corner of the tiles, and a real list is what a screen reader can
          read - the coloured lines themselves are announced by nothing. */}
      <ul className="flex flex-wrap gap-x-[18px] gap-y-[8px] px-[4px]">
        {legend.map((entry) => (
          <li
            key={entry.runnerId}
            className="flex items-center gap-[8px] text-[12.5px] text-secondary"
          >
            {/* The swatch is the same dashed line the map draws, so the legend
                looks like what it labels. aria-hidden because the name beside it
                already carries the meaning; a colour is not information a screen
                reader can use. */}
            <span
              aria-hidden="true"
              className="block h-0 w-[20px] shrink-0 border-t-[3px] border-dashed"
              style={{ borderTopColor: entry.color }}
            />
            {entry.runnerName}
          </li>
        ))}
      </ul>

      <p className="px-[4px] text-[12px] leading-[1.5] text-tertiary">
        Routed estimates from each runner&apos;s tagged run, not GPS traces.
      </p>
    </div>
  );
}

'use client';

// The Leaflet map of the Route step (RUN-54, Figma node 216:776): click to
// place Start, up to three numbered waypoints and Finish, drag a marker to
// move it, click one to remove it, and the planned polyline draws dashed over
// OpenStreetMap tiles.
//
// This file is a VIEW and nothing else. Every point lives in the parent's
// state and arrives back as props, which is why there is no store here and no
// state to get out of step: the imperative Leaflet layer is rebuilt from
// `points` and `polyline` on every change. That split is also what keeps the
// testable logic (planning, the mismatch hint, the point list) out of a module
// that only runs in a browser.
//
// It must be imported through next/dynamic with ssr: false (RouteStep does
// that). Leaflet touches `window` at module scope, so a server render of this
// file fails the build with "window is not defined" - the import of its CSS
// below is the other half of the same rule.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { decodePolyline } from '@/lib/polyline';
import { MAX_ROUTE_POINTS, type RouteWaypoint } from '@/lib/runMath';
// Shared with the display map (RUN-55) so the two cannot drift on the route
// colour or on the tile attribution the licence requires.
import {
  OSM_ATTRIBUTION,
  OSM_MAX_ZOOM,
  OSM_TILE_URL,
  ROUTE_LINE_COLOR,
} from './routeMapStyle';

// Where a fresh picker opens. ASSUMPTION, flagged on the ticket: the design
// shows a city-block view, so it assumes the map opens somewhere useful, and
// the two ways to get there are geolocation (a permission prompt the moment a
// modal opens - a privacy and UX decision that belongs to the designer, not
// to this ticket) or a remembered last view (nothing stores one yet). Until
// that is answered, a fixed city centre beats a world map: panning from a
// known place is quicker than finding one on a globe. Editing a routed run
// ignores this entirely and fits the stored route instead.
const DEFAULT_CENTER: RouteWaypoint = { lat: 45.815, lng: 15.9819 };
const DEFAULT_ZOOM = 13;

export interface RouteMapPickerProps {
  // Ordered: [0] is Start, the last is Finish, the rest are numbered
  // waypoints. Fewer than two means the route is not drawable yet.
  points: RouteWaypoint[];
  // The planned geometry, encoded. null while nothing is planned (or the plan
  // failed), in which case the markers show with no line between them.
  polyline: string | null;
  onPlace: (point: RouteWaypoint) => void;
  onMove: (index: number, point: RouteWaypoint) => void;
  onRemove: (index: number) => void;
}

// Start green, Finish coral, waypoints numbered on the route blue: the same
// three-way distinction the design draws, and the reason the route line is not
// coral (see the token comment in globals.css).
function markerIcon(index: number, total: number): L.DivIcon {
  const isStart = index === 0;
  const isFinish = index === total - 1 && total > 1;
  if (isStart || isFinish) {
    return L.divIcon({
      className: '',
      html: `<span class="block size-[18px] rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] ${
        isStart ? 'bg-success' : 'bg-accent'
      }"></span>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }
  return L.divIcon({
    className: '',
    html: `<span class="flex size-[22px] items-center justify-center rounded-full border-2 border-route bg-white text-[11px] font-semibold text-route shadow-[0_1px_4px_rgba(0,0,0,0.3)]">${index}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function pointLabel(index: number, total: number): string {
  if (index === 0) return 'Start';
  if (index === total - 1 && total > 1) return 'Finish';
  return `Waypoint ${index}`;
}

export default function RouteMapPicker({
  points,
  polyline,
  onPlace,
  onMove,
  onRemove,
}: RouteMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // One group holding every marker and the line, cleared and refilled on each
  // change. Rebuilding beats diffing here: five markers is nothing, and a diff
  // is where "the marker moved but its number did not" bugs live.
  const overlayRef = useRef<L.LayerGroup | null>(null);
  // See the fitBounds call below: the map is framed once, then left alone.
  const framedOnceRef = useRef(false);
  // The map is created once; its click handler must still see the CURRENT
  // callbacks, so they are read through a ref rather than captured.
  const handlersRef = useRef({ onPlace, onMove, onRemove, points });

  // Deliberately no dependency array: this is the whole point of the ref, and
  // every render must refresh it. It runs before any event can read it, since
  // effects for a commit all flush before the browser hands over the next
  // click.
  useEffect(() => {
    handlersRef.current = { onPlace, onMove, onRemove, points };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      zoom: DEFAULT_ZOOM,
      // The modal scrolls; a wheel that zooms the map instead of scrolling the
      // form is the single most annoying thing a map in a form can do. Ctrl +
      // wheel still zooms, and the +/- control is always there.
      scrollWheelZoom: false,
      zoomControl: true,
    });
    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: OSM_MAX_ZOOM,
    }).addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      // Full is full: the plan endpoint caps waypoints at three, so a sixth
      // point would be a request the server rejects. The step's status line
      // says so; silently ignoring the click is better than adding a point
      // that cannot be planned.
      if (handlersRef.current.points.length >= MAX_ROUTE_POINTS) return;
      handlersRef.current.onPlace({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // The flag belongs to THIS map, not to the component: refs survive the
    // mount/unmount/mount that StrictMode performs in development, so a flag
    // left true from the discarded first map would leave the surviving one
    // unframed - and Edit would open on the default centre instead of the
    // stored route.
    framedOnceRef.current = false;

    // The modal animates in, so the container can still be mid-layout when
    // the map reads its size; without this the tiles render into a 0x0 box
    // and the map looks broken until something else resizes it.
    const raf = requestAnimationFrame(() => map.invalidateSize());

    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  // Markers and the line, rebuilt from props.
  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;
    overlay.clearLayers();

    const line = polyline ? decodePolyline(polyline) : [];
    if (line.length > 1) {
      // Dashed on purpose (roadmap decision): this is a reconstruction from a
      // handful of taps, not a GPS trace, and the line should say so.
      L.polyline(
        line.map((point) => [point.lat, point.lng] as L.LatLngTuple),
        { color: ROUTE_LINE_COLOR, weight: 4, opacity: 0.9, dashArray: '8 8' },
      ).addTo(overlay);
    }

    points.forEach((point, index) => {
      const label = pointLabel(index, points.length);
      const marker = L.marker([point.lat, point.lng], {
        icon: markerIcon(index, points.length),
        draggable: true,
        keyboard: true,
        // Both, and for different users: `title` is the hover tooltip, `alt`
        // is what a screen reader announces for the focusable marker.
        title: `${label} - drag to move, click to remove`,
        alt: `${label}, ${index + 1} of ${points.length}`,
      });
      marker.on('dragend', () => {
        const moved = marker.getLatLng();
        handlersRef.current.onMove(index, { lat: moved.lat, lng: moved.lng });
      });
      // Leaflet suppresses the click that ends a drag, so this cannot fire on
      // a fumbled move. It also stops the event reaching the map, so removing
      // a point never places another one on top of it.
      marker.on('click', (event: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(event);
        handlersRef.current.onRemove(index);
      });
      marker.addTo(overlay);
    });

    // Frame the route ONCE, the first time there is one to frame: that is what
    // makes Edit open on the stored route (AC5). Deliberately not on every
    // change - every click would re-frame twice (once for the marker, once
    // when its line arrives) and yank the map out from under someone who had
    // just panned to where they wanted to click next.
    const framed = line.length > 1 ? line : points;
    if (!framedOnceRef.current && framed.length > 1) {
      framedOnceRef.current = true;
      map.fitBounds(
        L.latLngBounds(framed.map((point) => [point.lat, point.lng] as L.LatLngTuple)),
        { padding: [28, 28] },
      );
    }
  }, [points, polyline]);

  return (
    <div
      ref={containerRef}
      data-testid="route-map"
      // role=application, because the arrow keys inside a Leaflet map pan it
      // rather than moving the reading cursor, and a screen reader has to be
      // told to hand them over. KNOWN LIMITATION, flagged on the ticket:
      // placing a point needs a pointer - existing points are focusable and
      // removable by keyboard, but there is no keyboard way to add one.
      role="application"
      aria-label="Route map. Click the map to place points."
      className="h-[260px] w-full overflow-hidden rounded-[14px] border border-line-strong bg-muted sm:h-[300px]"
    />
  );
}

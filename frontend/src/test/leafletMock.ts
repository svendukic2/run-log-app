// Leaflet, stubbed for Jest (RUN-54). jest.config.ts maps the `leaflet`
// module here for EVERY test, not just the map ones, because RouteMapPicker
// sits behind next/dynamic inside the Add run modal: any test that opens that
// modal would otherwise boot a real map in jsdom, which has no layout, no
// tiles and no reason to be involved.
//
// WHY a stub with test hooks rather than mocking RouteMapPicker itself: the
// wiring IS the component. Registering the map's click handler, translating a
// dragend into an index, stopping a marker click from reaching the map - those
// are the only things that file does, and mocking it away would leave them
// untested while the tests still passed. Firing the events through this stub
// exercises the real component.
//
// It implements exactly what RouteMapPicker calls. A method missing here is a
// TypeError in a test, which is the right way to find out that the component
// started using something new.

interface StubLatLng {
  lat: number;
  lng: number;
}

interface StubMarker {
  latlng: StubLatLng;
  options: Record<string, unknown>;
  handlers: Map<string, (event: unknown) => void>;
}

interface MapState {
  clickHandlers: Array<(event: { latlng: StubLatLng }) => void>;
  markers: StubMarker[];
  polylines: Array<{ latlngs: Array<[number, number]>; options: Record<string, unknown> }>;
  tileLayers: Array<{ url: string; options: Record<string, unknown> }>;
  // Zoom controls added explicitly (RUN-55 puts the display map's in the
  // bottom-right corner, out from under its legend).
  zoomControls: Array<Record<string, unknown>>;
  fitBoundsCalls: number;
  // What each fitBounds was actually framed to, not just how many there were.
  // The count alone cannot tell "framed to every route" from "framed to the
  // first one", which is exactly what RUN-77 AC2 is about (review finding).
  fitBoundsArgs: Array<Array<[number, number]>>;
  removed: boolean;
}

// One live map per test: nothing in the app opens two at once, and a single
// slot keeps the hooks below free of an index nobody would ever pass.
let state: MapState = freshState();

function freshState(): MapState {
  return {
    clickHandlers: [],
    markers: [],
    polylines: [],
    tileLayers: [],
    zoomControls: [],
    fitBoundsCalls: 0,
    fitBoundsArgs: [],
    removed: false,
  };
}

export function resetLeafletMock(): void {
  state = freshState();
}

// What the stub recorded: the markers and the line the component drew, in the
// order it drew them. Assertions read this instead of the DOM, because a real
// map's DOM is tiles and transforms.
export function leafletState(): MapState {
  return state;
}

// A click on the map itself, the only way to place a point (AC1).
export function fireMapClick(lat: number, lng: number): void {
  if (state.clickHandlers.length === 0) {
    throw new Error('leafletMock: fireMapClick before a map registered a click handler');
  }
  state.clickHandlers.forEach((handler) => handler({ latlng: { lat, lng } }));
}

function marker(index: number): StubMarker {
  const found = state.markers[index];
  if (!found) {
    throw new Error(
      `leafletMock: no marker at index ${index} (${state.markers.length} on the map)`,
    );
  }
  return found;
}

// A click on a marker, which removes that point (AC5).
export function fireMarkerClick(index: number): void {
  marker(index).handlers.get('click')?.({ originalEvent: {} });
}

// Dragging a marker to a new place, which moves that point (AC5). The real
// Leaflet has already updated the marker's own position by the time dragend
// fires, so the stub does the same - the component reads it back.
export function fireMarkerDragEnd(index: number, lat: number, lng: number): void {
  const found = marker(index);
  found.latlng = { lat, lng };
  found.handlers.get('dragend')?.({});
}

function makeLayerGroup() {
  return {
    addTo: () => makeLayerGroup(),
    clearLayers: () => {
      state.markers = [];
      state.polylines = [];
    },
  };
}

const leaflet = {
  // The container and options are ignored on purpose: there is no layout to
  // attach to and nothing to configure.
  map: () => ({
    on: (event: string, handler: (event: { latlng: StubLatLng }) => void) => {
      if (event === 'click') state.clickHandlers.push(handler);
    },
    remove: () => {
      state.removed = true;
      state.clickHandlers = [];
    },
    invalidateSize: () => undefined,
    // latLngBounds below is the identity, so what arrives here is the point list
    // the caller framed to.
    fitBounds: (bounds: Array<[number, number]>) => {
      state.fitBoundsCalls += 1;
      state.fitBoundsArgs.push(bounds);
    },
  }),

  tileLayer: (url: string, options: Record<string, unknown>) => ({
    addTo: () => {
      state.tileLayers.push({ url, options });
    },
  }),

  layerGroup: makeLayerGroup,

  polyline: (latlngs: Array<[number, number]>, options: Record<string, unknown>) => ({
    addTo: () => {
      state.polylines.push({ latlngs, options });
    },
  }),

  marker: (latlng: [number, number], options: Record<string, unknown>) => {
    const created: StubMarker = {
      latlng: { lat: latlng[0], lng: latlng[1] },
      options,
      handlers: new Map(),
    };
    return {
      on: (event: string, handler: (event: unknown) => void) => {
        created.handlers.set(event, handler);
      },
      getLatLng: () => created.latlng,
      addTo: () => {
        state.markers.push(created);
      },
    };
  },

  divIcon: (options: Record<string, unknown>) => options,
  latLngBounds: (latlngs: Array<[number, number]>) => latlngs,
  DomEvent: { stopPropagation: () => undefined },

  control: {
    zoom: (options: Record<string, unknown>) => ({
      addTo: () => {
        state.zoomControls.push(options);
      },
    }),
  },

  // Leaflet's own device sniffing. Always false here: jsdom is not a phone, and
  // a test that wants the mobile branch should say so by setting this.
  Browser: { mobile: false },
};

export default leaflet;

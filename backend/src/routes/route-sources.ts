// Who drew a route. One value today, and its own module rather than a
// constant inside routes.service.ts, because two modules need it for two
// different reasons: the routing proxy echoes it as `source` on every plan
// it returns (RUN-53), and the runs module stores it in Run.routeSource when
// a run is saved with a route (RUN-54). Importing routes.service.ts from the
// runs module for one string would drag a provider client into a module that
// never calls a provider.
//
// The value is also the reconstruction/GPS-truth marker the roadmap asked
// for: a route whose source is a routing provider was snapped from a handful
// of tapped points, which is why RUN-55 draws it dashed. A GPS trace, if one
// ever gets imported, arrives under its own source and draws solid.
export const ROUTE_SOURCE_OPENROUTESERVICE = 'openrouteservice';

// The demo seeder's routes (RUN-77 decision 5). Its own value rather than
// borrowing the one above, even though seed/demo-routes.ts really was planned by
// a pedestrian router: it was not planned by THIS app's provider, and a seeded
// row claiming otherwise is the kind of small lie that makes a
// `routeSource = 'openrouteservice'` query later answer the wrong question. It
// is also the marker that separates 8 checked-in polylines from a user's own
// geometry if the demo ever needs clearing out by source rather than by email.
//
// Same reconstruction meaning as the value above, so RUN-55 draws it dashed too,
// which is correct - these are snapped from tapped points, not run with a watch.
export const ROUTE_SOURCE_DEMO_SEED = 'demo-seed';

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

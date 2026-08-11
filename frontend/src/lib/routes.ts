// Route table for the app (RUN-13). Every path is declared once so the
// sidebar, the landing redirect and the tests cannot drift apart.
export const ROUTES = {
  welcome: '/',
  signIn: '/signin',
  signUp: '/signup',
  setupGoal: '/setup/goal',
  setupLevel: '/setup/level',
  dashboard: '/dashboard',
  runs: '/runs',
  coach: '/coach',
  events: '/events',
  leaderboard: '/leaderboard',
  people: '/people',
  settings: '/settings',
} as const;

// The views that live behind the shared shell, in sidebar order. RUN-62
// completed the COMMUNITY section it owns, so Leaderboard (RUN-70) and
// People join Events here and every community page is now reachable from
// the sidebar rather than by URL alone.
export const APP_ROUTES = [
  ROUTES.dashboard,
  ROUTES.runs,
  ROUTES.coach,
  ROUTES.leaderboard,
  ROUTES.events,
  ROUTES.people,
  ROUTES.settings,
] as const;

// One runner's public profile (RUN-63 builds the page; RUN-69's
// participant and leaderboard rows are its first callers, RUN-62's search
// results the newest). Not in APP_ROUTES itself: the sidebar links the
// People page above it, and a profile is reached from a row. It does sit
// UNDER that path, so isActiveRoute keeps People highlighted while one is
// open, which is where the reader came from.
export function personRoute(id: string): string {
  return `/people/${id}`;
}

// One run on someone's public profile, read only (RUN-63 AC4). Nested under
// the profile rather than reusing /runs/:id because the run is only
// readable through the profile that owns it: the same privacy gate decides
// both, and a flat route would invite reading a foreign run without one.
export function personRunRoute(personId: string, runId: string): string {
  return `${personRoute(personId)}/runs/${runId}`;
}

// Dashboard is the default view inside the shell (RUN-13 AC1).
export const DEFAULT_APP_ROUTE = ROUTES.dashboard;

// A view stays active for its own path and anything nested under it, so
// /runs/42 still highlights "Runs". Guarded against the "/" prefix matching
// every route.
export function isActiveRoute(pathname: string, href: string): boolean {
  if (href === ROUTES.welcome) return pathname === ROUTES.welcome;
  return pathname === href || pathname.startsWith(`${href}/`);
}

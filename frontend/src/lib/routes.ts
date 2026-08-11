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
  settings: '/settings',
} as const;

// The views that live behind the shared shell, in sidebar order (Events
// joined with the COMMUNITY section, RUN-68).
//
// The global leaderboard (RUN-70) is deliberately NOT here yet: RUN-62 owns
// the sidebar's COMMUNITY section and adds the link there, so the page is
// reachable by URL (and from wherever a row links to it) until that lands.
export const APP_ROUTES = [
  ROUTES.dashboard,
  ROUTES.runs,
  ROUTES.coach,
  ROUTES.events,
  ROUTES.settings,
] as const;

// One runner's public profile (RUN-63 builds the page; RUN-69's
// participant and leaderboard rows are its first callers). Not in
// APP_ROUTES: it is reached from a row, never from the sidebar.
export function personRoute(id: string): string {
  return `/people/${id}`;
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

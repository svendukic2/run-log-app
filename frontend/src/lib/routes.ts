// Route table for the app (RUN-13). Every path is declared once so the
// sidebar, the landing redirect and the tests cannot drift apart.
export const ROUTES = {
  welcome: '/',
  setupGoal: '/setup/goal',
  setupLevel: '/setup/level',
  dashboard: '/dashboard',
  runs: '/runs',
  coach: '/coach',
  events: '/events',
  settings: '/settings',
} as const;

// The views that live behind the shared shell, in sidebar order (Events
// joined with the COMMUNITY section, RUN-68).
export const APP_ROUTES = [
  ROUTES.dashboard,
  ROUTES.runs,
  ROUTES.coach,
  ROUTES.events,
  ROUTES.settings,
] as const;

// Dashboard is the default view inside the shell (RUN-13 AC1).
export const DEFAULT_APP_ROUTE = ROUTES.dashboard;

// A view stays active for its own path and anything nested under it, so
// /runs/42 still highlights "Runs". Guarded against the "/" prefix matching
// every route.
export function isActiveRoute(pathname: string, href: string): boolean {
  if (href === ROUTES.welcome) return pathname === ROUTES.welcome;
  return pathname === href || pathname.startsWith(`${href}/`);
}

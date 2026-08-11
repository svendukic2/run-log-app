import { APP_ROUTES, DEFAULT_APP_ROUTE, ROUTES, isActiveRoute, personRoute } from './routes';

describe('app routes (RUN-13)', () => {
  it('opens on the Dashboard by default (AC1)', () => {
    expect(DEFAULT_APP_ROUTE).toBe(ROUTES.dashboard);
  });

  it('lists exactly the views that live behind the shell, in sidebar order', () => {
    expect(APP_ROUTES).toEqual([
      '/dashboard',
      '/runs',
      '/coach',
      '/leaderboard',
      '/events',
      '/people',
      '/settings',
    ]);
  });

  it('keeps onboarding outside the shell routes (AC4)', () => {
    expect(APP_ROUTES).not.toContain(ROUTES.welcome);
    expect(APP_ROUTES).not.toContain(ROUTES.setupGoal);
  });
});

describe('isActiveRoute (RUN-13 AC3)', () => {
  it.each(APP_ROUTES)('marks %s active for its own path', (href) => {
    expect(isActiveRoute(href, href)).toBe(true);
  });

  it('marks only one view active at a time', () => {
    const active = APP_ROUTES.filter((href) => isActiveRoute('/runs', href));

    expect(active).toEqual([ROUTES.runs]);
  });

  it('keeps a nested route inside its section', () => {
    expect(isActiveRoute('/runs/42', ROUTES.runs)).toBe(true);
    // A public profile sits under People, so the sidebar keeps that entry
    // lit while one is open (RUN-62).
    expect(isActiveRoute(personRoute('user-1'), ROUTES.people)).toBe(true);
  });

  it('does not match a route that merely shares a prefix', () => {
    expect(isActiveRoute('/runs-archive', ROUTES.runs)).toBe(false);
  });

  it('does not let the welcome route swallow every path', () => {
    expect(isActiveRoute('/dashboard', ROUTES.welcome)).toBe(false);
    expect(isActiveRoute('/', ROUTES.welcome)).toBe(true);
  });
});

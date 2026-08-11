# E2E acceptance tests

Playwright tests that walk the app the way a user does, one spec file per sprint. They
verify the Jira acceptance criteria of merged tasks, currently Sprint 1
(`tests/sprint1.spec.ts`: RUN-7, 8, 9, 10, 11, 12, 13, 15, 23 plus the sprint-goal
journey).

This package is deliberately separate from `frontend/` and `backend/` so the apps' own
dependencies stay untouched.

## First-time setup

```bash
cd e2e
npm install
npx playwright install chromium
```

The suite is database-backed (RUN-51): the app persists through the API, so the backend
and its PostgreSQL must be reachable. Locally the backend reads `backend/.env`
(`DATABASE_URL`, `JWT_SECRET`); see `docs/data-model.md` for the one-time database
setup.

## Running

```bash
cd e2e
npm test             # headless
npm run test:headed  # watch the browser do it
npm run report       # open the HTML report of the last run
```

Playwright starts both apps itself (backend production build on 3000, frontend dev
server on 4200) unless something is already listening on those ports, in which case
your own servers are reused. In CI nothing is reused: the job provides a fresh
Postgres service container and the config refuses `reuseExistingServer`.

## Isolation and reset strategy

Tests are isolated **per account, not per database wipe**:

- Each test runs in a fresh browser context with empty localStorage, so the app mints a
  brand-new device account (`runner-<random>@device.runlog`) on its first server
  contact. Tests that need an onboarded user create their own account up front through
  the real API (signup + the same goal/profile PUTs "Finish setup" makes) and plant its
  `runlog.session` before the page loads.
- Every `/api/*` endpoint is scoped to the Bearer token's user, so one test can never
  see another's rows - no truncation between tests is needed for correctness, and the
  suite can run `fullyParallel` against one database.

What accumulates is only dead device accounts:

- **In CI** the Postgres service container is created empty for every run and discarded
  after it, so there is nothing to reset.
- **Locally** the suite writes into whatever database `backend/.env` points at. To start
  clean, run `npx prisma migrate reset --force` from `backend/` (this DROPS all data in
  that database - point `DATABASE_URL` at a dedicated e2e database first if your dev
  data matters to you).

A red database cannot pass silently: the backend connects to PostgreSQL at startup
(PrismaService), so with a wrong `DATABASE_URL` the webServer never becomes healthy and
the whole run fails loudly (RUN-51 AC3). In CI the `e2e` job additionally runs
`prisma migrate deploy` first, which fails on an unreachable or drifted database before
a single test starts.

## localStorage in tests

Only two keys exist since RUN-50 and both are legitimate to touch in tests:
`runlog.session` (the device identity; planted by the seeding helper) and
`runlog.onboardingDraft` (the wizard's local draft; asserted by the setup-step tests).
Everything else - profile, goal, runs - lives server-side and is asserted through the
UI or the API, never localStorage.

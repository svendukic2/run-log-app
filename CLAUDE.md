# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository. Everything
below is verified against the code, not aspirational.

`README.md` is the human-facing entry point: setup steps, commands, and troubleshooting.
This file is the reasoning behind them, so the two overlap deliberately but do not
duplicate. When something structural changes, check whether both need updating.

## What this is

**Decode Academy Demo**, a teaching boilerplate for academy final projects. A minimal
Next.js frontend talks to a NestJS backend over HTTP. Exactly one feature works
end to end: the frontend fetches a greeting from the backend's `GET /api/hello` and
renders it. Everything else is scaffolding for you to build on.

Because this is a starting point rather than a finished app, the "Not yet built"
section at the bottom is load-bearing. Read it before assuming a feature exists.

## Repository layout

This is a **multi-app repo, not a workspace-managed monorepo**. There is no npm
workspaces, turbo, or nx setup. The root `package.json` owns only repo-wide dev tooling
(Husky, commitlint, lint-staged, Prettier) and does **not** manage the two apps.

```text
backend/          NestJS 11 API, port 3000, its own package.json + node_modules
frontend/         Next.js 16 + React 19, port 4200, its own package.json + node_modules
e2e/              Playwright acceptance tests, its own package.json (see e2e/README.md)
.claude/          Skills, agents and permissions for Claude Code (see below)
.github/workflows/ci.yml
.husky/           pre-commit and commit-msg hooks
```

Two consequences that trip people up:

- There are **three** `package.json` files and each is installed separately. Run
  `npm install` inside each app, and run it at the root too. The root install is
  **mandatory, not a convenience**: its `prepare` script is what sets `core.hooksPath` to
  `.husky/_`. Skip it and both hooks are simply absent, so any commit message shape is
  accepted and staged files are never linted. The failure is silent locally and only
  surfaces when the `conventions` job fails on the PR. Verify with
  `git config core.hooksPath`.
- Run app commands from inside that app's directory (`cd backend`, `cd frontend`). This
  matters for ESLint especially, whose config and plugins resolve from the app's own
  `node_modules`.

Node version comes from `.nvmrc` (currently **24**). CI reads that same file, so bump it
there and CI follows. Use `nvm use`, which reads `.nvmrc` and needs no version argument;
avoid `nvm install --lts`, which installs whatever LTS happens to be current. The hard
floor is **v20.9.0**, declared by `next` in its `engines` field, and all three
`package.json` files now carry that same `engines` constraint so npm warns on a mismatch.

## Common commands

Backend, from `backend/`:

| Command              | Purpose                                                   |
| -------------------- | --------------------------------------------------------- |
| `npm run start:dev`  | Nest in watch mode on :3000                               |
| `npm run build`      | Compile to `dist/`. Doubles as the typecheck gate (`tsc`) |
| `npm run lint`       | ESLint with `--fix`                                       |
| `npm test`           | Jest unit tests (`*.spec.ts` under `src/`)                |
| `npm run test:watch` | Same, in watch mode                                       |
| `npm run test:e2e`   | Supertest e2e (`test/`, uses `test/jest-e2e.json`)        |
| `npm run test:cov`   | Coverage                                                  |

Frontend, from `frontend/`:

| Command              | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Next dev server on :4200                        |
| `npm run build`      | Production build. Doubles as the typecheck gate |
| `npm start`          | Serve the production build on :4200             |
| `npm run lint`       | ESLint (`eslint-config-next`)                   |
| `npm test`           | Jest + React Testing Library (jsdom)            |
| `npm run test:watch` | Same, in watch mode                             |

Single test in either app: `npm test -- page` filters by path,
`npm test -- -t "greeting"` filters by test name.

Neither app has a standalone `typecheck` script. `npm run build` is the typecheck.

To run the whole thing locally, start both in separate terminals: backend on 3000,
frontend on 4200. The frontend calls the backend, never the reverse.

## Architecture

**Ports are fixed and asymmetric.** Backend API on **3000**, frontend on **4200**. Both
are wired into code and config, so do not swap them.

**The `/api` prefix lives in one place.** `backend/src/main.ts` sets a global `api`
prefix, so a controller mapped to `hello` is served at `GET /api/hello`. Note the
consequence: `GET http://localhost:3000/` returns 404, which is normal, not a broken
server. The e2e test re-applies the same prefix manually to match production, so if you
change the prefix you must change it in both places.

**Frontend to backend data flow, two paths.** The home page (`frontend/src/app/page.tsx`)
is an **async Server Component**: it fetches the backend at request time on the server
with `cache: 'no-store'`, no CORS involved. App data (runs, since RUN-48) goes the other
way: **client-side calls to same-origin `/api/*`**, which `next.config.ts` rewrites to
the backend server-side, so `BACKEND_URL` never reaches the browser bundle and CORS
still never enters the picture. Those calls carry a Bearer token from the
Sign in / Sign up screens (RUN-58, `frontend/src/lib/session.ts`): `runlog.session`
stores token + email, a 401 signs the user out cleanly (no refresh endpoint yet,
RUN-74), and every guarded screen sits behind `RequireSession`. CORS stays
enabled on the backend (`main.ts`, origin `FRONTEND_URL`) for any genuinely cross-origin
fetch.

**Every app-data store is an API-backed cache (RUN-48 pattern, app-wide since
RUN-50).** `frontend/src/lib/runs.ts`, `account.ts` (the runner's name and email, the
single source of truth since RUN-59), `onboarding.ts` (profile = the setup answers)
and `goal.ts` (goal + week target) keep in-memory caches behind `useSyncExternalStore`; the hooks stay
synchronous, every data screen renders through one `AppDataBoundary` (nothing while
loading, one retry card on error, gates all three stores), and mutations are awaited
with inline `role="alert"` failure lines in the forms. Follow this pattern (not a new
one) when adding v2 screens. Onboarding is a local wizard draft until "Finish setup"
PUTs the goal and profile; "onboarding complete" is derived (the profile exists
server-side), not stored. In Jest, `jest.setup.ts` installs an in-memory `/api/*` fake
before every test; `seedRuns()`/`seedProfile()`/`seedGoal()` from
`src/test/runsApiMock.ts` replace localStorage seeding.

Two deliberate variations exist. `frontend/src/lib/eventParticipants.ts`
(RUN-69) holds **per-event** data, not app-wide data, so its cache is a single
slot for whichever event is open rather than a map, and its loading/error states
live in the cards themselves instead of a screen-level boundary. Copy that shape
for the next per-entity store, and the app-wide one for everything else. It is
the shape the later per-entity stores did copy: `publicProfile.ts` (RUN-63, one
open profile), `leaderboard.ts` (RUN-70, one open week) and `userSearch.ts`
(RUN-62, one open search query, whose load token is what stops a slow "an" from
landing on top of "ana").

`frontend/src/lib/notifications.ts` (RUN-66) is app-wide but **ungated**: the
bell it feeds is rendered by `PageHeader`, so it sits on every sidebar-reachable
screen, and it is nobody's reason for visiting any of them. A failed read
therefore means no unread indicator, never a blocked screen. It loads
only the newest page (the panel is a dropdown, not a list screen), takes its
badge count from the server envelope, and re-reads whenever the panel opens
without blanking the rows already on screen. Put a store behind `AppDataBoundary`
unless, like this one, it decorates every screen rather than being one.

**Configuration goes through ConfigService.** `ConfigModule.forRoot({ isGlobal: true })`
is registered in `backend/src/app.module.ts`, so it reads `backend/.env` at startup and
`ConfigService` is injectable everywhere without re-importing the module. Read values
through `ConfigService`, as `main.ts` does, rather than scattering `process.env` through
the code.

**Third-party calls go out through a backend proxy, never from the browser (RUN-53).**
`backend/src/routes/` is the pattern and currently the only instance: the browser POSTs
coordinates to `POST /api/routes/plan` and the backend calls openrouteservice with a key
that lives in `ROUTING_API_KEY` and never enters any bundle. Three things about it are
deliberate and worth copying. It is the one feature module with **no** `PrismaModule`
import, because planning is stateless. Its config is **optional**, unlike
`DATABASE_URL`/`JWT_SECRET`: a clone with no routing key boots and every other feature
works, and only this endpoint answers 503. And every provider failure is mapped to a
**typed error body** (`{ statusCode, code, message }`, codes in `ROUTE_PLAN_ERRORS`) so
the caller can tell a rate limit from an unroutable point; a raw provider error or a
generic 500 reaching the browser is the bug that mapping exists to prevent. Outbound HTTP
uses Node's global `fetch` with `AbortSignal.timeout` - the backend has no HTTP client
dependency and does not need one.

**The database is PostgreSQL through Prisma 7 (RUN-46).** The schema is
`backend/prisma/schema.prisma`, the migrations live in `backend/prisma/migrations/`, and
`docs/data-model.md` is the contract both the schema and the frontend types follow. Two
Prisma 7 surprises worth knowing before they bite: the connection URL is **not** in the
schema file (v7 removed `url = env(...)`; the CLI reads `backend/prisma.config.ts`, the
runtime reads ConfigService inside `PrismaService`), and the client is **generated
TypeScript** in `backend/src/generated/` (gitignored, recreated by the `postinstall`
script). Feature modules import `PrismaModule` explicitly - it is deliberately not
`@Global` - and inject `PrismaService`, the app's single database entry point.

**API response contract is hand-mirrored, and that is a known wart.** `HelloResponse`
is declared in `backend/src/app.service.ts` (the source of truth) and copied by hand
into `frontend/src/app/page.tsx`. Change a response shape and you must edit both. The
intended fix is generating frontend types from an OpenAPI spec, but the backend does not
expose one yet.

## Environment variables

Copy the templates, then fill in values. Both real files are gitignored.

| App      | Template                | Real file             | Variables                                                                                                                     |
| -------- | ----------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Backend  | `backend/.env.example`  | `backend/.env`        | `PORT` (default 3000), `FRONTEND_URL` (CORS origin, default `http://localhost:4200`), `DATABASE_URL` (**required**, no default), `JWT_SECRET` (**required**, min 32 chars, generation one-liner in the template), `ROUTING_API_KEY` + `ROUTING_BASE_URL` (both **optional**, RUN-53 route planning) |
| Frontend | `frontend/.env.example` | `frontend/.env.local` | `BACKEND_URL` (default `http://localhost:3000`)                                                                                 |

The frontend runs on its defaults with no `.env.local` at all. The backend **no longer
does** (since RUN-46): `DATABASE_URL` and `JWT_SECRET` (since RUN-56) are required and
the boot fails without either, because
`PrismaService` connects at startup. See `docs/data-model.md` for the one-time database
setup.

Note the filename difference: Nest reads `.env`, Next.js reads `.env.local`.

**Never give a server-only secret a `NEXT_PUBLIC_` prefix.** `BACKEND_URL` deliberately
has no prefix because it is read server-side only; a `NEXT_PUBLIC_` variable is inlined
into the browser bundle and is therefore public forever.

Config validation is a plain function, not Joi: `backend/src/config/env.validation.ts`
runs at boot via `ConfigModule`'s `validate` option and fails fast with every problem
listed at once. New required variables belong in that function, not in ad-hoc checks at
first use.

## What is in `.claude/`

This repo ships Claude Code configuration. Knowing what is there prevents both
reinventing it and being surprised by it.

**Skills.** A skill is invoked by its own name, so the slash command is the full name in
the left column (`/repo-dev-setup`). You do not have to remember them: each skill's
description also matches plain requests, so "set me up locally" reaches `repo-dev-setup`
on its own. The short forms quoted inside the descriptions (`/dev-setup`, `/commit`) are
matching phrases, not registered commands.

| Skill             | What it does                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repo-dev-setup`  | First-time local setup, both apps. Start here on a fresh clone                                                                                                     |
| `repo-commit`     | Analyses changes, runs per-app lint/test, writes Conventional Commit messages, guards against committing to `main`                                                 |
| `repo-secrets`    | Manages `.env` files from templates, explains where real secrets live                                                                                              |
| `repo-jira`       | Creates/estimates/transitions Jira issues over MCP. Needs a Jira MCP server; see `.claude/skills/repo-jira/references/jira-access.md` for the two supported setups |
| `repo-review-prs` | Fetches open PRs via `gh` and reviews unreviewed ones                                                                                                              |
| `backend-nestjs`  | Passive reference library, 12 NestJS rules across 7 categories. Consulted when writing backend code                                                                |
| `frontend-nextjs` | Passive reference library, 16 Next.js/React rules. Consulted when writing frontend code                                                                            |

**Agents** (delegated subtasks with their own context): `code-reviewer`, `debugger`,
`test-automator`, `nestjs-specialist` and `nextjs-specialist` (these two fetch and
synthesise the live official docs, which is different from the passive rule libraries
above), and `linus-reviewer` (a deliberately blunt review persona; it has no tools, so
paste the diff into the prompt).

**Permissions.** `.claude/settings.json` is committed and applies to everyone. Notably,
`Edit` and `Write` are **not** pre-approved, so Claude asks before every file change and
you see the diff before it lands. Every decision in that file is explained in
`.claude/SETTINGS.md`, because JSON cannot hold comments. Personal preferences belong in
`.claude/settings.local.json`, which is gitignored.

`.claude/commit-checks.md` is a generated cache read by `repo-commit`. Regenerate it
with `/repo-commit refresh-checks` when it goes stale.

## Git workflow

**HARD RULE: never commit or push directly to `main`.** Branch first. `settings.json`
puts `git push` behind a confirmation prompt to give this rule a real barrier rather
than just an instruction.

Branch format: `{type}/DEMO-{number}-{slug}`, for example
`feat/DEMO-160-user-profile-card`.

**Conventional Commits are enforced** by a `commit-msg` hook running commitlint. The
allowed types are restricted (see `commitlint.config.js`): `build`, `chore`, `ci`,
`docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`. Anything else is
rejected, including a bare description with no type.

**pre-commit** runs `lint-staged` (`.lintstagedrc.js`): per-app `eslint --fix`, then
Prettier. ESLint is invoked from each app's own directory so its config and plugins
resolve correctly, which is why you should not try to lint one app from the other's cwd.

**Backend tests are not run on commit.** The hook prints a reminder only, because they
are slow. CI runs them on every PR, but run them locally before pushing backend changes.

Prettier config is split: root and frontend use `printWidth: 100` with `singleQuote`;
the backend has its own `backend/.prettierrc`.

## CI

`.github/workflows/ci.yml` runs four jobs in parallel on every PR and on pushes to
`main`:

- **backend**: Postgres 18 service container, `prisma migrate deploy`, then lint, build,
  unit tests, e2e (the e2e suite connects to that database at startup)
- **frontend**: lint, unit tests, build
- **e2e**: its own Postgres 18 service container, then the Playwright suite (`e2e/`)
  against the real stack - Playwright's webServer boots the backend and frontend itself.
  Test isolation is per device account, not per database wipe; the strategy is
  documented in `e2e/README.md`
- **conventions**: commitlint over the PR's commit range

A repo-wide `prettier --check` step exists but is **intentionally commented out**: 55
files predate the Prettier config and the step would fail immediately on a fresh clone.
To enable it, run `npx prettier --write .` once, commit the result, then uncomment.

## Not yet built

Treat these as planned, not available. This section exists so you do not build on
something that is not there.

- **The frontend `/api/chat` route handler.** No route handler exists, and the env
  template deliberately declares no model-provider key. Add whichever variable your
  provider needs when you build the route, server-side only and never behind
  `NEXT_PUBLIC_`. Related: `@google/genai` was once present in `frontend/node_modules`
  while absent from `package.json`, so a clean install removes it. Declare any SDK
  properly rather than relying on a leftover install.
- **Generated API types.** No OpenAPI spec, so `HelloResponse` is hand-mirrored between
  the two apps as described under Architecture.

`backend/README.md` is the stock NestJS starter README. Ignore it as a source of truth
for this project.

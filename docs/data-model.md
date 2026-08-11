# Run Log Tracker - Data model contract

The single source of truth for how Run Log data is shaped, where it lives today, and what
the database schema will look like if/when persistence moves to the backend. Derived from
tech spec section 3, reconciled with the code that already exists on `develop`.

Read this before adding a field anywhere: the TypeScript types in `frontend/src/lib/` and
the Prisma schema in `backend/prisma/schema.prisma` must stay mirrors of each other, and
this document explains the conventions both follow.

---

## Where data lives today

Mid-migration, deliberately in two halves. Runs moved to PostgreSQL behind the API
(RUN-48); the onboarding-era entities are still localStorage until RUN-50:

| Entity | Type lives in | Persisted in | Introduced by |
| --- | --- | --- | --- |
| Run | `frontend/src/lib/runs.ts` | PostgreSQL via `/api/runs` (RUN-48) | RUN-23 |
| Device session | `frontend/src/lib/session.ts` | `runlog.session` (localStorage) | RUN-48 |
| Profile | `frontend/src/lib/onboarding.ts` | `runlog.profile` (localStorage) | RUN-8 |
| Onboarding flag | `frontend/src/lib/onboarding.ts` | `runlog.onboardingComplete` | RUN-8 |
| Goal | `frontend/src/lib/goal.ts` | `runlog.goal` (localStorage) | RUN-10 |
| Default goal | `frontend/src/lib/goal.ts` | `runlog.defaultGoal` (localStorage) | RUN-38 |
| Applied goal | `frontend/src/lib/goal.ts` | `runlog.appliedGoal` (localStorage) | RUN-33 |
| Plan stamp | `frontend/src/lib/plan.ts` | `runlog.plan` (localStorage) | RUN-32 |

## The frontend API pattern (decided in RUN-48, reuse everywhere)

RUN-48 decided the app-wide async pattern once; the profile/goal migration (RUN-50) and
every v2 screen reuse it rather than inventing another:

- **Same-origin calls, proxied.** The browser calls `/api/*` on the frontend's own
  origin; `next.config.ts` rewrites that to the backend server-side. `BACKEND_URL`
  stays a server-only variable and CORS never enters the picture.
- **The device is the account, minted lazily.** The design draws no login ("No password
  needed - your runs stay on this device", WEL-4) while the API requires a Bearer token
  (RUN-56/57). `frontend/src/lib/session.ts` reconciles the two: a synthetic per-device
  identity (`runner-<random>@device.runlog` + random secret, stored in `runlog.session`)
  is created only when something real needs the server - never on a page view, so
  crawlers and incognito visits create no accounts. A device with no session and no v1
  data reads as an empty log without any network. The stored secret is a deliberate,
  documented trade-off (see the header of `session.ts`); it dies with RUN-50. The
  in-memory session is the source of truth and localStorage only persists it, so
  blocked storage degrades durability, never identity. `apiFetch()` attaches the token,
  times out hung requests (8s), and retries once on 401 with a silent re-login.
- **One-time v1 import.** Data still under the old `runlog.runs` key is imported into
  the device account on first load (oldest first, resumable after transient failures),
  then the key is deleted. Rows the stricter API rejects (RUN-47 rules the v1 forms
  never enforced) are dropped and counted, never allowed to wedge the app; the user
  sees a dismissible notice with the count.
- **Reads: cache + screen-level gate.** Stores keep an in-memory cache behind
  `useSyncExternalStore`; hooks stay synchronous (`useRuns(): Run[]`). Each screen
  renders through one `RunsBoundary`: blank for the first 250 ms (no spinner flash on
  the fast local API), then an honest spinner, then either content or one error card.
  Retryable failures (network, timeout, 5xx) get "Try again"; terminal ones (the device
  identity cannot authenticate) explain the way out instead. `useRuns()` throws in
  development when read while loading outside a boundary, so a forgotten gate cannot
  ship a false empty state. v1 designs no loading or error states; this is the
  design-review note for that gap.
- **Writes: pessimistic, awaited.** Mutations return promises; forms disable their
  submit while saving and keep themselves open with an inline `role="alert"` line on
  failure. No optimistic UI: a run the user believes is saved must actually be saved.
  A mutation landing while the store is not 'ready' triggers a real reload instead of
  merging into an unknown state.
- **Cross-tab liveness is gone with the `storage` event** (runs only): another tab's
  writes appear on the next full load. Accepted; BroadcastChannel can restore it later.
- **Pure helpers live apart from state**: types, formatters and selectors are in
  `frontend/src/lib/runMath.ts` (stateless, safe anywhere); the store in `runs.ts`
  re-exports them, so components import from `./runs` as always.

`backend/prisma/schema.prisma` is the **agreed future shape** of the same data for a
PostgreSQL database. It is inert until someone installs Prisma and runs a migration (see
"Adopting the database" below); it exists now so frontend types and the eventual DB never
diverge.

## Conventions (both sides follow these)

- **IDs are strings.** The frontend generates compact random strings; the DB uses `cuid()`.
  Never integers, so nothing breaks when storage moves.
- **Dates are calendar days, not timestamps**: `yyyy-mm-dd` strings in TypeScript, `DATE`
  columns in Postgres. A run belongs to a calendar day wherever the device is
  (`runs.ts#toIsoDate`). The only timestamps are audit fields (`updatedAt`).
- **Weeks start on Monday** and are identified by the ISO date of their Monday
  (`runs.ts#startOfWeek`). "Which week?" is always a string comparison.
- **Durations are integer seconds.** `42:15` and `1:18:44` are input/display shapes only
  (`parseDuration` / `formatDuration`).
- **Pace is never stored.** Always derived as `durationSeconds / distanceKm` (ADD-4).
- **Enums are capitalized string unions** matching the UI copy: effort is
  `'Easy' | 'Medium' | 'Hard'` (`EFFORT_LEVELS`), running level is
  `'Beginner' | 'Intermediate' | 'Advanced'`. Plain strings in the DB (portable across
  Postgres and SQLite), validated at the edge.
- **Optional text is `''`, optional dates are `null`** (see `Run.note` and
  `Goal.endDate`).

## Entities

### User (one per account, RUN-56)

The anchor entity of the v2 community phase, deliberately standalone: the single-row
`Profile` below stays untouched until the phase B per-user-scoping tasks decide how v1
data attaches to accounts. Community tasks (follow, notifications, events) hang off
`User.id`, not `Profile`.

| Field | Type | Notes |
| --- | --- | --- |
| email | string, UNIQUE | Stored trimmed + lowercased + NFC-normalized (one canonical spelling per account) |
| passwordHash | string | bcrypt, cost 12; never leaves the auth service in any response or log (RUN-56 AC4) |
| firstName | string | Non-empty, mirrors WEL-5 rules |
| lastName | string | Non-empty, mirrors WEL-5 rules |
| createdAt | timestamp | Audit field (the `updatedAt` convention above extends to `createdAt` here) |

The API endpoints are `POST /api/auth/signup` and `POST /api/auth/login`, both
returning `{ token, user }` with the JWT subject = user id. Passwords are capped at
72 UTF-8 **bytes** (not characters) because bcrypt silently truncates beyond that.
The privacy toggles (`profilePublic`, `showOnLeaderboard`, `showRoutes`) arrive
additively in RUN-64.

**Ownership (RUN-57).** Every other entity in this document carries a required
`userId` foreign key (cascade on user delete) and every endpoint except
`/api/auth/*` and `/api/hello` demands a `Authorization: Bearer <token>` header;
queries are scoped `WHERE userId` server-side, and a foreign id answers 404, never
403. Rows that existed before accounts were adopted by a **documented placeholder
user** (`legacy-placeholder-user`, email `legacy-data@runlog.invalid`): it exists in
every database that ran the `scope_entities_to_users` migration, cannot log in (its
stored hash's preimage was random and discarded), and simply holds pre-account data
until someone claims or deletes it. Response shapes are unchanged: `userId` never
appears in API responses, the owner is implicit in the token.

### Follow (one per follow edge, RUN-61)

One-directional edge in the community follow graph: `follower -> followee`
("friends" in the roadmap sense is simply two edges, one each way). The pair is
UNIQUE at the schema level, which is what makes the follow endpoint idempotent.

| Field | Type | Notes |
| --- | --- | --- |
| followerId | string FK -> User | The account doing the following; cascades on user delete |
| followeeId | string FK -> User | The account being followed; cascades on user delete |
| createdAt | timestamp | Orders the lists, newest first |

The API is `POST`/`DELETE /api/users/:id/follow` (idempotent both ways; following
yourself is 400, following a nonexistent user 404) plus `GET /api/me/followers` and
`GET /api/me/following`, paginated with `?page` (1-based) and `?pageSize` (default
20, max 100). List items carry `{ id, firstName, lastName, followsYou, youFollow }`
and the envelope carries `{ total, page, pageSize, counts: { followers, following } }`.

### Profile (one per user since RUN-57)

| Field | Type | Notes |
| --- | --- | --- |
| firstName | string | Feeds greeting (DSH-2) and "Welcome, {name}" badge (GOAL-1) |
| lastName | string | With firstName derives avatar initials (SET-2); never uploaded |
| email | string | Format-validated (WEL-5, A1) |
| runningLevel | 'Beginner' \| 'Intermediate' \| 'Advanced' | Set once in onboarding (LVL-2); not editable after (by design, flagged) |
| defaultWeeklyGoalKm | number | Settings "Default weekly goal" (SET-3); seeds future weeks only (SET-6) |

`runningLevel` and `defaultWeeklyGoalKm` are not in `onboarding.ts` yet; RUN-11 and
RUN-38 add them to this same interface rather than creating new stores.

### Goal (one per user since RUN-57) + WeekTarget (one per user per week)

This resolves the one question the spec leaves open. SET-6 says the default target is
"applied to each new week", and the coach's previous plans show "Target 20 km · ran
21.4 km" with Hit/Missed chips per past week (AIC-7). A single mutable target cannot
reproduce that history, so the target is **snapshotted per week**:

- **Goal** is the onboarding record (RUN-10): `{ km, startDate, endDate | null }`, bounds
  0-60 km (GOAL-2, A17).
- **WeekTarget** is `{ weekStart, targetKm }`, at most one per user per week
  (`(userId, weekStart)` unique since RUN-57, Monday ISO date). The first time a week is displayed or evaluated, its row is created
  from the goal's current km. After that the row is the truth for that week.
- "Apply to weekly goal" (AIC-5, A15) updates the **current week's** WeekTarget only.
- Changing the Settings default (SET-6) changes what **future** weeks snapshot; existing
  rows never change retroactively.
- Hit/Missed for a past week = `totalsForWeek(runs, weekStart).distanceKm >= targetKm`.

WeekTarget does not exist in code yet; it lands with RUN-17 (weekly goal card) or RUN-33
(apply action), whichever needs it first.

### Run

Exactly as implemented in `runs.ts` (RUN-23):

| Field | Type | Notes |
| --- | --- | --- |
| id | string | Generated on save |
| routeName | string | Required (ADD-7, A12) |
| distanceKm | number | > 0, one decimal shown (ADD-5) |
| durationSeconds | number | > 0; parsed from mm:ss or h:mm:ss (ADD-6) |
| date | yyyy-mm-dd | Defaults to today (ADD-7) |
| effort | Effort | Defaults to 'Medium' (ADD-8) |
| note | string | Only optional field; `''` when absent |

Start time, elevation and route type from Run detail (DET-7) are **deliberately absent**:
they are display-only fields no form captures (assumption A10). If the designer answers
how they are captured, they join as nullable fields in both places.

### CoachPlan (one per generation)

Planned shape for RUN-32/RUN-35; not implemented yet:

| Field | Type | Notes |
| --- | --- | --- |
| id | string | |
| weekStart | yyyy-mm-dd | Monday of the week the plan targets |
| suggestedTargetKm | number | "22 km SUGGESTED TARGET" (AIC-4) |
| deltaVsLastWeekPct | number | "+10% VS LAST WEEK" |
| sessions | string | "3-4" |
| keyWorkout | string | "1 tempo" |
| narrative | string | The explanation paragraph |
| updatedAt | timestamp | Drives "updated 2h ago" (AIC-3) |

Regenerating creates a new row for the same week; the newest row per week is the current
plan, older weeks' newest rows are "Previous plans" (AIC-7). `ranKm` and the Hit/Missed
outcome are derived from runs and WeekTarget, never stored.

## Never stored (always derived from runs)

Personal records (all six of RUN-10..12), weekly totals and goal progress (DSH-3..5),
the 8-week chart series (DSH-7), coach insight numbers (AIC-6), pace everywhere.
Recomputing on every read is the mechanism behind RUN-11 ("records fill in
automatically"), DEL-3 and A18, and it is why deleting a run can never leave a stale
record behind.

## Adopting the database (live since RUN-46)

The schema is no longer inert: Prisma 7 and the initial migration landed with RUN-46.
No Docker needed; a locally installed PostgreSQL works fine. On a fresh clone:

1. Create an empty database once: `CREATE DATABASE runlog;`
2. Set `DATABASE_URL` in `backend/.env` (template in `backend/.env.example`):
   `DATABASE_URL="postgresql://postgres:<password>@localhost:5432/runlog"`
   Since RUN-56 the boot also requires `JWT_SECRET` (min 32 chars); the template
   carries a one-liner that generates it.
3. `cd backend && npm install` - also generates the Prisma client into
   `backend/src/generated/prisma` (gitignored) via the `postinstall` script.
4. `npx prisma migrate dev` - applies the committed migrations from
   `backend/prisma/migrations/`, giving everyone an identical database.

Prisma 7 wiring, for anyone touching it:

- The connection URL lives in **two places on purpose**, both reading
  `backend/.env`: `backend/prisma.config.ts` feeds the CLI (migrate, studio),
  and `PrismaService` feeds the runtime client through ConfigService with a
  `pg` driver adapter. The schema file itself has no URL (Prisma 7 removed it).
  Run Prisma CLI commands **from `backend/`**: both the dotenv lookup and the
  schema path in `prisma.config.ts` are cwd-relative, so from the repo root
  the CLI reports "url is missing" even when `.env` is perfectly fine.
- `PrismaService` (`backend/src/prisma/`) is the app's single database entry
  point. `PrismaModule` is deliberately not `@Global`: feature modules that
  talk to the database import it explicitly and inject the service, so the
  imports arrays stay an honest map of who touches persistence.
- Schema changes: edit `prisma/schema.prisma`, run
  `npx prisma migrate dev --name <change>`, commit the new migration folder
  together with the schema change. `migrate dev` is a development command;
  CI and any deployed database use `npx prisma migrate deploy`, which only
  applies committed migrations and never generates or resets anything.
- **The Jest configs carry Prisma 7 workarounds**, kept in one place:
  `backend/jest.shared.js`, consumed by both `jest.config.js` (unit) and
  `test/jest-e2e.config.js` (e2e), with the exact error each workaround
  prevents commented at the point of use. Short version: the generated
  client loads its WASM query compiler with a dynamic `import()`, which
  under the app's `nodenext` tsconfig survives to runtime and kills Jest's
  CommonJS VM with "A dynamic import callback was invoked without
  --experimental-vm-modules". The ts-jest override (`module: commonjs` +
  `moduleResolution: node10` + `resolvePackageJsonExports: false`) makes tsc
  downlevel that `import()` to a `require` of what is verifiably a CJS file,
  and the `moduleNameMapper` entry strips the ESM-style `.js` suffix from
  the generated client's relative imports ("Cannot find module './enums.js'"
  otherwise). The cost is that tests resolve modules under older rules than
  the production build; the build step and the e2e-against-real-Postgres run
  in CI are what keep that divergence honest. Delete `jest.shared.js` the
  day Prisma's generated client loads cleanly under Jest's default CJS
  environment.

## API validation (RUN-47)

The runs endpoints (`/api/runs`) validate with class-validator DTOs mirroring the
frontend rules: routeName non-empty, distanceKm > 0, durationSeconds integer > 0, date
a real `yyyy-mm-dd` calendar day, effort one of the capitalized levels, note optional.
Three server-side specifics worth knowing:

- **"Not in the future" allows one day of slack.** The server cannot know the client's
  zone: a runner in Sydney is on "tomorrow" relative to a UTC server for the first
  hours of their day. The API therefore accepts dates up to tomorrow in UTC; the strict
  "today" rule of RUN-23 AC7 stays in the form, where the user's zone is known.
- **Free-text bounds are API-side additions**: routeName is trimmed and capped at 120
  characters, note at 2000. The v1 forms enforce no lengths, so these exist to keep a
  stray script from storing megabytes in unbounded TEXT columns, not to police real
  input.
- **Explicit `null` is always a 400**, on create and on PATCH. Omitting `effort` or
  `note` means "use the defaults" (`Medium`, `''`); sending `null` for anything is
  rejected in validation rather than reaching a NOT NULL column as a 500.

## Test database

`npm run test:e2e` never touches the development database. The suite derives its own
URL (`DATABASE_URL_TEST` if set, otherwise the `DATABASE_URL` database name plus a
`_test` suffix, e.g. `runlog_test`), creates and migrates that database automatically
on first run, and refuses to start against any database whose name does not end in
`_test`, because the tests delete rows between cases. See `backend/test/test-database.ts`.

The frontend keeps the same types and swaps localStorage calls for API calls; nothing in
the components changes shape. RUN-48 made that swap for runs; RUN-50 does profile/goal.

# Run Log Tracker - Data model contract

The single source of truth for how Run Log data is shaped, where it lives today, and what
the database schema will look like if/when persistence moves to the backend. Derived from
tech spec section 3, reconciled with the code that already exists on `develop`.

Read this before adding a field anywhere: the TypeScript types in `frontend/src/lib/` and
the Prisma schema in `backend/prisma/schema.prisma` must stay mirrors of each other, and
this document explains the conventions both follow.

---

## Where data lives today

App data lives in PostgreSQL behind the API since RUN-48 (runs) and RUN-50 (the
onboarding-era entities). What remains in localStorage is device-scoped by nature:

| Entity | Type lives in | Persisted in | Introduced by |
| --- | --- | --- | --- |
| Run | `frontend/src/lib/runs.ts` | PostgreSQL via `/api/runs` (RUN-48) | RUN-23 |
| Profile (incl. level + default goal) | `frontend/src/lib/onboarding.ts` | PostgreSQL via `/api/profile` (RUN-50) | RUN-8 |
| Goal | `frontend/src/lib/goal.ts` | PostgreSQL via `/api/goal` (RUN-50) | RUN-10 |
| Week targets | `frontend/src/lib/goal.ts` | PostgreSQL via `/api/week-targets` (RUN-50) | RUN-17/33 |
| Device session | `frontend/src/lib/session.ts` | `runlog.session` (localStorage) | RUN-48 |
| Onboarding wizard draft | `frontend/src/lib/onboarding.ts` | `runlog.onboardingDraft` (localStorage) | RUN-50 |
| Plan stamp | `frontend/src/lib/plan.ts` | `runlog.plan` (localStorage) | RUN-32 |

Gone with RUN-50 (their v1 localStorage keys are imported once, then deleted):
`runlog.profile`, `runlog.onboardingComplete`, `runlog.level`, `runlog.goal`,
`runlog.defaultGoal` (now `Profile.defaultWeeklyGoalKm`), `runlog.appliedGoal` (now a
`PUT /api/week-targets/:weekStart`). "Onboarding complete" is no longer stored at all:
it is derived - the profile existing on the server IS the completed onboarding. The
wizard draft holds a visitor's half-finished setup answers locally on purpose: no
account exists until "Finish setup", so an abandoned wizard costs nothing server-side.

## The frontend API pattern (decided in RUN-48, reuse everywhere)

RUN-48 decided the app-wide async pattern once; the profile/goal stores follow it since
RUN-50 (three stores now: runs, profile, goal + week target) and every v2 screen reuses
it rather than inventing another:

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
- **One-time v1 import.** Data still under the v1 localStorage keys is imported into
  the device account on first load, then the keys are deleted. Runs (RUN-48): POSTed
  oldest first, resumable after transient failures; rows the stricter API rejects are
  dropped and counted, never allowed to wedge the app; the user sees a dismissible
  notice with the count. Onboarding data (RUN-50): a completed v1 onboarding becomes
  the account's goal + profile (level capitalized, the old default-goal km folded into
  `defaultWeeklyGoalKm`, an applied goal for the running week PUT as its week target);
  a half-finished or invalid one moves into the wizard draft instead, so the visitor
  finishes prefilled rather than the import wedging on a 400.
- **Reads: cache + screen-level gate.** Stores keep an in-memory cache behind
  `useSyncExternalStore`; hooks stay synchronous (`useRuns(): Run[]`,
  `useProfile(): ProfileRecord | null`, `useGoalTarget(iso): number`). Each screen
  renders through one `AppDataBoundary` (RunsBoundary until RUN-50), which gates all
  three stores: blank for the first 250 ms (no spinner flash on the fast local API),
  then an honest spinner, then either content or one error card. Retryable failures
  (network, timeout, 5xx) get "Try again" that reloads only the failed stores;
  terminal ones (the device identity cannot authenticate) explain the way out instead.
  `useRuns()` throws in development when read while loading outside a boundary, so a
  forgotten gate cannot ship a false empty state; `useProfile()` is deliberately soft
  (null while loading) because the sidebar footer legitimately reads it outside any
  boundary. v1 designs no loading or error states; this is the design-review note for
  that gap.
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
`userId` foreign key (cascade on user delete), with one structural exception:
pure edge tables like `Follow` (RUN-61) relate two users, so they carry two user
foreign keys (`followerId`, `followeeId`, both cascading) instead of a single
`userId` - the scoping rule still holds in spirit, every query pins the caller
to the relevant side of the edge. Every endpoint except
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
`GET /api/me/following`, paginated with `?page` (1-based, max 100000) and `?pageSize`
(default 20, max 100). An empty-but-present param (`?page=`) means "use the default";
unknown query params are rejected like unknown body fields (the app-wide whitelist
pipe). List items carry `{ id, firstName, lastName, followsYou, youFollow }` and the
envelope carries `{ total, page, pageSize, counts: { followers, following } }`.

### Notification (one per delivered notification, RUN-65)

The bell's storage. Rows are only ever created by the social actions that cause
them, inside those actions' transactions - a follow and its notification (or a
run and its fan-out) commit together or not at all, which is what makes "exactly
one notification per action" hold under retries.

| Field | Type | Notes |
| --- | --- | --- |
| userId | string FK -> User | The recipient (whose bell it lands in); cascades on user delete |
| type | string | `new-follower` \| `followed-ran` \| `event-joined` (the last written by event joins since RUN-67) |
| payload | json | Self-contained snapshot taken at write time, see below |
| readAt | timestamp, nullable | null = unread; set once by mark-read, never moved |
| createdAt | timestamp | Orders the bell, newest first |

The payload is deliberately **self-contained**: the actor's id and name (and for
`followed-ran` the run's id and headline stats: routeName, distanceKm,
durationSeconds, date) are copied in when the notification is written, never
joined at read time. A later unfollow, account deletion or run delete therefore
cannot break rendering a notification that already landed. The cost is accepted
staleness: a renamed actor keeps their old name in old notifications.

One anti-spam bound on `new-follower` and `event-joined`: while the recipient
still has an **unread** notification from the same actor (for `event-joined`,
the same actor and event), a fresh action writes nothing, so a follow/unfollow
or join/leave loop cannot grow the bell by more than one row per actor. Reading
the notification re-arms it, keeping a genuine later re-follow or re-join
visible.

Fan-out is batched per run: one query for the follower ids, then `createMany` in
bounded chunks - never a query or insert per follower.

The API is `GET /api/me/notifications` (newest first, same pagination contract as
the follow lists, envelope `{ items, total, page, pageSize, unreadCount }`), plus
`POST /api/me/notifications/:id/read` and `POST /api/me/notifications/read-all`.
Both mark-read calls are idempotent; a repeat changes nothing and answers like
the first. Items carry `{ id, type, payload, readAt, createdAt }` with ISO
instant timestamps (the bell renders "2h ago", so these are the app's one
deliberate exception to the calendar-day rule).

### Event (one per community event, RUN-67) + EventParticipant (one per joined user per event)

Community events: any user creates one, others join or leave. The creator is the
**owner and first participant** in one atomic write, so an event never exists
without its creator in it - which is also why the owner cannot leave (400): their
membership is structural, not a preference.

| Field (Event) | Type | Notes |
| --- | --- | --- |
| name | string | Non-empty, bounded like every free-text field |
| description | string | Optional text is `''`, never null |
| startDate | date | Inclusive calendar day (yyyy-mm-dd in the API) |
| endDate | date | Inclusive; on/after startDate, validated on the merged pair for PATCH |
| targetKm | number, nullable | Optional collective distance goal; Float like Run.distanceKm |
| createdAt | timestamp | ISO instant in the API, like Notification's |
| ownerId | string FK -> User | Cascades on user delete: an event does not outlive its owner |

| Field (EventParticipant) | Type | Notes |
| --- | --- | --- |
| eventId | string FK -> Event | Cascades on event delete |
| userId | string FK -> User | Cascades on user delete |
| createdAt | timestamp | When they joined; not exposed in the API yet |
| (eventId, userId) | unique | A repeat join is impossible at the schema level, so the API treats it as an idempotent no-op (the Follow construction) |

The lifecycle state - `upcoming` | `active` | `finished` - is **derived from the
dates against today's UTC day at read time, never stored** (a stored state would
go stale at every midnight). The dates are inclusive: an event is active on its
start and end days themselves.

The API is `GET`/`POST /api/events` (list is paginated with the shared contract,
envelope `{ items, total, page, pageSize }`, ordered chronologically by start
day, filterable with `?state=`), `GET /api/events/:id`, `POST`/`DELETE
/api/events/:id/join`, and owner-only `PATCH`/`DELETE /api/events/:id` (a
non-owner gets 404, never 403 - same rule as every scoped entity). Items carry
`{ id, name, description, startDate, endDate, targetKm, state, participantCount,
joined, mine, owner: { id, firstName, lastName }, createdAt }`; `joined` is the
caller's own participation and `mine` their ownership (RUN-68), so the list alone
renders Join/Leave buttons and knows which cards must not offer Leave - the
device-session frontend does not track its own user id, so the API answers the
ownership question instead of making the client compare ids. Both membership
verbs answer the **updated event** (RUN-68 review fix): the card that clicked
learns the flipped flag and the fresh participant count in one round trip,
instead of a follow-up read that could fail after the membership already
changed. Leaving an event never joined is an idempotent 200; an unknown event
is 404 for both verbs. A join
notifies the owner (`event-joined`, see Notification above) in the same
transaction; the owner joining their own event and repeat joins never notify.

### Profile (one per user since RUN-57)

| Field | Type | Notes |
| --- | --- | --- |
| firstName | string | Feeds greeting (DSH-2) and "Welcome, {name}" badge (GOAL-1) |
| lastName | string | With firstName derives avatar initials (SET-2); never uploaded |
| email | string | Format-validated (WEL-5, A1) |
| runningLevel | 'Beginner' \| 'Intermediate' \| 'Advanced' | Set once in onboarding (LVL-2); not editable after (by design, flagged) |
| defaultWeeklyGoalKm | number | Settings "Default weekly goal" (SET-3); seeds future weeks only (SET-6) |

`runningLevel` and `defaultWeeklyGoalKm` live on the same `ProfileRecord` in
`onboarding.ts` since RUN-50 - one record, not separate stores. The level is
capitalized everywhere now; the lowercase spellings were a v1 localStorage relic.

The API is `GET`/`PUT /api/profile` (RUN-49): one resource per account, no id in the
routes or the response - the owner is the token. GET answers 404 until the first PUT,
which is the signal RUN-50 derives the onboarding gate from (a profile exists exactly
when onboarding finished). PUT is a full replace: every field required, so the row can
never end up half-written and re-sending a payload is a no-op. `runningLevel` is
capitalized in the API and the database whatever casing the v1 store used.

**SET-6 is server-enforced**: changing `defaultWeeklyGoalKm` on an existing profile
first materializes every Monday a client could honestly call "the current week"
(at most two, at a week boundary) under the OLD goal state, so the running week's
snapshot is frozen before the new default lands. The first PUT ever (onboarding
finishing) skips the freeze: nothing is changing yet, and RUN-50 may save the
profile before the goal.

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

The API (RUN-49):

- `GET`/`PUT /api/goal` - the onboarding goal, one per account, 404 until the first
  PUT. Full replace; `endDate` omitted and `endDate: null` both mean "No end date".
  Replacing the goal never rewrites existing WeekTarget rows; while the account has
  no profile (so `goal.km` is the active seed), changing `km` first freezes the
  running week under the old value, the same SET-6 rule the profile default follows.
- `GET /api/week-targets/:weekStart` - get-or-create, where creation is allowed only
  for the current week: reading the week you are in is what materializes it, seeded
  from `profile.defaultWeeklyGoalKm`, else `goal.km`, else the 20 km fallback - the
  same resolution order as the frontend's `resolveGoalTarget`. A past week that was
  never materialized while live answers 404 ("no target was recorded"), never a row
  seeded from today's state - that would fabricate Hit/Missed history. A future week
  404s too: it snapshots when it arrives, under whatever default is in force then.
  `weekStart` must be a real Monday (400 otherwise, naming the correct one).
- `PUT /api/week-targets/:weekStart { targetKm }` - "Apply to weekly goal", allowed
  only for the current week. The server cannot know the client's timezone, so
  "current" means the Mondays of the local calendar day at the two real-world offset
  extremes (UTC-12 and UTC+14): one Monday most of the week, two only while the week
  boundary crosses the globe (Sunday 10:00 UTC to Monday 12:00 UTC). Past weeks are
  immutable history; future weeks are refused. `targetKm` accepts 0 (the slider does)
  and deliberately exceeds the 60 km slider cap - the coach can suggest more - up to
  a 1000 km sanity ceiling.
- `GET /api/week-targets` - every materialized week, newest first, for the Hit/Missed
  history.

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

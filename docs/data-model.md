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
| Account identity (name, email) | `frontend/src/lib/account.ts` | PostgreSQL (the User row) via `/api/account` (RUN-59) | RUN-56 |
| Profile (level + default goal) | `frontend/src/lib/onboarding.ts` | PostgreSQL via `/api/profile` (RUN-50) | RUN-8 |
| Goal | `frontend/src/lib/goal.ts` | PostgreSQL via `/api/goal` (RUN-50) | RUN-10 |
| Week targets | `frontend/src/lib/goal.ts` | PostgreSQL via `/api/week-targets` (RUN-50) | RUN-17/33 |
| Privacy settings | `frontend/src/lib/privacy.ts` | PostgreSQL via `/api/privacy` (RUN-64) | RUN-64 |
| Session (JWT + email) | `frontend/src/lib/session.ts` | `runlog.session` (localStorage) | RUN-48, reshaped by RUN-58 |
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
RUN-50 and the privacy store since RUN-64 (four stores now: runs, profile, goal + week
target, privacy) and every v2 screen reuses it rather than inventing another:

- **Same-origin calls, proxied.** The browser calls `/api/*` on the frontend's own
  origin; `next.config.ts` rewrites that to the backend server-side. `BACKEND_URL`
  stays a server-only variable and CORS never enters the picture.
- **Real sign in (RUN-58).** Identity comes from the Sign in / Sign up screens; the v1
  "device is the account" bridge (a silently minted `runner-<random>@device.runlog`
  identity with a stored secret) is gone. `runlog.session` now stores ONLY the JWT and
  the account email - never a password. Every guarded screen sits behind
  `RequireSession` (signed out lands on `/signin`); the setup steps run AFTER signup,
  which also seeds the wizard draft with the names/email it collected. `apiFetch()`
  attaches the token and times out hung requests (8s); a 401 signs the user out cleanly
  and lands on Sign in - there is no refresh endpoint to retry against (that follow-up
  is RUN-74). A signed-out visitor reads as empty data without any network. With
  blocked storage (private browsing) the session cannot survive the post-auth page
  load, so the Sign in / Sign up screens refuse to navigate and show an inline error
  instead of a silent bounce-back loop.
- **One-time v1 runs import.** Runs still under the v1 `runlog.runs` key are imported
  into the SIGNED-IN account on first load, then the key is deleted: POSTed oldest
  first, resumable after transient failures; rows the stricter API rejects are dropped
  and counted, never allowed to wedge the app; the user sees a dismissible notice with
  the count. The v1 onboarding-data import (RUN-50) died with RUN-58: a v1 device's
  minted account has no password its user could ever type, so there is no account to
  import into.
- **Reads: cache + screen-level gate.** Stores keep an in-memory cache behind
  `useSyncExternalStore`; hooks stay synchronous (`useRuns(): Run[]`,
  `useProfile(): ProfileRecord | null`, `useGoalTarget(iso): number`,
  `usePrivacy(): PrivacySettings`). Each screen
  renders through one `AppDataBoundary` (RunsBoundary until RUN-50), which gates all
  four stores: blank for the first 250 ms (no spinner flash on the fast local API),
  then an honest spinner, then either content or one error card. Retryable failures
  (network, timeout, 5xx) get "Try again" that reloads only the failed stores;
  terminal ones (an expired session, which also signs the user out) explain the way
  out instead.
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
| profilePublic | boolean, default false | Opt-in: other runners may open this account's public profile (RUN-64; the page itself is RUN-63) |
| showOnLeaderboard | boolean, default false | Opt-in to every leaderboard, global and per event. Pulled forward from RUN-64 by RUN-69, which cannot honour its own AC3 without it |
| showRoutes | boolean, default false | Opt-in: route maps are shown to whoever can see the profile (RUN-64; the maps themselves are RUN-55, which also trims what a visitor is sent) |
| createdAt | timestamp | Audit field (the `updatedAt` convention above extends to `createdAt` here) |

The API endpoints are `POST /api/auth/signup` and `POST /api/auth/login`, both
returning `{ token, user }` with the JWT subject = user id. Passwords are capped at
72 UTF-8 **bytes** (not characters) because bcrypt silently truncates beyond that.

**Privacy settings (RUN-64).** The three toggles are `GET`/`PUT /api/privacy`: one
resource per account, no id in the contract, body exactly
`{ profilePublic, showOnLeaderboard, showRoutes }`. The PUT is a full replace like
the profile and goal ones, every field required and strictly boolean - no truthy
coercion, because the one direction that must never happen by accident is a
setting switching ON. `showOnLeaderboard` landed early with RUN-69 (the event
leaderboard has to honour it to exist); `profilePublic` and `showRoutes` arrived
additively with RUN-64, which also shipped the Settings privacy card that flips all
three and issues its PUT alongside the profile's, from the same Save changes
button.

All three carry the decided default - **false, private, opt-in** - and the
migration adds them at that default too, so no existing account is ever published
by a deploy. Consequence worth knowing: leaderboards keep rendering their "nobody
is on leaderboards yet" state until runners opt in, and RUN-71's seeder opts its
demo users in explicitly. The gating rules live in `backend/src/common/privacy.ts`
(`appearsOnLeaderboard`, shared by the event leaderboard and RUN-70's global one;
`canViewProfile` and `canViewRoutes`, added by RUN-63 when the public profile
became their reader; `routeVisibility`, added by RUN-55, which answers *how much*
of a route rather than whether). All four are pure functions over the settings, so
the policy is testable without a database and no call site re-derives it.

**Reading another account (RUN-63).** `GET /api/users/:id` answers one runner's
public profile: `{ id, firstName, lastName, me, following, counts: { followers,
following }, visible, showRoutes, runs }`. `me` is the viewer looking at their
own profile and `following` their follow edge, both answered by the API for the
same reason the events list answers `mine` - the client does not track its own
user id.

The split at `visible` is the privacy rule, not a rendering hint. The header half
is always served, because AC2 wants the name, the counts and a working follow
button on a private profile too. The body half - `runs` - is **omitted** when
`canViewProfile` says no: `runs: null` means "not yours to see", while an empty
public log serves `[]`. The runs are never fetched and then filtered, so no gated
payload exists for a client to recover with devtools. Records and the weekly
distance chart are deliberately not separate fields: the frontend derives them
from this one list with the same helpers the dashboard uses, so a single gate
covers all three cards, and the read-only run detail at `/people/:id/runs/:runId`
reads the same list rather than a second endpoint that could forget it.

A **missing user is 404; a private user is not** - a private account is a normal
200 with a gated body, because it still has a header it is entitled to serve, and
403 is the wrong status for "you may read the header but not the body". Recorded
plainly, because an earlier draft of this paragraph claimed the opposite: those
two statuses side by side ARE an id enumeration oracle, and a 403 would have
revealed less. That is an accepted tradeoff rather than a property the endpoint
has; ids are `cuid()`, so there is no id space to walk. Do not "fix" it by
404ing private accounts - AC2 needs their header.

`showRoutes` is strictly narrower than `profilePublic` (the grant is the AND of
the two), and the owner overrides both on their own profile. Since RUN-55 the
grant is **three-valued rather than boolean** (`routeVisibility`): the owner gets
`'full'`, a granted visitor gets `'trimmed'` and everybody else `'hidden'`. A
trimmed route is the stored polyline with its **first and last ~300 m cut off**
server-side and its waypoints dropped, because a route that starts at the
runner's front door is their address, and the tapped points are exactly the two
ends the trim removes. The trim lives in `backend/src/runs/route-trim.ts`; it
drops whole points rather than interpolating to an exact 300 m mark, so it always
removes *at least* the trim distance. A route too short to trim (under ~600 m)
is **not served at all** rather than served whole - a `route: null` a viewer
cannot tell apart from "this run has no route". The endpoint lives in
`backend/src/users/`, alongside the search below.

**Searching for runners (RUN-62).** `GET /api/users?search=` answers the People
page: `{ items: [{ id, firstName, lastName, following }], total, page, pageSize,
counts: { followers, following } }`. It shares the `?page`/`?pageSize` contract
with the follow lists (1-based, default 20, max 100) and is **capped, not
unbounded** - the first page is what the UI shows, and `total` is what lets it
say "showing the first 20 of 43" instead of silently truncating.

Four rules make this endpoint what it is:

- **The caller is never a row.** You cannot follow yourself, so your own account
  would be the one result with no action on it.
- **Every whitespace-separated term must appear in one half of the name**, case
  insensitively, so "ana tes" finds Ana Tester and so does "tes ana"; neither
  term is pinned to a column. Terms are capped at four and the whole query at 60
  characters, because each term is another OR pair in the WHERE.
- **An absent or blank `search` lists nobody.** It is a valid request - the page
  reads it for the counts before anything is typed - but it never becomes a
  `LIKE '%%'` over every account. Nothing in the User table is touched at all.
- **A row carries names and the follow flag, nothing else.** Private accounts DO
  appear: their profile page still serves a header and a working follow button
  (RUN-63 AC2), so hiding them from search would only make them unfollowable.
  That is exactly why no run count, distance or any other unshared number may be
  added to this shape later.

`counts` is the caller's own, served with every answer including the empty-query
one. The frontend store (`frontend/src/lib/userSearch.ts`) keeps it across query
changes for that reason: it belongs to the account, not to the query.

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

**The detail page's one read (RUN-69).** `GET /api/events/:id/participants`
answers `{ items, total }` with one row per member: `{ id, firstName, lastName,
joinedAt, me, rank, totalKm, runCount, unverified }`, in join order, where `id` is the
**user's** id. The participant list and the leaderboard are the same set of
people counted two ways, so they travel together rather than as two endpoints.
This list is deliberately **not paginated**, unlike every other list in the API:
a leaderboard is only correct as a whole, and the set is bounded by one event's
membership rather than by the database.

`rank`, `totalKm`, `runCount` and `unverified` are one decision, not four - all
four are `null` exactly when that runner has `showOnLeaderboard` false. The numbers are
withheld rather than flagged, so an opted-out runner appears in the participant
list and no client can reconstruct their standing. `totalKm` is the sum of that
runner's run distances inside the event's **inclusive** window (a run on the
start or end day counts), computed by one `GROUP BY` at read time and never
stored, the same rule the event's own derived state follows. Ties share a rank
and the next distinct distance skips the places they consumed (1, 1, 3).

**The `unverified` marker (RUN-72).** True when at least one of that runner's
runs inside the window is past `RUN_OUTLIER_THRESHOLDS` (see API validation
below): faster than 3:30 /km or longer than 60 km. It is computed per **run**,
never from the aggregated total, because a window adding up to 80 km is a good
week while one 80 km run is the unusual thing - so it needs its own small read
of `{ userId, distanceKm, durationSeconds }` alongside the `GROUP BY` (the pace
rule compares two columns arithmetically, which no Prisma filter expresses
without raw SQL). That read is narrowed to the runners who are **on** the board,
so an opted-out runner's runs are never fetched at all. The flag changes nothing
about the ranking; the UI draws a subtle "unverified" note on the row.

### The global weekly leaderboard (RUN-70, stores nothing)

`GET /api/leaderboard[?weekStart=yyyy-mm-dd]` ranks every opted-in runner by the
kilometres they logged inside one **Monday-Sunday inclusive** week. It has no
entity of its own: the answer is derived at read time from `User` and `Run`, like
every other number in the "Never stored" section below.

`weekStart` may name **any** day; the server normalizes it to the Monday of that
day's week (the same week definition as the dashboard's `startOfWeek`) and echoes
the resolved `{ weekStart, weekEnd }` back, so a client never has to guess which
week it is looking at. Omitting it means the current week.

The envelope is `{ weekStart, weekEnd, items, me, total }`, where each row is
`{ id, firstName, lastName, rank, totalKm, runCount, me, unverified }` and `id`
is the **user's** id (the row links to their public profile). `unverified` is the
same per-run marker the event board carries, derived by the same helper and read
through the same opt-in gate (RUN-72). Nothing in a row is
nullable, unlike the event board's: a runner with `showOnLeaderboard` false is
**absent** here rather than present with withheld numbers, because a global board
has no membership list they would otherwise appear on. `me` repeats the caller's
own row outside `items` and is `null` **exactly** when the caller is opted out -
the one signal the page's banner needs, and one that names nobody else's setting.

`items` is capped at the top 50 while `total` counts every ranked runner, so the
caller's pinned row stays truthful when they rank far below the served slice. The
ranking is computed over **everyone**, never within the served slice: opted-in
runners with no runs that week tie at 0 km at the bottom rather than vanishing
from their own leaderboard. Ranking and rounding are shared with the event board
(`common/ranking.ts`, moved there by this ticket): ties share a rank, the next
distinct distance skips the places they consumed (1, 1, 3), and distances round
to **one** decimal, the precision the UI prints.

Two reads serve it, exactly one of them the aggregation: the opted-in users (for
their names, and so a runner who sat the week out still gets a row), then one
`GROUP BY` over the week's runs. The opt-in gate is expressed **inside** that
aggregation as a relation filter (`user: { showOnLeaderboard: true }`), not as an
id list built from the first read: an `IN` list would carry one bind parameter
per opted-in account and fail outright past Postgres' 65535-parameter cap. The
event board may pass ids because one event's membership is bounded; this one is
bounded only by the user table.

### Account identity (the User row, RUN-59)

| Field | Type | Notes |
| --- | --- | --- |
| firstName | string | Feeds greeting (DSH-2), the "Welcome, {name}" setup badge (GOAL-1) and every social surface |
| lastName | string | With firstName derives avatar initials (SET-2); never uploaded |
| email | string | Also the SIGN-IN credential: unique, normalized (trimmed, lowercased, NFC) on every write path |

`GET`/`PUT /api/account` (RUN-59), cached by `frontend/src/lib/account.ts`. This is
the app's **single source of truth** for a runner's name and email. It has to be:
events, follow, notifications and leaderboards all read the names off the `User`
row, so while the profile kept its own copies (RUN-49/50) a rename in Settings
changed the runner's own dashboard and nothing anyone else saw. RUN-59 dropped
those columns (migration `20260812000000_profile_drops_identity` first copies the
profile's names back onto the User row, so the spelling the user last chose is the
one that survives; the profile's email is deliberately not copied - `User.email` is
unique and the only rows where the two ever differed are v1 device-era accounts
that RUN-58 already made unreachable).

Keeping identity separate from the setup answers is also what makes setup
resumable: the account exists from signup, the profile only from "Finish setup",
so the setup steps can greet a runner by name on any device with nothing stored
locally (RUN-59 AC3).

A 409 on PUT means another account owns that email; the Settings form shows it
inline. Changing the email does not invalidate the session - the token carries the
user id, not the address.

### Profile (one per user since RUN-57, setup answers only since RUN-59)

| Field | Type | Notes |
| --- | --- | --- |
| runningLevel | 'Beginner' \| 'Intermediate' \| 'Advanced' | Set once in onboarding (LVL-2); not editable after (by design, flagged) |
| defaultWeeklyGoalKm | number | Settings "Default weekly goal" (SET-3); seeds future weeks only (SET-6) |

Both fields live on the same `ProfileRecord` in `onboarding.ts` - one record, not
separate stores. The level is capitalized everywhere now; the lowercase spellings
were a v1 localStorage relic.

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
| route | RunRoute \| null | The optional drawn route (RUN-54); `null` on every run saved without one |

Start time, elevation and route type from Run detail (DET-7) are **deliberately absent**:
they are display-only fields no form captures (assumption A10). If the designer answers
how they are captured, they join as nullable fields in both places.

**The route (RUN-54).** Three nullable columns on `Run` -  `routePolyline`,
`routeWaypoints`, `routeSource` - served as **one nullable object**:

```ts
interface RunRoute {
  polyline: string; // encoded polyline, precision 5 (RUN-53)
  waypoints: Array<{ lat: number; lng: number }>; // 2-5: [0] Start, last Finish; [] when trimmed
  source: string; // who drew it: 'openrouteservice' today
  trimmed: boolean; // RUN-55: the ends were cut off before sending
}
```

Six things about it are decisions, not accidents:

- **Columns separate, API shape nested.** The columns are what the roadmap and the
  ticket specify (and what lets `routeSource` be filtered later); the single `route`
  object is what makes the all-or-none invariant *structural* - there is no way to
  submit or receive a polyline with no waypoints, so there is no cross-field validation
  rule and no half-written route to store. A `CHECK` constraint
  (`Run_route_columns_all_or_none`) guards the same invariant from the database side,
  and reading a row that violates it anyway is a loud 500 that names the row, like a
  stored effort outside the vocabulary.
- **`routeSource` is server-assigned.** The polyline can only have come from
  `POST /api/routes/plan`, so the server already knows who drew it; a client-supplied
  provenance field would be a claim, not a fact. Sending one is rejected by the app-wide
  whitelist pipe. The stored value is the provider id (`'openrouteservice'`), not a bare
  `'routed'`: it answers *reconstruction or GPS truth* - the question RUN-55 needs for
  its dashed line - **and** which provider, which a bare flag throws away.
- **The waypoints are the runner's taps, not the polyline's points.** The polyline has
  hundreds of coordinates and cannot be turned back into the 2-5 points a picker can
  restore, move or remove - so those are stored alongside it (AC5). Index 0 is Start,
  the last is Finish, and up to `MAX_WAYPOINTS` (3, reused from the plan endpoint's cap
  so the two cannot drift) sit between them.
- **`null` is legal for this field only.** Omitting `route` on create means no route;
  sending `null` means the same thing, and on PATCH it means *remove the stored route*.
  Everywhere else in the runs DTOs an explicit `null` is a 400 (see API validation
  below) - the exception exists because the run form submits its complete shape on every
  save, so "I cleared the map" has to be expressible. A PATCH that omits `route`
  entirely leaves the stored one untouched, so an edit that never opened the Route step
  cannot lose it.
- **The entered distance stays the source of truth.** The routed distance is never
  written to `distanceKm`; a mismatch over 20% is a hint in the form (RUN-54 AC2), never
  a correction and never a block on saving.
- **`trimmed` is server-assigned, like `source`, and it changes what may be drawn**
  (RUN-55 AC4). It is true only for somebody else's run on a public profile, where the
  polyline arrives already shortened and `waypoints` is `[]`. The map must honour it:
  the ends of a trimmed line are wherever the cut landed, so it draws no Start/Finish
  pins and says the ends are hidden instead. The client is *told* rather than left to
  infer it from `me`/`showRoutes`, so the two can never disagree; neither field is part
  of a write (`RunRouteDraft` is `polyline` + `waypoints` only, and the whitelist pipe
  400s a save that sends either).

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
- **Sanity limits are enforced in the service, not the DTOs (RUN-72).**
  `src/common/runLimits.ts` holds both tiers as constants with the reasoning next to
  them. `RUN_LIMITS` is hard: distance at most **150 km**, duration at most **24 h**, and
  a pace between **2:30** and **20:00 /km**. Past any of them the API answers **400** and
  nothing is stored. The boundaries are **inclusive-legal**: exactly 150 km, exactly 24 h
  and exactly 2:30 /km all pass. They live in the service because the pace rule reads
  distance and duration *together*, so a PATCH carrying only one of them is checked
  against the **merged** pair (the stored value fills the other side) exactly the way an
  event's date order is. A DTO cannot see the stored row, and two half-rules would be two
  places to forget.

  These are **honest-mistake guards, not fraud proof**. Every number in this app is typed
  by the person it flatters, so nothing here can prove a run happened; what the limits
  catch is a distance entered in metres or a stray zero. Someone determined to invent a
  plausible run still can, and that is accepted rather than papered over with a stricter
  number that would start rejecting real ultras.

  `RUN_OUTLIER_THRESHOLDS` is the soft tier: a run faster than **3:30 /km** or longer
  than **60 km** is legal, stored and ranked like any other, and only picks up the subtle
  `unverified` marker on leaderboards (see below). RUN-71's seeder is meant to import both
  constants rather than repeat the literals, so demo data cannot drift past the rules that
  guard real data.

  The 400 body reaches the runner: `addRun`/`updateRun` in `frontend/src/lib/runs.ts`
  surface a 400's `message` inline in the Add run form instead of a generic
  "Saving the run failed (400)". These limits are the first rejection the form cannot
  predict for itself, which is why the messages are written for a person ("Distance must
  be at most 150 km per run.") rather than naming DTO fields. Other statuses keep the
  generic sentence: a 500's message is about the server, not about the run.
- **Explicit `null` is always a 400**, on create and on PATCH, with exactly one
  documented exception: `route` (RUN-54), where null is the way to say "no route" on
  create and "remove the route" on PATCH. Omitting `effort` or `note` means "use the
  defaults" (`Medium`, `''`); sending `null` for anything else is rejected in validation
  rather than reaching a NOT NULL column as a 500. The two mechanisms are named after
  what they do: `ValidateIfPresent` (null is a mistake) and `ValidateIfNotNull` (null is
  a meaning), both in `src/common/validation.ts`.

## Demo data seeder (RUN-71)

`cd backend && npm run seed` fills an empty database with a demo that makes the social
features demonstrable. Without it every leaderboard, event and search screen renders an
empty table, which is a bad thing to discover mid-demo.

**What it creates**, all derived from the day it runs on:

- **15 accounts** on the reserved `@runlog.demo` domain, each with a profile (so they
  sign in straight onto the dashboard rather than into the setup wizard) and an
  open-ended goal.
- **6 to 10 weeks of run history each**, 3 to 5 runs a week, at paces and distances that
  match the account's running level. The **current** week always has runs, because the
  global weekly leaderboard reads that week and nothing else.
- **A follow web** centred on the primary account, so its Following and Followers tabs
  are populated in both directions.
- **One active event** whose window contains today, with nine participants who already
  have runs inside it, so the event leaderboard is populated rather than a list of zeros.
- **A handful of `new-follower` notifications** for the primary account only. Deliberate:
  seeding every follow edge and every followed run would put several hundred rows in the
  bell, which is noise rather than a demo.

**Signing in.** Every seeded account shares one password:

| | |
| --- | --- |
| Primary account | `ana.demo@runlog.demo` |
| Password (all 15 accounts) | `demo-only-password` |

The other fourteen addresses are `firstname.lastname@runlog.demo` from faker-generated
names; `npm run seed` prints the primary one and the password when it finishes. The
password is hashed with `AuthService`'s own `BCRYPT_ROUNDS`, so these are ordinary
accounts that log in through the real Sign in screen.

**Privacy is opted in explicitly.** The three privacy columns default to `false`
(`common/privacy.ts`), so a seeded account left at the defaults would appear on no
leaderboard and have a private profile - which would defeat the point. The seeder is the
intended exception to that default, not a reason to change it. **One** account is left at
the defaults on purpose: it joins the event and logs runs like the rest, and the event
board shows it with its rank and distance withheld, so the privacy gate is demonstrable
rather than merely claimed.

**Idempotency marker: the email domain.** Running the seeder twice does not duplicate
anything. Every seeded account lives on `@runlog.demo` and nothing else does, so the
seeder deletes exactly its own previous output first (cascades take the runs, follows,
notifications and the event with it) and writes it again, all in one transaction. Real
accounts are never touched. Upserting by email was rejected: it would leave the previous
run's runs and follows behind and grow the demo on every invocation.

The marker is an email address, and an email address is editable: `PUT /api/account`
lets a signed-in user change theirs. Rename a demo account off `@runlog.demo` during a
demo and the next seed no longer recognises it, so it survives as a stale extra runner on
the leaderboard alongside a freshly created replacement. Deleting it by hand is the fix.
A marker the app cannot edit away would mean a new column on `User`, which is a migration
this ticket deliberately does not make for a development convenience.

**Determinism.** faker is seeded with a fixed constant and every date is derived from
today, so two runs on the same day produce the same **dataset**: the same names, the same
distances, the same notes. The rows are not byte-identical - ids are fresh `cuid()`s and
notification timestamps are relative to the moment of seeding - but nothing on screen
differs. A demo that looks different every time is harder to talk about.

**It never runs automatically.** Nothing in `render.yaml`'s build or start command
reaches it; it is a standalone command a human invokes. It also refuses to run with
`NODE_ENV=production` unless `npm run seed -- --force` is passed, because it deletes
before it writes.

Two implementation notes for anyone extending it (`backend/src/seed/`):

- `demo-data.ts` generates the dataset as **plain data with no Prisma in it**, and
  `seed-demo-data.ts` is the thin writer. That split is what makes the interesting half
  unit-testable with no database at all (`demo-data.spec.ts`), which matters because a
  fresh clone has none. `test/seed.e2e-spec.ts` covers the writing half against CI's real
  Postgres. Demo runs are checked against RUN-72's own `runLimitViolation()` and
  `isOutlierRun()` (`src/common/runLimits.ts`), not against numbers copied out of them, so
  the seeder cannot drift past the guardrails that protect real data - and it has to clear
  the **soft** thresholds too, or the whole demo leaderboard would wear the `unverified`
  marker.
- It runs from the **compiled output** (`nest build && node dist/seed/seed.js`), not
  ts-node: the Prisma 7 generated client uses ESM-style relative specifiers that
  ts-node's CommonJS resolution cannot follow, the same incompatibility `jest.shared.js`
  works around for the test suites.

## Test database

`npm run test:e2e` never touches the development database. The suite derives its own
URL (`DATABASE_URL_TEST` if set, otherwise the `DATABASE_URL` database name plus a
`_test` suffix, e.g. `runlog_test`), creates and migrates that database automatically
on first run, and refuses to start against any database whose name does not end in
`_test`, because the tests delete rows between cases. See `backend/test/test-database.ts`.

The frontend keeps the same types and swaps localStorage calls for API calls; nothing in
the components changes shape. RUN-48 made that swap for runs; RUN-50 does profile/goal.

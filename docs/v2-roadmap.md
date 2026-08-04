# Run Log v2 - social platform roadmap

Where the app goes after the graded v1 scope is delivered. v1 is a private, on-device,
single-user tracker (by design: "your runs stay on this device", WEL-4). v2 turns it
into a small social platform. That is an architectural regime change, not an increment:
the moment data crosses the device boundary, a server, a real database and user
identity all become mandatory at once.

**Status: proposal.** The feature set below is the current working idea; screens do not
exist in Figma yet and nothing here is committed until the v1 scope is done and the
teacher has seen this plan. Rule carried over from v1: design first, build second -
no v2 screen gets built before it is drawn and agreed.

---

## 1. Product pillars (current idea)

1. **Leaderboard** - compare weekly distance with everyone (global) and inside events.
2. **Events** - any user can create an event (e.g. "October 100 km challenge"); others
   join, the event has its own leaderboard and time window.
3. **Friends / followers** - follow other runners, browse their run history (with their
   permission), see their profile.
4. **Notifications** - get notified when someone you follow logs a run, when someone
   joins your event, when someone follows you.
5. **Route maps** - a run can carry a real route: the user places start, finish and a
   few waypoints on a map, a routing service snaps them to actual streets and paths,
   and the resulting polyline replaces the decorative sketch on the run detail and
   appears on public profiles.

Deliberately out of v2 scope until these five work: comments, likes, direct messages,
media uploads, GPX/GPS import. Scope creep is the main way v2 fails. GPX import is the
long-term *exact* route source (a GPS trace beats any reconstruction) and the route
data model below is designed so it can slot in later without a migration; it stays out
of v2 only to bound the scope. The Strava *API* specifically is ruled out further than
that: since late 2024 its terms forbid showing a user's API-fetched data to anyone but
that user, which is incompatible with leaderboards and follower feeds. User-exported
GPX files carry no such restriction.

## 2. What each pillar needs

### Accounts (prerequisite for everything)

- Sign up / sign in screens replace the v1 Welcome flow; the "No password needed"
  promise is retired (this is a deliberate breaking change of the v1 design and its
  copy - flag it to the designer/teacher).
- NestJS: JWT auth, guards on every endpoint, bcrypt password hashing.
- Every entity gains an `userId` owner; every query is scoped to the requesting user's
  rights.

### Leaderboard

- Server-side aggregation over runs per week (the same `totalsForWeek` maths v1 runs in
  the browser, moved into SQL) - global weekly ranking by km.
- Privacy setting: a user chooses whether they appear on public leaderboards.
- Anti-cheat reality check: runs are manual entries, so guardrails are needed (sane
  per-run limits, flagging of outliers). A leaderboard of honest people only works if
  dishonest entries are at least inconvenient.

### Events

- Create event: name, description, date range, target metric (total km to start with).
- Join / leave event; participant list; per-event leaderboard for its date window.
- Event states: upcoming, active, finished (derived from dates, nothing stored).

### Friends / followers and activity

- Follow model (one-directional, Instagram-style; "friends" = mutual follow) - simpler
  than friend-requests and covers the use case.
- User search by name; public profile page: their records, weekly chart and recent runs,
  visible only if their privacy setting allows.
- Notifications: new run by someone you follow, new follower, someone joined your
  event. In-app only to start (bell + list); e-mail/push much later.

### Route maps

- **Drawing**: an optional "Route" step on the Add/Edit run modal. A Leaflet map
  (OpenStreetMap tiles, free, no API key) where the user taps start, finish and 0-3
  waypoints; the map is never mandatory, a run without a route keeps the v1 sketch.
- **Routing**: the frontend never calls the routing service directly. A NestJS
  endpoint (`POST /api/routes/plan`) forwards the waypoints to the service with the
  `foot`/walking profile and returns the snapped polyline. Keeps any API key
  server-side (ConfigService), allows caching, and lets us swap providers freely.
- **Provider**: OSRM public demo server (free, keyless, fine for an academy demo) or
  OpenRouteService (free key, ~2000 req/day) - decided by a spike task; GraphHopper's
  round-trip mode is the upgrade path if we ever generate routes from distance alone.
- **Honesty check**: the routed polyline's length is compared with the distance the
  user entered; a large mismatch shows a hint ("route is 3.1 km but you logged 8 km -
  add waypoints?"). The user's entered distance stays the source of truth, the map
  never overrides it.
- **Display**: run detail renders the polyline on a Leaflet map instead of the sketch;
  routed routes are drawn dashed to signal "reconstruction, not GPS truth" (a solid
  line is reserved for future GPX imports). The same polyline renders on public
  profiles and follower feeds - one `RouteMap` component, three screens.
- **Privacy (decided)**: routes are **private by default**. A "Show my routes"
  toggle in the Settings privacy section (`User.showRoutes`, default false) controls
  whether followers and profile visitors see route maps; distance/duration stats stay
  visible either way. Public views additionally trim the first and last ~300 m of the
  polyline, because runs tend to start and end at the runner's front door. The owner
  always sees their own full route.

## 3. New screens to design (Figma, before building)

| Screen | Pillar | Notes |
| --- | --- | --- |
| Sign in / Sign up | Accounts | Replaces 01 · Welcome; keeps the visual language of v1 |
| Community - Leaderboard | Leaderboard | Global weekly ranking, my position pinned |
| Events - list | Events | Active/upcoming/finished, join CTA, "Create event" |
| Event - detail | Events | Description, window, participants, event leaderboard |
| Create event (modal) | Events | Mirrors the Add run modal pattern |
| People - search + profile | Friends | Search, follow button, public profile with runs |
| Notifications (panel) | Notifications | Bell in the topbar, list of notification rows |
| Settings - privacy section | all | Leaderboard opt-out, profile visibility, route visibility |
| Sidebar update | all | New "COMMUNITY" section: Leaderboard, Events, People |
| Add/Edit run - route step | Route maps | Map with tap-to-place start/finish/waypoints, mismatch hint |
| Run detail - map card | Route maps | Adapt existing "M14 · Run — Map view" frame (see note) |

A head start for route maps: the Figma file already contains **"M14 · Run — Map view"**
(node `174:1704`) - the frame the v1 handout flagged as a trap. Its visual language
(blue polyline over light map tiles, run header with Edit/Delete) is exactly what the
map card should look like, so the design work is an adaptation, not a blank page. Two
things must change: it is a **mobile** mockup (390x844 with a bottom tab bar) and needs
recomposing as the Route card inside the desktop 09 · Run detail layout, and its
"Jul 7, 2026 · 07:20" caption includes a start time that the waypoint flow does not
capture (only a future GPX import would), so the caption stays date-only as in v1.

Design tokens, components (Badge, Stat, Section header, table rows) and layout shell
are all reused from the v1 Figma file - v2 screens are new compositions of the same
system, which keeps the design work bounded.

## 4. Data model v2 (extends docs/data-model.md)

New entities (Prisma sketch, final shapes decided when the phase starts):

```
User            id, email (unique), passwordHash, firstName, lastName,
                runningLevel, defaultWeeklyGoalKm, showOnLeaderboard, profilePublic,
                showRoutes (default false - see route privacy under section 2)
Run             + userId (every v1 entity gains an owner)
                + routeSource ('routed' | 'gps' | null = no route, sketch stays),
                  routePolyline (encoded polyline string, ~KBs even for long runs),
                  routeWaypoints (json, the user's tapped points, kept so the route
                  stays editable; a future GPX import sets source='gps' and no waypoints)
WeekTarget      + userId
CoachPlan       + userId
Follow          followerId, followeeId, createdAt  (@@unique both)
Event           id, ownerId, name, description, startDate, endDate, targetKm?
EventParticipant eventId, userId, joinedAt  (@@unique both)
Notification    id, userId, type, payload (json), readAt?, createdAt
```

Unchanged principles from v1: derived data (rankings, event totals, records) is never
stored, always computed; dates are calendar days; durations are seconds. Leaderboards
are one aggregation query, which is why the v1 "compute, don't store" philosophy pays
off directly.

## 5. Phases and estimated effort

Pair velocity assumption: ~21 SP per two-week sprint (calibrated in v1).

| Phase | Sprint | Goal | Est. |
| --- | --- | --- | --- |
| A - Database | Sprint 5 | Same app, real Postgres behind the API; Sprint 1-4 features migrated off localStorage | ~22 SP |
| Design | during Sprint 5 | All section-3 screens drawn in Figma and agreed | design time |
| B - Accounts | Sprint 6 | Sign up/in, JWT, user-scoped data, deployed to a real host | ~23 SP |
| C1 - Social core | Sprint 7 | Follow, user search, public profiles, notifications | ~21 SP |
| C2 - Events + leaderboard | Sprint 8 | Events CRUD+join, event and global leaderboards, seeded demo data | ~21 SP |
| D - Route maps | Sprint 8 tail / Sprint 9 | Provider spike, waypoint picker in Add/Edit run, routing endpoint, map on run detail and profiles | ~10 SP |

Phase D breakdown: routing provider spike + `POST /api/routes/plan` endpoint (3 SP),
route step in the Add/Edit run modal with the mismatch hint (5 SP), `RouteMap` display
on run detail and public profiles including the `showRoutes` gating and the ~300 m
public trim (2 SP). The schema columns land already in Phase A
(three nullable columns cost nothing), so D is pure feature work with no migration.
D depends only on A (storage); it does not block, and is not blocked by, B or C.

Total: ~97 SP over 4-5 sprints - effectively a second project the size of v1. Phase A is
already fully prepared (the Prisma schema in `backend/prisma/schema.prisma` and the
type contract in `docs/data-model.md` were written for exactly this move).

Jira epics exist for each phase. Phase A tasks are broken down now (they are concrete);
Phase B/C tasks get broken down when their features are agreed and drawn, same
discipline as v1.

## 6. Risks and open questions

- **Async UX**: v1 design has no loading/error states (spec: instant screens). Every
  API-backed screen needs them; pattern gets decided once in Phase A and reused.
- **Anti-cheat**: manual entry + public ranking invites nonsense entries. MVP answer:
  hard limits + outlier flagging, and events among friends matter more than the global
  board.
- **Privacy defaults**: opt-in or opt-out for leaderboards? Proposal: profile private
  and leaderboard opt-in by default.
- **Route privacy**: resolved - see "Privacy (decided)" under Route maps in section 2
  (private by default, `showRoutes` setting, ~300 m trim on public views).
- **Routing service limits**: the OSRM demo server has no SLA and free tiers have
  daily caps. Fine for the demo; a real deployment would self-host OSRM or pay. The
  backend proxy endpoint is what keeps this swap invisible to the frontend.
- **Hosting**: where does it run (Railway/Render/Fly + managed Postgres) and who pays
  the ~free-tier setup? Decide in Phase A.
- **Teacher sign-off**: v2 exceeds the graded assignment; confirm whether it counts,
  replaces nothing, and does not endanger v1 delivery.

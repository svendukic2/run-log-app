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

Deliberately out of v2 scope until these four work: comments, likes, direct messages,
media uploads, GPS import. Scope creep is the main way v2 fails.

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
| Settings - privacy section | all | Leaderboard opt-out, profile visibility |
| Sidebar update | all | New "COMMUNITY" section: Leaderboard, Events, People |

Design tokens, components (Badge, Stat, Section header, table rows) and layout shell
are all reused from the v1 Figma file - v2 screens are new compositions of the same
system, which keeps the design work bounded.

## 4. Data model v2 (extends docs/data-model.md)

New entities (Prisma sketch, final shapes decided when the phase starts):

```
User            id, email (unique), passwordHash, firstName, lastName,
                runningLevel, defaultWeeklyGoalKm, showOnLeaderboard, profilePublic
Run             + userId (every v1 entity gains an owner)
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

Total: ~87 SP over 4 sprints - effectively a second project the size of v1. Phase A is
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
- **Hosting**: where does it run (Railway/Render/Fly + managed Postgres) and who pays
  the ~free-tier setup? Decide in Phase A.
- **Teacher sign-off**: v2 exceeds the graded assignment; confirm whether it counts,
  replaces nothing, and does not endanger v1 delivery.

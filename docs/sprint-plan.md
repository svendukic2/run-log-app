# Run Log Tracker - Sprint Plan

Sprint plan for the [ACADEMY] Run log tracker Jira project (`RUN`), board:
<https://decode.atlassian.net/jira/software/projects/RUN/boards/2328/backlog>

Scope, phase 1 (the graded assignment): 6 epics (RUN-1 to RUN-6), 34 tasks (RUN-7 to
RUN-40), 86 story points total. Assumed cadence: 4 sprints of 2 weeks each. Sprint
dates are intentionally not set here; fill them in once the sprint calendar is shared,
then copy them to the epic and task due dates in Jira (never invent a date).

Phase 2 (database, accounts, social platform) is planned separately in
[v2-roadmap.md](v2-roadmap.md) and summarized at the bottom of this file. Hard rule:
phase 2 never eats phase 1 sprint capacity.

## Progress

| Sprint | Status | Notes |
| --- | --- | --- |
| Sprint 1 | **Done** | All 9 tasks merged to develop (RUN-7..13, 15, 23). Review findings fixed in PR #12: date picker click target (RUN-10), future run dates rejected (RUN-23 AC7, flagged design-review). Velocity confirmed: 22 SP |
| Sprint 2 | next | |
| Sprint 3-4 | planned | |
| Sprint 5-8 | proposal (phase 2) | pending teacher sign-off, see v2-roadmap.md |

---

## Planning method

Sprints are planned by **vertical slices with dependencies first**, not by epic and not
by priority alone:

- **Not by epic.** A sprint that delivers "the whole Onboarding epic" demos three forms
  that lead to an empty screen. Nothing end-to-end works, so nothing meaningful can be
  shown.
- **Not by priority alone.** The 9 High tasks span 5 different epics. A sprint built
  only from them has no theme and no coherent demo.
- **By vertical slice.** Every sprint ends in a state where the user can do something
  new from start to finish, across every screen that flow touches. Each sprint gets a
  one-sentence **sprint goal**, and the sprint contains exactly the tasks that fulfil
  it, High-priority tasks first.

### Hard rules

1. **Dependencies beat everything.** The app shell (RUN-12, RUN-13) and the Add run
   modal (RUN-23) come before all other work: without navigation there are no screens,
   and without run logging the dashboard, records and coach stay empty forever. The
   High priorities on the board already encode these dependencies.
2. **An empty state ships in the same sprint as its screen.** RUN-18 with the
   dashboard, RUN-25 with the runs list, RUN-31 with the coach plan. Every demo starts
   on a fresh profile, so a screen without its designed empty state breaks the demo.

### Capacity

Total scope is 86 SP across 4 sprints (average ~21.5 SP per sprint). The team has no
measured velocity yet, so Sprint 1 is deliberately conservative. Recalibrate after
Sprint 1: if the team lands above or below ~22 SP, rebalance Sprints 2 to 4 rather than
squeezing the tail sprint.

---

## Sprint 1 (22 SP)

**Goal: a new user completes onboarding and logs their first run.**

| Key | Task | SP | Priority | Epic |
| --- | --- | --- | --- | --- |
| RUN-12 | Implement fixed sidebar navigation with active states | 3 | High | App shell and navigation |
| RUN-13 | Implement routing between the four app views | 2 | High | App shell and navigation |
| RUN-15 | Build dashboard page header with Add run button | 2 | High | App shell and navigation |
| RUN-7 | Build Welcome screen layout and copy | 1 | Medium | Onboarding and profile creation |
| RUN-8 | Build Welcome profile form with validation | 3 | High | Onboarding and profile creation |
| RUN-9 | Build weekly goal value control with stepper and slider | 3 | High | Onboarding and profile creation |
| RUN-10 | Build goal date inputs and setup step navigation | 2 | Medium | Onboarding and profile creation |
| RUN-11 | Build running level selection step | 2 | Medium | Onboarding and profile creation |
| RUN-23 | Implement Add run modal with validation | 5 | High | Run logging and management |

Notes:

- RUN-23 is the heart of the app: every derived view (goal progress, chart, records,
  coach) feeds off runs, which is why it enters in Sprint 1 even though its epic
  finishes later.
- Closes epic RUN-1 (Onboarding) entirely; RUN-2 (Shell) is nearly done, only the two
  Low polish tasks remain.
- Demo script: fresh profile → Welcome → weekly goal → running level → dashboard →
  "Add run" → save a run.

## Sprint 2 (21 SP)

**Goal: the user sees their runs and their weekly progress.**

| Key | Task | SP | Priority | Epic |
| --- | --- | --- | --- | --- |
| RUN-24 | Build runs list table with tabs and sort | 5 | High | Run logging and management |
| RUN-25 | Build runs empty state | 1 | Medium | Run logging and management |
| RUN-17 | Build weekly goal card with empty and filled states | 5 | High | Dashboard |
| RUN-18 | Build dashboard empty state with first-run prompt | 2 | Medium | Dashboard |
| RUN-20 | Build recent runs card with View all link | 2 | Medium | Dashboard |
| RUN-27 | Build run detail page | 3 | Medium | Run logging and management |
| RUN-14 | Implement sidebar profile footer with derived initials | 1 | Low | App shell and navigation |
| RUN-16 | Implement time-of-day greeting in header | 1 | Low | App shell and navigation |

Notes:

- All 9 High tasks on the board are finished by the end of this sprint.
- Closes epic RUN-2 (Shell).
- Demo script: log a few runs → dashboard shows "{done} / {target} km" with the On
  track badge → Runs list with sort → click a row → Run detail → breadcrumb back.

## Sprint 3 (22 SP)

**Goal: the user maintains their log and sees trends and records.**

| Key | Task | SP | Priority | Epic |
| --- | --- | --- | --- | --- |
| RUN-28 | Implement Edit run modal prefilled from run | 3 | Medium | Run logging and management |
| RUN-29 | Build row menu with edit and delete actions | 2 | Medium | Run logging and management |
| RUN-30 | Add delete run flow with confirmation dialog | 2 | Medium | Run logging and management |
| RUN-26 | Build records tab with automatic recomputation | 5 | Medium | Run logging and management |
| RUN-22 | Build personal records card on dashboard | 2 | Medium | Dashboard |
| RUN-19 | Build 8-week distance bar chart | 3 | Medium | Dashboard |
| RUN-21 | Build AI Coach teaser card on dashboard | 2 | Medium | Dashboard |
| RUN-31 | Build AI Coach page header and empty state | 1 | Medium | AI Coach |
| RUN-32 | Build current plan card with target and stats | 3 | High | AI Coach |

Notes:

- Closes epics RUN-3 (Dashboard) and RUN-4 (Run logging and management).
- RUN-31 and RUN-32 start the coach **on purpose**: the coach infrastructure must exist
  before the final sprint so the riskiest task (RUN-35) is not built on fresh ground in
  the last week. The coach also depends on run history existing, which it now does.
- Records work (RUN-26, RUN-22) lands together with edit/delete because deletion and
  edits must recompute records (DEL-3, RUN-11 requirement).
- Demo script: edit a run from the row menu → delete a run with confirmation → records
  recompute → chart and records card update → coach teaser points to the coach page.

## Sprint 4 (21 SP)

**Goal: the coach proposes a weekly plan and the user manages their settings.**

| Key | Task | SP | Priority | Epic |
| --- | --- | --- | --- | --- |
| RUN-35 | Implement plan regeneration with generating state | 5 | Medium | AI Coach |
| RUN-33 | Implement apply to weekly goal action | 2 | Medium | AI Coach |
| RUN-34 | Build insight cards and previous plans list | 3 | Medium | AI Coach |
| RUN-36 | Build settings page header and layout | 1 | Low | Settings |
| RUN-37 | Build profile card with avatar block and inputs | 3 | Medium | Settings |
| RUN-38 | Build default weekly goal setting with stepper | 2 | Medium | Settings |
| RUN-39 | Implement save changes persistence | 2 | Medium | Settings |
| RUN-40 | Propagate profile changes across the app | 2 | Medium | Settings |

Notes:

- **Start with RUN-35, not with Settings.** It is the most uncertain task in the whole
  backlog (asynchronous generation, the only designed loading state in the app,
  undesigned failure behavior covered by assumption A22). Risk goes at the front of the
  sprint, not the end.
- Closes epics RUN-5 (AI Coach) and RUN-6 (Settings).
- Demo script: open coach → regenerate → generating state with skeletons → new plan →
  "Apply to weekly goal" → dashboard target updates → change name in Settings → sidebar
  footer and greeting update.

---

## Epic completion map

| Epic | Finishes in | Note |
| --- | --- | --- |
| RUN-1 Onboarding and profile creation | Sprint 1 | |
| RUN-2 App shell and navigation | Sprint 2 | Core (RUN-12/13/15) done in Sprint 1; only Low polish in Sprint 2 |
| RUN-3 Dashboard | Sprint 3 | Goal card and empty state earlier, in Sprint 2 |
| RUN-4 Run logging and management | Sprint 3 | RUN-23 pulled forward to Sprint 1 by dependency |
| RUN-5 AI Coach | Sprint 4 | Empty state and plan card earlier, in Sprint 3 |
| RUN-6 Settings | Sprint 4 | |

Per the handout, an epic's due date is the end date of the sprint it finishes in, and a
task's due date fits inside its sprint. Fill both in Jira once the sprint calendar
exists.

## Risk and flex

- **Highest-risk task:** RUN-35 (regenerate flow). Mitigated by landing RUN-31/RUN-32
  in Sprint 3 and starting Sprint 4 with it.
- **Drop-first candidates if a sprint overruns:** the Low tasks, in this order:
  RUN-16 (greeting variants), RUN-14 (profile footer), RUN-36 (settings layout task can
  merge into RUN-37). They were priced Low exactly so they can act as the release
  valve.
- **Do not drop:** empty states (RUN-18, RUN-25, RUN-31). The handout explicitly calls
  skipping designed states a trap, and every demo starts on a fresh profile.
- **Recalibrate after Sprint 1.** 22 SP is a guess, not a velocity. Move the boundary
  between Sprints 2 and 3 first; keep Sprint 4's risk item (RUN-35) untouched.

## Phase 2 - database, accounts, social (Sprints 5-8, proposal)

Full detail in [v2-roadmap.md](v2-roadmap.md). Summary:

| Sprint | Goal | Est. |
| --- | --- | --- |
| Sprint 5 | **Real database, same app**: Postgres + Prisma behind a NestJS API, Sprint 1-4 features migrated off localStorage (runs, profile, goal, coach). Prisma schema and type contract already exist (`docs/data-model.md`) | ~22 SP |
| Sprint 6 | **Accounts**: sign up/in, JWT + guards, all data user-scoped, app deployed to a real host. Retires the v1 "No password needed" design - needs new Figma screens first | ~23 SP |
| Sprint 7 | **Social core**: follow/followers, user search, public profiles with runs, in-app notifications | ~21 SP |
| Sprint 8 | **Events + leaderboard**: create/join events, per-event and global weekly leaderboards, faker-seeded demo users | ~21 SP |

Phase 2 rules:

- Design first: every new screen (auth, leaderboard, events, people, notifications) is
  drawn in Figma and agreed before its task starts, same as v1.
- Jira: phase 2 epics exist now; only Sprint 5 (database) tasks are broken down,
  because they are concrete today. Sprint 6-8 tasks get written when their features
  are agreed and drawn.
- Sprint 5 is the lowest-risk entry: it changes plumbing, not features, and everything
  it needs (schema, type contract, thin-slice order: runs first) is already prepared.

## Definition of done for a sprint

- Every task's Given/When/Then acceptance criteria pass by looking at the screen.
- The sprint's demo script (above) runs end to end on a fresh profile.
- No task rolls over silently: anything unfinished is re-estimated and re-planned at
  the next sprint planning.

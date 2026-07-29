# Run Log Tracker: tech spec

This spec turns the Figma design into buildable requirements. Every requirement references the screen it comes from. If a requirement has no screen behind it, it doesn't belong here.

> **Source:** Figma file [Run Log Tracker](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=1-40), page "Screens" (17 frames). Frame names and UI copy are quoted as designed, except that long dashes are written as hyphens per DECODE writing rules.
>
> **How to read requirement IDs:** each screen has a code (WEL, GOAL, LVL, DSH, RUN, DET, ADD, EDT, MNU, DEL, AIC, SET). "RUN-3" means requirement 3 of the Runs screens. Use these IDs when you write Jira tasks so every task traces back here.
>
> **For students:** read the brief first, then work through this spec screen by screen. Every bolded ID is one requirement your Jira tasks must reference. Section 6 records working decisions where the design is ambiguous: challenge an assumption with your teacher if you disagree, don't silently change it. When the design and your instinct conflict, the design wins.

## 1. Overview

**Platform:** desktop web app. Every frame is 1440x1024 with a fixed left sidebar, which is a desktop-first web layout. No mobile or tablet frames exist.

**Suggested architecture:** a single-page web app with four routed views (Dashboard, Runs, AI Coach, Settings) behind a shared app shell, plus modals for run create, edit, and delete. Data is a small store of profile, goal, runs, and coach plans. The welcome copy "No password needed - your runs stay on this device" (01) implies local, on-device persistence rather than accounts, and the AI Coach needs one asynchronous "generate plan" operation with a visible loading state (16).

**Terms used in this spec:**

- **Modal:** a dialog that opens on top of the page and blocks it until closed.
- **Empty state:** what a screen shows before any data exists.
- **Overline:** the small caption text sitting above a page title.
- **Breadcrumb:** a small link at the top of a page that leads back to the parent page.
- **Segmented control:** a row of joined buttons where exactly one option is selected.
- **Kebab menu:** a three-dot button that opens a small menu of actions.
- **Badge (or chip):** a small rounded label that shows a status, like "On track".
- **Skeleton:** gray placeholder bars shown in place of content while it loads.

## 2. Functional requirements per screen

### 2.1 Welcome

**Figma frame:** [01 · Welcome](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=78-145). **Purpose:** create the local profile before anything else.

UI elements and behavior:

- **WEL-1.** Show the Run Log logo (top left), a "Welcome" badge, the heading "Welcome to Run Log", and the intro "Track every run, hit your weekly goals and get simple AI coaching. First, tell us who you are."
- **WEL-2.** A card with three labeled inputs: "First name" (placeholder "Your first name"), "Last name" (placeholder "Your last name"), "Email" (placeholder "you@email.com").
- **WEL-3.** Primary button "Get started" stores the profile and opens Setup - Weekly goal (02).
- **WEL-4.** Caption under the card: "No password needed - your runs stay on this device." No password field may be added.

Validation implied by the design:

- **WEL-5.** Email input implies email-format validation. The design shows no required markers or error states, so exact rules are assumption A1.

States: default only. No loading, error, or filled variants are designed.

Navigation: entry point is first app launch. Exit: "Get started" → 02. There's no way back to this screen in the design.

Edge cases: first name feeds the greeting "Good morning, Marko." (04, 05) and the "Welcome, Marko" badge (02), so an empty first name would break both. Treat first name as required (assumption A1).

### 2.2 Setup - Weekly goal

**Figma frame:** [02 · Setup - Weekly goal](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=5-2). **Purpose:** set the weekly distance target the whole app tracks against.

UI elements and behavior:

- **GOAL-1.** Progress indicator "Step 1 of 2" and badge "Welcome, Marko" (first name from WEL-2). Heading: "How far do you want to run each week?" Supporting copy: "Set a weekly distance target. Run Log tracks your progress against it and your AI Coach adapts as you go. You can change this anytime."
- **GOAL-2.** Goal value control: large readout "20 km / week" with minus and plus stepper buttons, synced with a slider labeled "0 km", "30 km", "60 km". Stepper and slider edit the same value. Default shown: 20.
- **GOAL-3.** "Start date" input, prefilled with the current date ("Mon, 14 Jul 2026" in the mock), with a calendar icon.
- **GOAL-4.** "End date (optional)" input, empty state "No end date", with a calendar icon.
- **GOAL-5.** Primary button "Start tracking" saves the goal and opens Setup - Running level (03).
- **GOAL-6.** Text action "Skip for now". Destination and stored default are not designed (assumption A2).

Validation implied: goal value stays within the slider range 0 to 60 km. End date, if set, must be after start date (implied by "optional" end date on a date range, assumption A3).

States: default only.

Navigation: entry from 01. Exits: "Start tracking" → 03, "Skip for now" → assumed 03 (A2). The Back button on 03 returns here.

Edge cases: a goal of 0 km is selectable on the slider but makes "20 km to go" style dashboard copy meaningless. Flag at review (assumption A2).

### 2.3 Setup - Running level

**Figma frame:** [03 · Setup - Running level](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=43-2). **Purpose:** capture experience level for the coach.

UI elements and behavior:

- **LVL-1.** Progress indicator "Step 2 of 2" and badge "Last step". Heading: "What's your running level?" Supporting copy: "This helps your AI Coach set the right pace and weekly targets for you."
- **LVL-2.** Three single-select option cards (radio behavior, selected card highlighted): "Beginner - New to running or getting back into it" (selected in the mock), "Intermediate - Run regularly, comfortable with 5-10K", "Advanced - Training consistently, chasing new PRs".
- **LVL-3.** Secondary button "Back" returns to 02 with entered values kept (assumption A4).
- **LVL-4.** Primary button "Finish setup" stores the level and opens Dashboard - Empty state (04).

Validation implied: exactly one level selected. A default is preselected, so the button never has an invalid state.

States: default only.

Navigation: entry from 02. Exits: "Back" → 02, "Finish setup" → 04.

Edge cases: the level isn't editable anywhere after this screen (Settings has no such field), so a wrong choice is permanent in the current design. The brief lists this under out of scope, raise it with the designer.

### 2.4 Dashboard (empty and filled)

**Figma frames:** [04 · Dashboard - Empty state](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=55-44), [05 · Dashboard](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=47-39). **Purpose:** show weekly progress at a glance and route the user to logging, runs, and the coach.

Shared shell (also applies to Runs, AI Coach, Settings):

- **DSH-1.** Fixed dark sidebar: logo "Run Log / TRAINING TRACKER", section "MENU" with "Dashboard" and "Runs", section "ASSISTANT" with "AI Coach", section "ACCOUNT" with "Settings". The active item is highlighted and carries a small dot. Footer shows avatar initials ("MK"), name "Marko K." and email "marko@email.com" from the profile.
- **DSH-2.** Page header: overline greeting "Good morning, Marko." (time-of-day greeting, assumption A5), title "Dashboard", and a primary "Add run" button that opens the Add run modal (10).

Weekly goal card:

- **DSH-3.** Card "Weekly goal" with a status badge, progress readout "{done} / {target} km", a progress bar, left caption "{remaining} km to go", right caption with time left, and a stats row of three Stat components: "Runs", "Avg pace", "Time".
- **DSH-4.** Empty state (04): badge "Not started", readout "0 / 20 km", empty bar, captions "20 km to go" and "Full week ahead", stats "0 Runs", dash placeholders for "Avg pace" and "Time".
- **DSH-5.** Filled state (05): badge "On track" (green), readout "14 / 20 km", partly filled bar, captions "6 km to go" and "3 days left", stats "3 Runs", "5:24 Avg pace", "1h 12m Time". Statuses beyond "Not started" and "On track" aren't designed (assumption A6).

Main content:

- **DSH-6.** Empty state (04): a card with a plus icon, heading "Log your first run", copy "Add a run to start tracking your weekly distance, pace and personal records. Your charts and history will appear here.", and button "Add your first run" opening the Add run modal (10).
- **DSH-7.** Filled state (05): card "Distance" with caption "Last 8 weeks", a bar chart of weekly distance for the last 8 weeks with week labels (May 19 through Jul 7 in the mock) and the current week highlighted. Display only, no designed interactions.
- **DSH-8.** Filled state (05): card with Section header "Recent runs" and action "View all" linking to Runs - List (07). Three most recent runs, each with a colored effort dot, route name, caption "{date} · {duration} min", distance, and pace ("Morning loop, Jul 7 · 42 min, 8.2 km, 5:12 /km" in the mock).

Right column:

- **DSH-9.** Dark "AI Coach" card. Empty state (04): copy "Your coach is warming up. Log your first run and I'll start suggesting weekly targets and pacing tips tailored to you." with button "Add your first run" → modal (10). Filled state (05): a short coach message referencing remaining distance and days ("You're 6 km from your goal with 3 days left...") with button "Open coach" → AI Coach (15).
- **DSH-10.** Card "Personal records". Empty state (04): "No records yet - Finish a run to set your first personal record." Filled state (05): four rows: "Longest run 14.2 km", "Fastest 5K 24:18", "Fastest 10K 52:40", "Best pace 4:52 /km". Note the 4:52 vs 4:51 conflict with the Records tab (assumption A20).

States: empty (04) and filled (05). No loading or error states are designed.

Navigation: entry after onboarding (03 → 04) and from the sidebar. Exits: "Add run" and "Add your first run" → 10, "View all" → 07, "Open coach" → 15, sidebar → 07/15/17.

Edge cases visible or implied: dash placeholders when averages don't exist yet (04), goal status wording when the week hasn't started vs mid-week ("Full week ahead" vs "3 days left"), current week highlighted in the chart even with zero distance.

### 2.5 Runs - List, Records, and empty state

**Figma frames:** [06 · Runs - Empty state](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=71-123), [07 · Runs - List](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=57-51), [08 · Runs - Records](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=61-53). **Purpose:** the full activity log and derived personal records.

Header and tabs:

- **RUN-1.** Page header: overline "Your activity", title "Runs", primary "Add run" button → modal (10).
- **RUN-2.** Tabs: "All runs" with a count badge (0 in 06, 12 in 07) and "Records". Tabs switch between the table (07) and record cards (08).
- **RUN-3.** Controls on the right of the tab row: a "Filter" button and a "Newest first" sort dropdown. Filter has no designed panel (assumption A19). Sort implies at least newest and oldest ordering (assumption A7). Both controls also appear on the Records tab (08), where their effect is undefined (assumption A19).

Table (07):

- **RUN-4.** Columns: ROUTE, DATE, DISTANCE, DURATION, PACE, EFFORT, plus a kebab (three-dot) action button per row.
- **RUN-5.** Each row: colored dot + route name, date ("Jul 7, 2026"), distance ("8.2 km"), duration ("42:15", hours shown when needed: "1:18:44"), pace ("5:12 /km"), effort chip ("Easy" green, "Medium" amber, "Hard" coral). Dot color matches the effort chip.
- **RUN-6.** The mock lists 10 rows while the tab badge says 12. No pager or scroll indicator is designed, so assume vertical scroll of one page (assumption A8).
- **RUN-7.** Clicking a row opens Run detail (09). The click target isn't marked in the design, but the kebab menu only holds Edit and Delete, and Run detail has an "All runs" breadcrumb back (assumption A9).
- **RUN-8.** The kebab button opens the row menu (12).

Empty state (06):

- **RUN-9.** Plus icon, heading "No runs logged yet", copy "Add your first run and it will show up here with distance, pace and effort. Your records fill in automatically.", button "Add your first run" → modal (10). Filter and sort controls are not shown in the empty state.

Records tab (08):

- **RUN-10.** Six record cards, each with an icon, label, value, and source caption: "Longest run 14.2 km - Sunday miles · Jun 24", "Fastest 5K 24:18 - Tempo run · Jun 29", "Fastest 10K 52:40 - Long run · Jun 24", "Best pace 4:51 /km - Tempo run · Jun 29", "Biggest week 38.6 km - Week of Jun 23", "Longest streak 6 days - Jun 17 - 22".
- **RUN-11.** Records derive from runs ("Your records fill in automatically", 06). Recompute them when runs are added, edited, or deleted.
- **RUN-12.** Known data conflicts to resolve with the designer: longest-run attribution (14.2 km belongs to "Long run" in 07, not "Sunday miles") and best pace 4:51 vs dashboard's 4:52. Follow the design per screen until answered, and keep the conflict flagged (assumption A20).

States: empty (06), populated list (07), records (08). A records-specific empty state (runs exist but a record type has no qualifying run, for example no 10K yet) is not designed (edge case, assumption A24).

Navigation: entry from sidebar "Runs", dashboard "View all". Exits: row → 09, kebab → 12, "Add run" → 10, tabs switch 07/08.

### 2.6 Run detail

**Figma frame:** [09 · Run detail](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=62-55). **Purpose:** one run in full, with edit and delete.

- **DET-1.** Breadcrumb "All runs" returns to Runs - List (07).
- **DET-2.** Header: route name as title ("Morning loop"), caption "Jul 7, 2026 · 07:20", and an effort badge ("Medium effort", amber). Buttons: "Edit" (opens 11) and "Delete" (danger style, opens 13).
- **DET-3.** Four stat cards: "DISTANCE 8.2 km", "DURATION 42:15", "AVG PACE 5:12 /km", "ELEVATION 86 m".
- **DET-4.** Card "Route" with caption "Road · out & back" and a route path sketch (a decorative line with start and end dots, not a map).
- **DET-5.** Card "Note" with the run's note text.
- **DET-6.** Details card, four label-value rows: "Route name - Morning loop", "Date - Jul 7, 2026", "Effort - Medium", "Logged - Manual entry".
- **DET-7.** Data gap to resolve: start time (07:20), elevation (86 m), and route type ("Road · out & back") appear here but are never captured in Add or Edit (10, 11). Until answered, treat them as optional display fields that stay empty for user-created runs (assumption A10).

States: default only. No state is designed for a run without a note (edge case: hide or empty the Note card, assumption A11).

Navigation: entry from a list row (RUN-7). Exits: breadcrumb → 07, "Edit" → 11, "Delete" → 13.

### 2.7 Add run (modal)

**Figma frame:** [10 · Add run (modal)](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=67-56). **Purpose:** log a run manually.

- **ADD-1.** Modal over the current page (mocked over Runs - List) titled "Add run" with an X close button.
- **ADD-2.** Fields, top to bottom: "Route name" (text, placeholder "e.g. Evening tempo"), "Distance (km)" (numeric, placeholder "0.0"), "Duration" (placeholder "00:00"), "Date" (date input, prefilled with the current date, "Jul 14, 2026" in the mock), "Effort level" (segmented control "Easy / Medium / Hard", "Medium" preselected), "Note (optional)" (textarea, placeholder "How did it feel? Terrain, weather, splits...").
- **ADD-3.** Buttons: "Cancel" (closes without saving) and primary "Save run" (creates the run, closes the modal, refreshes the underlying page).
- **ADD-4.** Pace is not entered anywhere. The list and detail show it, so pace = duration / distance is computed (data model, section 3).

Validation implied by the design:

- **ADD-5.** Distance is numeric in km with one decimal shown ("0.0", "8.2"). Must be greater than 0 for pace to exist.
- **ADD-6.** Duration uses "00:00" (mm:ss) and elsewhere "1:18:44" (h:mm:ss), so accept both. Must be greater than 0.
- **ADD-7.** Date defaults to today. The label carries no "(optional)" suffix, unlike Note, so Route name, Distance, Duration, and Date read as required (assumption A12). No error states are designed (assumption A25).
- **ADD-8.** Effort always has a value because the control defaults to "Medium".

States: default only.

Navigation: opens from Dashboard (DSH-2, DSH-6, DSH-9 empty), Runs (RUN-1, RUN-9), and AI Coach empty state (AIC-2). Closes via Cancel, X, or Save run.

Edge cases: saving a run dated in a past week must update that week's totals, records, and chart bars, not the current week's (implied by week-based aggregates on 05).

### 2.8 Edit run (modal)

**Figma frame:** [11 · Edit run (modal)](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=69-88). **Purpose:** correct an existing run.

- **EDT-1.** Same form as Add run, titled "Edit run", prefilled with the run's values (mock: "Morning loop", "8.2", "42:15", "Jul 7, 2026", "Medium", note text).
- **EDT-2.** Buttons: "Cancel" and primary "Save changes" (persists edits, closes, refreshes list, detail, dashboard, and records).
- **EDT-3.** All Add run validation rules apply (ADD-5 to ADD-8).
- **EDT-4.** Copy conflict: the prefilled note here is a shorter text than the note on Run detail for the same run. Flag with the designer (assumption A20).

Navigation: opens from the row menu (12) and from Run detail "Edit" (DET-2).

### 2.9 Runs - Row menu

**Figma frame:** [12 · Runs - Row menu](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=101-174). **Purpose:** quick actions on one run without opening it.

- **MNU-1.** The kebab button on a list row opens a small menu anchored to the row with two items: "Edit" (pencil icon) and "Delete" (trash icon, coral/danger color).
- **MNU-2.** "Edit" opens the Edit run modal (11) for that run. "Delete" opens Delete confirmation (13). Clicking elsewhere closes the menu (standard menu behavior, assumption A13).

### 2.10 Delete confirmation

**Figma frame:** [13 · Delete confirmation](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=70-120). **Purpose:** prevent accidental permanent deletion.

- **DEL-1.** Modal with a coral trash icon, title "Delete this run?", and body copy quoting the run name: "'Morning loop' will be permanently removed from your log. This action can't be undone."
- **DEL-2.** Buttons: "Cancel" (closes, nothing happens) and danger primary "Delete run" (deletes the run, closes, refreshes the list).
- **DEL-3.** "Permanently" and "can't be undone" rule out an undo or trash feature. Deletion must also recompute records and weekly totals (RUN-11, DSH-3).

Navigation: opens from the row menu (12) and Run detail "Delete" (DET-2). After deleting from Run detail, land back on Runs - List (assumption A14).

### 2.11 AI Coach (empty, current plan, generating)

**Figma frames:** [14 · AI Coach - Empty state](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=85-172), [15 · AI Coach](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=72-127), [16 · AI Coach - Generating](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=74-129). **Purpose:** turn run history into a suggested weekly target.

Header:

- **AIC-1.** Overline "Your training assistant", title "AI Coach". No page-level primary button.

Empty state (14):

- **AIC-2.** Dark hero card: sparkle icon, heading "Coaching starts after your first run", copy "Log a run and I'll analyze your distance, pace and effort to suggest safe weekly targets and simple pacing tips.", button "Add your first run" → Add run modal (10), and three bullet labels: "Weekly targets", "Pacing tips", "Safe progression".

Current plan (15):

- **AIC-3.** Dark plan card header: "This week's plan" with timestamp caption "updated 2h ago" and a secondary "Regenerate" button (refresh icon).
- **AIC-4.** Plan content: headline "Aim for 22 km this week", explanation paragraph ("You're building steadily - that's a +10% step up from last week, right at the safe limit. Keep one easy recovery run and add a tempo session mid-week. Avoid stacking two hard days back to back."), and four stats: "22 km SUGGESTED TARGET", "+10% VS LAST WEEK", "3-4 SESSIONS", "1 tempo KEY WORKOUT".
- **AIC-5.** Plan actions: primary "Apply to weekly goal" (sets the goal target to the suggested value, assumption A15) and text link "See the reasoning" (no destination designed, assumption A21).
- **AIC-6.** Three insight cards: "RECENT LOAD 68 km - Over the last 4 weeks - steady, no spikes", "PACE TREND 5:22 /km - 4% faster than last month", "CONSISTENCY 3 / week - Right on your planned cadence".
- **AIC-7.** Card with Section header "Previous plans" and action "View all" (no destination designed, assumption A21). Rows show week range, caption "Target {n} km · ran {n} km", and an outcome chip: "Jun 24 - 30, Target 20 km · ran 21.4 km, Hit", "Jun 17 - 23, Target 18 km · ran 18.6 km, Hit", "Jun 10 - 16, Target 16 km · ran 11.2 km, Missed".

Generating state (16):

- **AIC-8.** After "Regenerate", the plan card switches to: "Generating new plan" with caption "just now", heading "Reading your training...", copy "Analyzing your last 4 weeks of distance, pace and effort to shape next week's plan.", and skeleton placeholder bars. The insight cards and previous plans dim while generating. No cancel control exists.
- **AIC-9.** When generation finishes, show the new plan (15). Failure behavior isn't designed (assumption A22). Generation is asynchronous (a "just now" timestamp plus skeletons).

Navigation: entry from sidebar "AI Coach" and dashboard "Open coach". Exits: "Add your first run" → 10, "Apply to weekly goal" → stays, goal updated (assumption A15), "Regenerate" → 16 → 15.

Edge cases: what triggers the very first plan isn't designed. The empty state implies logging the first run does (assumption A16).

### 2.12 Settings

**Figma frame:** [17 · Settings](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=75-129). **Purpose:** edit the profile and the default weekly goal.

- **SET-1.** Header: overline "Manage your profile", title "Settings".
- **SET-2.** Card "Profile": avatar block showing initials with label "Your avatar" and caption "Your initials are used automatically across Run Log." (initials derive from the name, no upload exists). Inputs: "First name" ("Marko"), "Last name" ("Kovač"), "Email" ("marko@email.com").
- **SET-3.** Card "Training": "Default weekly goal" with caption "Applied to each new week. You can still adjust it per week." and a stepper (minus, "20 km", plus).
- **SET-4.** Primary button "Save changes" persists everything. No unsaved-changes or success state is designed (assumption A23).
- **SET-5.** Changing names must update the sidebar footer, avatar initials, and dashboard greeting (DSH-1, DSH-2).
- **SET-6.** "Applied to each new week" means the default seeds future weeks and doesn't retroactively change the current week. Per-week adjustment exists in the design only via the coach's "Apply to weekly goal" (AIC-5), an inconsistency to raise with the designer.

Validation implied: same as WEL-5 (email format, names non-empty). Goal stepper respects the 0 to 60 km range from GOAL-2 (assumption A17).

States: default only.

Navigation: entry from sidebar "Settings". No exit button, navigation happens via the sidebar.

## 3. Data model

Entities and fields implied by the screens. Names are suggestions, fields are evidence-based.

**Profile** (implied by 01, 03, 17, greeting on 04/05)

| Field | Type | Evidence |
|---|---|---|
| firstName | string | 01 input, "Welcome, Marko" (02), "Good morning, Marko." (04/05) |
| lastName | string | 01 input, "Marko K." sidebar footer, "Kovač" (17) |
| email | string | 01 input, sidebar footer, 17 |
| runningLevel | enum: beginner, intermediate, advanced | 03 option cards |
| defaultWeeklyGoalKm | number | 17 "Default weekly goal" |
| avatarInitials | derived from names | 17 "Your initials are used automatically" |

**WeeklyGoal** (implied by 02, 04, 05, 15, 17)

| Field | Type | Evidence |
|---|---|---|
| targetKm | number (0 to 60) | 02 slider and stepper, "0 / 20 km" (04) |
| startDate | date | 02 "Start date" |
| endDate | date, optional | 02 "End date (optional)" |
| status | derived: not started, on track, others unknown | badges "Not started" (04), "On track" (05) |
| progressKm, remainingKm, daysLeft | derived from runs and dates | "14 / 20 km", "6 km to go", "3 days left" (05) |

**Run** (implied by 07, 09, 10, 11)

| Field | Type | Evidence |
|---|---|---|
| routeName | string | 10 "Route name", ROUTE column (07) |
| date | date | 10 "Date", DATE column (07) |
| distanceKm | number, one decimal | 10 "Distance (km)", 07/09 |
| duration | time (mm:ss or h:mm:ss) | 10 "Duration", "42:15" and "1:18:44" (07) |
| pace | derived: duration / distance | PACE column (07), "AVG PACE" (09), never an input |
| effort | enum: easy, medium, hard | 10 segmented control, EFFORT chips (07) |
| note | string, optional | 10 "Note (optional)", Note card (09) |
| startTime | shown only on 09 ("07:20"), no input | display-only, assumption A10 |
| elevationM | shown only on 09 ("86 m"), no input | display-only, assumption A10 |
| routeType | shown only on 09 ("Road · out & back"), no input | display-only, assumption A10 |
| loggedSource | string, "Manual entry" | 09 details card |

**PersonalRecord** (derived, implied by 05, 08)

| Field | Type | Evidence |
|---|---|---|
| type | enum: longest run, fastest 5K, fastest 10K, best pace, biggest week, longest streak | six cards (08) |
| value | number or time per type | card values (08) |
| sourceLabel | run name + date, or week range | card captions (08) |

**CoachPlan** (implied by 15, 16, coach cards on 04/05)

| Field | Type | Evidence |
|---|---|---|
| weekRange | date range | "Jun 24 - 30" rows (15) |
| suggestedTargetKm | number | "22 km SUGGESTED TARGET" (15) |
| deltaVsLastWeek | percent | "+10% VS LAST WEEK" (15) |
| sessions | range (e.g. 3-4) | "3-4 SESSIONS" (15) |
| keyWorkout | string | "1 tempo KEY WORKOUT" (15) |
| narrative | string | plan paragraph (15), teaser (05) |
| updatedAt | timestamp | "updated 2h ago" (15) |
| outcome | derived: hit, missed (past plans) | chips on previous plans (15) |
| ranKm | derived | "Target 20 km · ran 21.4 km" (15) |

Aggregates (all derived from runs): weekly distance series for 8 weeks (05 chart), 4-week load (15), pace trend vs last month (15), runs per week consistency (15), weekly totals for goal progress (04/05).

## 4. API surface

Functional operations each screen needs. Not final API design. Given the on-device copy (WEL-4), these may be a local storage layer instead of HTTP endpoints. Either way the operations are the same.

| Operation | Kind | Used by |
|---|---|---|
| createProfile(firstName, lastName, email) | create | 01 |
| getProfile() | read | shell (DSH-1), 04/05 greeting, 17 |
| updateProfile(fields) | update | 17 |
| setRunningLevel(level) | update | 03 |
| createWeeklyGoal(targetKm, startDate, endDate?) | create | 02 |
| getCurrentGoalWithProgress() | read | 04, 05 |
| updateGoalTarget(targetKm) | update | 15 "Apply to weekly goal", 17 default for future weeks |
| createRun(fields) | create | 10 |
| listRuns(sort) | read | 07 (sort: newest first and implied oldest first) |
| getRun(id) | read | 09 |
| updateRun(id, fields) | update | 11 |
| deleteRun(id) | delete | 13 |
| getRecords() | read | 08, 05 records card |
| getDashboardSummary() | read | 04/05 (goal progress, totals, 8-week series, 3 recent runs, coach teaser) |
| getCurrentPlan() | read | 15, coach card on 04/05 |
| listPreviousPlans(limit) | read | 15 previous plans card |
| generatePlan() | async create | 16 (returns a generating state, then the new plan) |

Records, aggregates, and plan outcomes recompute whenever createRun, updateRun, or deleteRun succeed (RUN-11, DSH-3, AIC-7).

## 5. Non-functional notes

Only what the design implies:

- **Localization:** English only, one language across all frames. US date formats ("Jul 7, 2026"). Metric units only (km, min/km).
- **Privacy and storage:** "No password needed - your runs stay on this device" (01) commits the product to local data with no account system.
- **Async and loading:** the only designed loading state is coach generation (16, skeletons plus dimmed content). No spinners, offline, or error states exist anywhere else, so screen loads are expected to be instant (consistent with local data).
- **Accessibility observations:** effort is never encoded by color alone (chips carry text plus a dot). Form fields all have visible labels. Focus, hover, and keyboard states aren't designed. The slider (02) and segmented control (10) need keyboard support decisions.
- **Responsiveness:** all frames are fixed 1440x1024 desktop. No breakpoints designed.
- **Visual system:** Foundations and Components pages define tokens (canvas #F6F6F3, coral primary, green/amber/coral status tones) and a component library (Button, Badge/Pill, Tag/Status, Stepper Button, Input/Field, Section header, Stat, Effort control, Option/Card). Build these as shared components, they repeat across screens.

## 6. Assumptions log

Numbered so teachers can review each one:

- **A1.** Welcome fields are required, and email must be a valid format. The design shows no markers or errors (WEL-5).
- **A2.** "Skip for now" (02) continues to step 2 and keeps the shown default of 20 km per week. Destination isn't designed.
- **A3.** End date, when set, must be on or after the start date (02).
- **A4.** "Back" (03) preserves values entered on 02.
- **A5.** "Good morning, Marko." varies with time of day. Only the morning variant is designed.
- **A6.** Goal statuses beyond "Not started" and "On track" (for example behind or completed) exist but aren't designed. Build the two shown, flag the rest.
- **A7.** The sort dropdown offers at least "Newest first" and "Oldest first". Only the closed control is designed.
- **A8.** The runs table scrolls vertically with no pagination (count 12 vs 10 visible rows).
- **A9.** Clicking a runs row opens Run detail (09).
- **A10.** Start time, elevation, and route type are display-only fields that remain empty for user-created runs until the designer answers how they're captured.
- **A11.** A run without a note shows no Note card on Run detail (or an empty state for it). Not designed.
- **A12.** In Add and Edit run, all fields except Note are required ("Note (optional)" is the only field marked optional).
- **A13.** The row menu closes on outside click or Escape.
- **A14.** Deleting from Run detail returns to Runs - List.
- **A15.** "Apply to weekly goal" updates the current goal target immediately and stays on the coach page. No confirmation is designed.
- **A16.** The first coach plan generates after the first run is logged (implied by the empty state copy).
- **A17.** The Settings goal stepper uses the same 0 to 60 km bounds as onboarding (02).
- **A18.** Saving a run refreshes every derived view: dashboard cards, chart, records, and coach insight numbers.
- **A19.** The "Filter" button (07, 08) has no designed panel and no defined effect on the Records tab. It stays non-functional until the designer specifies filtering.
- **A20.** Where screens conflict, each follows its own mock until the designer resolves it: the longest-run attribution (08 vs the list on 07), best pace 4:52 /km (05) vs 4:51 /km (08), and the note text on 11 vs 09.
- **A21.** "See the reasoning" and previous plans "View all" (15) have no designed destinations and stay non-functional in the first build.
- **A22.** Plan generation failure (16) isn't designed. On failure, keep showing the previous plan.
- **A23.** Settings (17) has no designed save confirmation or unsaved-changes state. Saving persists silently and stays on the page.
- **A24.** A record card with no qualifying run yet (for example no run of 10K or more) isn't designed. Hide that card until a designed empty variant exists.
- **A25.** No form error or validation visuals exist anywhere in the file. Use simple inline messages and confirm the pattern with the designer.

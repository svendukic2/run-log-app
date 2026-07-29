# Run Log Tracker: app brief

**One-line pitch:** Run Log is a desktop web app where a runner logs runs by hand, tracks progress against a weekly distance goal, and gets simple AI coaching suggestions.

> **Source:** Figma file [Run Log Tracker](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=1-40), page "Screens", 17 frames in 5 sections (Welcome & Onboarding, Dashboard, Runs, AI Coach, Settings). Everything in this brief comes from those frames. Inferences are labeled as inferences.
>
> **Notation:** Figma frame names and some UI copy contain a long dash character. Per DECODE writing rules, these documents write it as a hyphen (so the frame is referenced as "04 · Dashboard - Empty state"). Everything else is quoted exactly as designed.

## Problem and target users

The design shows a single-user tool for people who run and want to track it without any device integration. Every run is typed in manually (the run detail screen literally shows "Logged: Manual entry"). There's no sign-in: the welcome screen says "No password needed - your runs stay on this device."

**Inferred problem:** hobby runners want a simple, private way to see whether they're running enough each week, without GPS watches, social feeds, or accounts.

**Inferred target users:** individual recreational runners, from beginners to advanced. The inference comes from the onboarding running-level options: "Beginner - New to running or getting back into it", "Intermediate - Run regularly, comfortable with 5-10K", "Advanced - Training consistently, chasing new PRs" (03 · Setup - Running level).

## Core value proposition

Log a run in seconds, see one number that matters (kilometers this week vs your goal), and let the AI Coach turn your history into next week's target. The coach copy promises "safe weekly targets and simple pacing tips" with "safe progression" (14 · AI Coach - Empty state). Data stays on the device, so there's nothing to set up.

## Key user flows

1. **Onboarding:** Welcome → Setup - Weekly goal → Setup - Running level → Dashboard - Empty state
2. **Log a run:** Dashboard (or Runs) → Add run (modal) → save → Dashboard / Runs - List, updated
3. **Review activity:** Dashboard → Runs - List → Run detail → back to Runs - List ("All runs" breadcrumb)
4. **Manage a run:** Runs - List → Runs - Row menu → Edit run (modal) or Delete confirmation → Runs - List, updated
5. **Get coaching:** Dashboard ("Open coach") → AI Coach → Regenerate → AI Coach - Generating → AI Coach → "Apply to weekly goal"
6. **Update profile:** Settings → edit name, email, or default weekly goal → "Save changes"

## Screen inventory

| Screen name | Figma frame (linked) | Purpose |
|---|---|---|
| Welcome | [01 · Welcome](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=78-145) | Collect first name, last name, and email to create the local profile |
| Setup - Weekly goal | [02 · Setup - Weekly goal](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=5-2) | Set a weekly distance target (km) with start date and optional end date |
| Setup - Running level | [03 · Setup - Running level](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=43-2) | Pick Beginner, Intermediate, or Advanced so the coach can calibrate |
| Dashboard - Empty state | [04 · Dashboard - Empty state](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=55-44) | First-run dashboard prompting the user to log their first run |
| Dashboard | [05 · Dashboard](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=47-39) | Weekly goal progress, 8-week distance chart, recent runs, records, coach teaser |
| Runs - Empty state | [06 · Runs - Empty state](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=71-123) | Runs page before any run exists, with a single call to action |
| Runs - List | [07 · Runs - List](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=57-51) | Sortable table of all runs with route, date, distance, duration, pace, effort |
| Runs - Records | [08 · Runs - Records](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=61-53) | Personal records as six cards (longest run, fastest 5K and 10K, best pace, biggest week, longest streak) |
| Run detail | [09 · Run detail](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=62-55) | Full view of one run: stats, route sketch, note, and metadata, plus edit and delete |
| Add run (modal) | [10 · Add run (modal)](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=67-56) | Form to log a run: route name, distance, duration, date, effort, optional note |
| Edit run (modal) | [11 · Edit run (modal)](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=69-88) | Same form prefilled to change an existing run |
| Runs - Row menu | [12 · Runs - Row menu](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=101-174) | Per-row menu on the list with Edit and Delete |
| Delete confirmation | [13 · Delete confirmation](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=70-120) | Modal that confirms permanent deletion of a run |
| AI Coach - Empty state | [14 · AI Coach - Empty state](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=85-172) | Coach page before the first run, explains what coaching will do |
| AI Coach | [15 · AI Coach](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=72-127) | Current weekly plan with target, reasoning summary, trend stats, previous plans |
| AI Coach - Generating | [16 · AI Coach - Generating](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=74-129) | Loading state while a new plan is generated |
| Settings | [17 · Settings](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=75-129) | Edit profile (name, email) and the default weekly goal |

The file also contains Cover, Introduction, Foundations (color and type tokens), and Components (component library) pages. Those support the Screens page and don't add screens.

## In scope

Exactly what the 17 frames show:

- Three-step local onboarding (identity form, weekly goal with dates, running level)
- A dashboard with weekly goal status, run stats, an 8-week distance bar chart, recent runs, personal records, and an AI Coach teaser card
- Manual run logging, editing, and deleting via modals, with a confirmation before delete
- A runs table with sort control ("Newest first") and per-row actions, plus a Records tab
- A run detail page with distance, duration, average pace, elevation, route sketch, note, and metadata
- An AI Coach page that shows a generated weekly plan, can regenerate it (with a loading state), and can apply the suggested target to the weekly goal
- Settings for profile fields and a default weekly goal
- Empty states for Dashboard, Runs, and AI Coach

## Out of scope

Commonly expected but absent from the design, so not part of this build:

- Accounts and authentication: no sign-in, sign-out, password, password reset, or email verification ("No password needed" is explicit)
- Automatic tracking: no GPS, watch or phone import, no real maps (the route panel is a sketch, not a map)
- Filter UI: a "Filter" button exists on Runs - List, but no filter panel is designed anywhere in the file
- Pagination or infinite scroll controls on the runs table
- Mobile or tablet layouts: every frame is 1440x1024 desktop
- Notifications, reminders, sharing, social features, or multi-user support
- Unit switching (everything is km and min/km), language switching (English only)
- Data export, backup, or account deletion
- Editing the running level after onboarding (Settings doesn't offer it)
- Error, offline, and form-validation states (no error visuals exist anywhere in the file)

Where the design is ambiguous or self-contradictory, the tech spec records the working decision in its assumptions log (A1 to A25).

# Run Log Tracker: student handout

You have three inputs: the **app brief** (what the app is), the **tech spec** (what to build, screen by screen), and the **Figma design** (what it looks like). You'll turn them into a Jira board: **6 epics** and roughly **20 to 30 tasks**. This handout is the whole method on a few pages, with one finished example to copy.

Companion documents, next to this one: `01-brief-run-log-tracker` and `02-tech-spec-run-log-tracker`. Figma: [Run Log Tracker](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=1-40), page "Screens".

## The six words you need

| Word | Meaning |
|---|---|
| Epic | A large container ticket that groups related work. This project has exactly 6 |
| Task | One unit of work a pair can finish in 1 to 3 days. Every task lives inside exactly one epic |
| Requirement ID | Codes like RUN-5 in spec section 2. Every task must cite at least one |
| Acceptance criteria | The checks that prove a task is done, written as Given/When/Then |
| Story points | The relative size of a task (1, 2, 3, 5, 8). Points compare tasks to each other, they are not hours |
| Assumption | A numbered working decision (A1 to A25, spec section 6) where the design left a gap |

## Step by step

1. **Read the brief.** About 10 minutes. You're done when you can say what the app does in one sentence.
2. **Open the tech spec.** You only need section 1 (overview and terms), section 2 (requirements per screen), and section 6 (assumptions). Skip sections 3, 4, and 5 for this exercise, they matter when you build. Keep Figma open next to the spec, every requirement links to its frame.
3. **Create the six epics** from the table below. In Jira: Create, issue type "Epic". Copy the names as written.
4. **Write tasks** by walking through spec section 2, subsection by subsection. Group related requirements into one task (for example, ADD-1 to ADD-8 is one task). In Jira: Create, issue type "Task", and set the epic as parent. Use the recipe below for every task.
5. **Track coverage** with the checklist at the end of this handout. Cross off each requirement ID once a task covers it. You're done when all 76 are crossed off.
6. **Set priority, points, and due dates last**, in one pass over the whole board. It's much easier once every task exists.

## Your six epics

Deriving epics is normally the product manager's job. For this exercise they're given, so you can spend your energy on writing good tasks.

| Epic name | Spec sections | Figma screens | Component |
|---|---|---|---|
| Onboarding and profile creation | 2.1, 2.2, 2.3 | 01, 02, 03 | `onboarding` |
| App shell and navigation | DSH-1 and DSH-2 (in 2.4) | sidebar and header, on every screen | `shell` |
| Dashboard | 2.4 (the rest) | 04, 05 | `dashboard` |
| Run logging and management | 2.5 to 2.10 | 06 to 13 | `runs` |
| AI Coach | 2.11 | 14, 15, 16 | `coach` |
| Settings | 2.12 | 17 | `settings` |

Most epics end up with 3 to 6 tasks. If one of yours has 10, your tasks are too small. If it has 1, too big.

## The task recipe

| Field | How to fill it |
|---|---|
| Summary | Verb first, specific, under 10 words. Good: "Implement Add run modal with validation". Bad: "Runs stuff" |
| Description | Always the four-part template below |
| Priority | Use the priority table below |
| Story points | Compare to the anchor table below |
| Component | From the epic table above |
| Labels | `frontend` on every task. Add `design-review` when your context cites an assumption (A1 to A25), it means a designer still owes an answer |
| Due date | From the sprint calendar your teacher shares. Epics end with their sprint, tasks fit inside theirs. Never invent a date |

### Description template

```
As a user, I want [goal], so that [benefit].

Context: [1-2 sentences from the tech spec, with requirement IDs]
Figma: [link to the exact frame]

Acceptance criteria:
1. Given [starting situation], when [action], then [result you can see]
2. ...
(3 to 5 criteria per task)
```

Given/When/Then is a test in plain words. If you can't see the result on the screen, the criterion isn't testable, so rewrite it.

### Priority

| Priority | Use it when | Example from this app |
|---|---|---|
| Highest | Nothing works without it | Saving a run (ADD-2, ADD-3): dashboard, records, and coach all feed off runs |
| High | Core flow, but a workaround exists | Sort dropdown (RUN-3): the default "Newest first" order already works |
| Medium | Important, blocks nothing | Records cards (RUN-10, RUN-11) |
| Low | Polish | Route sketch on Run detail (DET-4) |

Rule of thumb: if you marked everything Highest, you haven't prioritized.

### Story points

Don't guess hours. Ask: "is this bigger or smaller than the anchors?"

| Points | Feels like | Anchor from this app |
|---|---|---|
| 1 | Static screen, no logic | AI Coach empty state (AIC-2) |
| 2 | One small interaction | Delete confirmation (DEL-1 to DEL-3) |
| 3 | A form with validation | Welcome profile form (WEL-1 to WEL-5) |
| 5 | Screen with data, states, and interactions | Runs list with sort and row menu (RUN-1 to RUN-8) |
| 8 | Complex flow across screens | AI Coach plan, regenerate, apply (AIC-3 to AIC-9) |

Example out loud: "Bigger than the delete dialog (2), smaller than the runs list (5), so it's a 3." Anything that feels bigger than 8 gets split into two tasks.

## One finished example

Your teacher builds this live in class. Keep it open while you work, it's the model for every task you write.

**The epic**

- **Name:** Run logging and management
- **Description:** Everything that lets a user create, browse, inspect, correct, and remove runs. Covers spec sections 2.5 to 2.10. Success: a user can go from zero runs to a maintained log without leaving the Runs area.
- **Component:** `runs`

**One task under it**

- **Summary:** Add delete run flow with confirmation dialog
- **Description:**

  As a user, I want a warning before a run is removed, so that I don't lose data by accident.

  Context: modal "Delete this run?" quotes the run name and says removal is permanent (DEL-1). "Delete run" deletes and refreshes, "Cancel" does nothing (DEL-2). Deletion recomputes records and weekly totals (DEL-3). Opens from the row menu and from Run detail.

  Figma: [13 · Delete confirmation](https://www.figma.com/design/DpYM8Pn053IODHZf8EJ7Z1/Run-Log-Tracker?node-id=70-120)

  Acceptance criteria:
  1. Given the row menu on "Morning loop", when I click "Delete", then a dialog shows "Delete this run?" and the text quotes "Morning loop"
  2. Given the dialog, when I click "Delete run", then the run disappears from the list and the "All runs" count drops by one
  3. Given the dialog, when I click "Cancel", then the run remains unchanged
  4. Given a deleted run held a record (for example longest run), when deletion completes, then the Records tab no longer shows that run as a source

- **Priority:** Medium (important, doesn't block logging or tracking)
- **Story points:** 2 (one dialog, one operation, matches the 2-point anchor)
- **Component and label:** `runs`, `frontend` (no assumption cited, so no `design-review`)
- **Due date:** from the sprint calendar, inside the sprint that finishes the Runs epic

## Check before you call it done

1. Every task has a verb-first summary, cites at least one requirement ID, and belongs to exactly one epic.
2. Every task has a user story and 3 to 5 Given/When/Then criteria you could check by looking at the screen.
3. All 76 requirement IDs on the checklist are crossed off.
4. No task is bigger than 8 points, and you used at least three priority levels.
5. Every task that cites an assumption (A1 to A25) carries the `design-review` label.

## Four traps

1. **Inventing features.** No login, no mobile layout, no filter panel: the design has none of these. If it has no screen and no requirement ID, it's not a task. Park it for the designer.
2. **Pasting spec text as the description.** The spec gets cited, not cloned. Write your own story and criteria.
3. **Estimating in hours.** "6 hours" fails the exercise. Compare to the anchors instead.
4. **Skipping designed states.** The designer drew empty and loading states on purpose (screens 04, 06, 14, 16). Each one needs its own criterion or task.

## Appendix: requirement checklist

Print this, cross off each ID when a task covers it. 76 in total.

| Screen | Requirement IDs |
|---|---|
| Welcome (2.1) | WEL-1, WEL-2, WEL-3, WEL-4, WEL-5 |
| Setup - Weekly goal (2.2) | GOAL-1, GOAL-2, GOAL-3, GOAL-4, GOAL-5, GOAL-6 |
| Setup - Running level (2.3) | LVL-1, LVL-2, LVL-3, LVL-4 |
| Dashboard (2.4) | DSH-1, DSH-2, DSH-3, DSH-4, DSH-5, DSH-6, DSH-7, DSH-8, DSH-9, DSH-10 |
| Runs - List, Records, empty (2.5) | RUN-1, RUN-2, RUN-3, RUN-4, RUN-5, RUN-6, RUN-7, RUN-8, RUN-9, RUN-10, RUN-11, RUN-12 |
| Run detail (2.6) | DET-1, DET-2, DET-3, DET-4, DET-5, DET-6, DET-7 |
| Add run (2.7) | ADD-1, ADD-2, ADD-3, ADD-4, ADD-5, ADD-6, ADD-7, ADD-8 |
| Edit run (2.8) | EDT-1, EDT-2, EDT-3, EDT-4 |
| Runs - Row menu (2.9) | MNU-1, MNU-2 |
| Delete confirmation (2.10) | DEL-1, DEL-2, DEL-3 |
| AI Coach (2.11) | AIC-1, AIC-2, AIC-3, AIC-4, AIC-5, AIC-6, AIC-7, AIC-8, AIC-9 |
| Settings (2.12) | SET-1, SET-2, SET-3, SET-4, SET-5, SET-6 |

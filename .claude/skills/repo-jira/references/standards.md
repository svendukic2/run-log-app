# Jira Ticket Standards

Rulebook for Jira ticket management on this project. Project-specific configuration (project key, story-points field ID, fix versions) lives in `.claude/jira-config.md`.

---

## Setup - first time on this project

The skill auto-creates `.claude/jira-config.md` on first use by gathering information from the user and discovering field IDs from Jira. You don't need to create it manually - but you can pre-create it to skip the setup questions.

**Template:**

```markdown
# Jira Project Configuration - Decode Academy Demo

## Project

| Field | Value |
|---|---|
| **Jira Project Key** | `DEMO` |
| **Project Name** | Decode Academy Demo |
| **Site** | https://decode.atlassian.net |

## Story Points Field

| Field ID | Name | Confirmed From |
|---|---|---|
| `customfield_XXXXX` | Story point estimate | DEMO-123 |

## Git Convention

| Field | Value |
|---|---|
| **Branch format** | `{type}/DEMO-{number}-{slug}` |
| **Main branch** | `main` |

## Phase Labels

| Label | Meaning |
|---|---|
| `mvp` | MVP scope |
| `phase-2` | Post-MVP scope |

## Notes

- [Any project-specific rules]
```

**Story-points field:** leave as `customfield_XXXXX` if unknown - the skill auto-discovers it and writes the confirmed value back to `.claude/jira-config.md`.

---

## 1. Ticket hierarchy

```
Project (DEMO)
└── Epics (feature areas)
    └── Tasks (technical implementation work)
        └── Subtasks (granular items, 1-4 hours each)
Sprints (2-week time boxes) group work across epics.
```

- **Epics** correspond to feature areas or deliverables.
- **Tasks** are the primary work unit - there is no Stories layer.
- Each task carries a technical-layer label (`BE` or `FE`) in both its summary and its Labels field.

---

## 2. Good summaries

**Format:** `[LAYER] Action / deliverable`

The technical-layer label is ALL CAPS and prefixed to the summary.

| Layer | Meaning | Example summary |
|---|---|---|
| `BE` | Backend / NestJS API | `[BE] Add user lookup endpoint` |
| `FE` | Frontend / Next.js app | `[FE] Build user profile card component` |
| `DOCS` | Documentation | `[DOCS] Write onboarding guide` |
| `QA` | Test planning / QA | `[QA] Write e2e test plan for user flow` |
| `INFRA` | CI/CD, tooling, config | `[INFRA] Set up GitHub Actions lint workflow` |

**Rules for a good summary:**
- Start with the `[LAYER]` prefix; the matching label MUST also be added to the Labels field at creation time.
- Use an imperative verb (`Add`, `Build`, `Fix`, `Refactor`).
- Be specific about the deliverable, not the activity ("Add user lookup endpoint", not "Work on backend").
- Keep it under ~80 characters.

---

## 3. Good descriptions

> The Jira MCP tool uses REST API v3, which accepts **Markdown**. Use Markdown in all descriptions - never Jira wiki markup.

**Task description template:**

```
## Task Overview

[What needs to be implemented and why]

## Technical Layer

**Label:** [BE | FE | DOCS | QA | INFRA]

## Acceptance Criteria

- Criterion 1 (observable, testable)
- Criterion 2

## Technical Notes

[Implementation approach, endpoints, component names, data shapes]

## Dependencies

- Task: [DEMO-xxx]
- External: [API access, content, credentials]

## Definition of Done

- Code written and reviewed
- Unit tests passing
- Manually tested
- Merged to main
```

**Epic description template:**

```
## Epic Overview

[What this epic delivers]

## Business Value

[Why it matters]

## Acceptance Criteria

- Criterion 1
- Criterion 2

## Definition of Done

- All child tasks completed and accepted
- Tests passing
- Code reviewed and merged
- Documentation updated
```

### Writing good acceptance criteria

- Each criterion is **observable and testable** - a reviewer can objectively say pass or fail.
- Describe the *outcome*, not the implementation ("User sees a validation error when email is blank", not "Add an if-check in the controller").
- Cover the happy path **and** the important edge/error cases.
- One idea per bullet.

---

## 4. When to set story points

- **Every Task and Spike gets story points**, using the Fibonacci scale below - **except `DOCS` and `QA` tasks**, which are never estimated (omit the field entirely).
- A ticket **cannot** move from Backlog → To Do without story points.

| Points | Complexity | Days (approx) | Example |
|---|---|---|---|
| **1** | Trivial | ~0.5 day | Simple config change |
| **2** | Simple | ~1 day | Static content / small component |
| **3** | Moderate | 1-2 days | Form with validation |
| **5** | Complex | 2-3 days | New endpoint + wiring + tests |
| **8** | Very complex | 3-5 days | Full feature slice across BE + FE |
| **13** | Epic-level | 5-8 days | Should be split |

- Tasks **> 8 points** should be split.
- Tasks **≥ 13 points** must be broken down before sprint planning.
- Map hours/complexity **directly** to this scale - never invent a different one.

---

## 5. Labels

Every ticket carries at least a technical-layer label and a phase label.

### Technical-layer labels (mandatory, matches summary prefix)
- `BE` - backend / NestJS
- `FE` - frontend / Next.js
- `DOCS` - documentation
- `QA` - test planning
- `INFRA` - CI/CD, tooling, config

### Phase labels
- `mvp` - MVP scope
- `phase-2` - post-MVP scope

### Status / signal labels (optional)
- `blocked` - cannot proceed
- `needs-design` - awaiting designs
- `bug`, `regression`, `security`, `performance` - bug classification

**Rule:** labels are set **at creation time**, never bolted on afterwards.

---

## 6. Spikes

**Format:** `[LAYER] Spike - [Question/Investigation]`

Example: `[BE] Spike - Evaluate OpenAPI type-generation options`

**Spike description template:**

```
## Research Question

[What do we need to learn?]

## Time Box

[Maximum: 4 hours / 1 day / 2 days]

## Deliverable

[Document, proof of concept, decision recommendation]

## Success Criteria

- Question answered
- Findings documented
- Recommendation made
```

---

## 7. Issue status workflow

```
Backlog → To Do → In Progress → Code Review → Testing → Done
```

| Status | Definition | Trigger |
|---|---|---|
| **Backlog** | Not yet estimated or prioritized | Default for new issues |
| **To Do** | Ready, estimated, in a sprint | Sprint planning |
| **In Progress** | Actively being worked on | Developer starts |
| **Code Review** | PR open, awaiting review | PR submitted |
| **Testing** | Merged, QA testing | PR merged |
| **Done** | Accepted, meets DoD | Acceptance confirmed |

**Critical:** a ticket cannot move Backlog → To Do without story points (except DOCS/QA).

---

## 8. Priority definitions

| Priority | Definition | Response |
|---|---|---|
| **Blocker** | Stops all work | Immediate |
| **High** | Critical path | Same day |
| **Medium** | Important, not blocking | 2-3 days |
| **Low** | Can be deferred | Next sprint or later |

---

## 9. Linking & dependencies

| Link type | Usage |
|---|---|
| **Blocks** | This must be done before the linked issue |
| **Relates To** | Related but not dependent |
| **Duplicates** | Duplicate of another issue |

**Important:** use `"Blocks"` as the link type with correct directionality (X blocks Y → `inward_issue_key: X`, `outward_issue_key: Y`). Do **not** use `"is blocked by"` as the link type - it fails in the API.

---

## 10. Field-ID discovery

Before creating tickets, confirm the correct custom field IDs by inspecting an existing issue with `jira_get_issue` using `fields: "*all"`.

Common story-points field IDs:

| Field ID | Used in |
|---|---|
| `customfield_10432` | Team-managed / next-gen projects |
| `customfield_10117` | Company-managed / classic projects |

Once confirmed, document in `.claude/jira-config.md` and do not re-probe.

---

## 11. Naming conventions quick reference

| Item | Format | Example |
|---|---|---|
| **Epic** | `[Feature area name]` | `User Profile` |
| **Task** | `[LAYER] Action` | `[BE] Add user lookup endpoint` |
| **Spike** | `[LAYER] Spike - [Question]` | `[BE] Spike - Evaluate OpenAPI codegen` |
| **Subtask** | `[Action] [item]` | `Add user lookup service method` |
| **Bug** | `[LAYER] [Issue description]` | `[FE] Profile card crashes on empty name` |

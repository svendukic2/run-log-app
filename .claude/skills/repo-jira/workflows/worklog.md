> **Tools used:** Jira worklog, search, transition, update and user-lookup tools. Connector: `addWorklogToJiraIssue`, `searchJiraIssuesUsingJql`, `getTransitionsForJiraIssue`, `transitionJiraIssue`, `editJiraIssue`, `atlassianUserInfo`, `lookupJiraAccountId`. Self-hosted: `jira_add_worklog`, `jira_search`, `jira_get_transitions`, `jira_transition_issue`, `jira_update_issue`, `jira_get_user_profile`, `jira_get_agile_boards`, `jira_get_sprints_from_board`.

## Step 0 - Preflight check

Two Jira setups are supported (see `references/jira-access.md`). Establish which is active before anything else:

1. If `getAccessibleAtlassianResources` is available → **connector**. Call it once and keep the returned `cloudId`; every later Jira call needs it.
2. Else if `jira_get_issue` is available → **self-hosted**. No `cloudId` is needed.
3. If neither is present, stop and tell the user: "No Jira MCP server is available. See `.claude/skills/repo-jira/references/jira-access.md` to set up either the Atlassian connector or `.mcp.json`, then restart Claude Code."

Below, tools are written as `connector-name` / `self-hosted-name` - use the one matching your active setup.

**Sprint assignment differs between the two setups** - see operation 2.

---

## Purpose

Handle all worklog and post-creation task setup: logging hours, assigning sprints, transitioning status, and querying timesheets.

---

## Worklog comment format - enforced at all times

All worklog comments MUST use bullet format, one bullet per line, a newline between each:

```
• Short phrase
• Another short phrase
• Third phrase
```

- Each bullet on its own line - never inline, never comma-separated.
- Prefixed with `•`.
- Max 3-6 words per bullet.
- Never a paragraph or a full sentence.
- ⚠️ Worklog comments **cannot be edited** via the MCP tools on either setup - if the wrong comment was logged, the user must fix it manually in Jira.

---

## Operations

### 1 - Log hours on a ticket

When the user asks to log hours:

1. Confirm: issue key, hours, comment (ask if not provided).
2. Format the comment as bullets.
3. Call `addWorklogToJiraIssue` / `jira_add_worklog` with:
   - the issue key
   - time spent (e.g. `7h`, `1h 30m`)
   - a start timestamp - today's date at `09:00:00.000+0000` unless the user specifies otherwise
   - the comment, in bullet format

### 2 - Assign to sprint

**This is the one operation where the two setups genuinely differ.**

**Self-hosted** - fully automatic:

1. Call `jira_get_agile_boards` with the project key (`DEMO`) to get the board ID.
2. Call `jira_get_sprints_from_board` with `state: "active"` to get the active sprint.
3. Show the active sprint name and ask for confirmation.
4. Update via `jira_update_issue`, setting the Sprint custom field to the sprint ID **as an integer** (confirm the field ID from `.claude/jira-config.md`).

**Connector** - the sprint ID has to come from the user, because there is no board or sprint listing tool:

1. Tell the user plainly: "The Atlassian connector does not expose sprint listing, so I cannot look up the active sprint. Open the board in Jira and give me the sprint ID - it is the `sprint=` number in the board URL when a sprint is selected."
2. Once they provide it, set the Sprint custom field with `editJiraIssue`, sprint ID **as an integer**.
3. Do **not** guess a sprint ID, and do not silently skip the step. If the user cannot find the ID, say the assignment has to be done in the Jira UI.

### 3 - Transition status

When the user asks to move a ticket to a new status (including the auto-triggers "I'm done", "ready for review", "ready for QA", "in progress"):

1. Call `getTransitionsForJiraIssue` / `jira_get_transitions` to get the available transitions for the issue. Never assume a transition name exists - workflows differ per project.
2. Match the user's intent to the right transition name (e.g. "ready for review" → `Code Review`, "ready for QA" → `Testing`, "I'm done" → `Done`).
3. Call `transitionJiraIssue` / `jira_transition_issue` with the matching transition ID.

> If a transition is rejected on a reopened ticket, the cause is usually a lingering Resolution value. On the connector, clear it with `editJiraIssue` and `{"resolution": null}`, then retry.

### 4 - Query timesheet

When the user asks how many hours they've logged:

**Step 1 - Resolve the user's email.**
Check `.claude/jira-config.md` for a stored email. If absent: on the connector call `atlassianUserInfo` for the logged-in user, or `lookupJiraAccountId` to resolve someone else by name; on self-hosted call `jira_get_user_profile`. Use that email in all worklog JQL queries.

**Step 2 - Build the JQL query.** No project filter = all projects; add one only if the user asks.

| Period | JQL |
|--------|-----|
| Today | `worklogAuthor = "email" AND worklogDate = "YYYY-MM-DD"` |
| Specific date | `worklogAuthor = "email" AND worklogDate = "YYYY-MM-DD"` |
| This week | `worklogAuthor = "email" AND worklogDate >= startOfWeek() AND worklogDate <= endOfWeek()` |
| Date range | `worklogAuthor = "email" AND worklogDate >= "YYYY-MM-DD" AND worklogDate <= "YYYY-MM-DD"` |
| Specific project | append `AND project = DEMO` |

**Step 3 - Filter by started date.**
⚠️ Jira returns all worklogs on matching issues, not just those in the requested period. After fetching, keep only entries whose `started` field falls within the requested range.

**Step 4 - Present results.**

| Issue | Project | Summary | Comment | Hours |
|-------|---------|---------|---------|-------|
| ... | ... | ... | ... | ... |
| **Total** | | | | **Xh** |

If **no entries found** for the period:
1. Tell the user: "No hours logged for [period]."
2. Fetch their in-progress tickets: `assignee = "email" AND status = "In Progress" ORDER BY updated DESC`.
3. Present them as a numbered list and ask: "How many hours would you like to log on each?"
4. Wait for the user to specify hours and comments, then log each using the bullet-format rule.

---

## Rules

- Always use bullet format for worklog comments - no exceptions.
- Worklog comments cannot be edited via MCP - warn the user if they ask to fix one.
- Never log hours without confirming the issue key, duration, and comment first.
- Sprint assignment uses the Sprint field as an integer (not a string or object). On the connector, ask the user for the sprint ID rather than guessing one.
- Assignee: leave blank unless the user explicitly requests assignment.

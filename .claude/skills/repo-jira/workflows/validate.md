> **Tools used:** `Bash(git:*)` (branch name), `Read` (load standards), plus a Jira get-issue tool: `getJiraIssue` (connector) or `jira_get_issue` (self-hosted).

Validate a Jira ticket against the standards in `references/standards.md`.

## Step 0 - Preflight check

Two Jira setups are supported (see `references/jira-access.md`). Establish which is active before anything else:

1. If `getAccessibleAtlassianResources` is available → **connector**. Call it once and keep the returned `cloudId`; every later Jira call needs it.
2. Else if `jira_get_issue` is available → **self-hosted**. No `cloudId` is needed.
3. If neither is present, stop and tell the user: "No Jira MCP server is available. See `.claude/skills/repo-jira/references/jira-access.md` to set up either the Atlassian connector or `.mcp.json`, then restart Claude Code."

Below, tools are written as `connector-name` / `self-hosted-name` - use the one matching your active setup.

## Step 1 - Resolve ticket ID

The argument passed was: **`$ARGUMENTS`**

- If the argument contains a ticket ID after `validate` (e.g. `validate DEMO-110`), use it directly.
- Otherwise extract it from the current branch: `git branch --show-current` - the format is `{type}/DEMO-{number}-{slug}`, so take `DEMO-{number}`.
- If neither yields a key, ask the user for the ticket ID.

## Step 2 - Load standards

Read `.claude/skills/repo-jira/references/standards.md` and `.claude/jira-config.md` (if it exists) before proceeding.

## Step 3 - Fetch the ticket

Fetch with `getJiraIssue` / `jira_get_issue`, requesting all fields (`fields: ["*all"]`) so custom fields like story points are included. If it errors, tell the user: "Ticket [KEY] not found or not accessible - check the key and try again."

## Step 4 - Validate against standards

Determine the issue type (Epic, Task, Spike, Bug) and apply the relevant checks.

### For Tasks and Spikes

| Check | Rule |
|---|---|
| **Summary format** | `[LAYER] Action` - e.g. `[BE] Add user lookup endpoint` |
| **Technical-layer label** | Label matching `[LAYER]` in the summary must be in the Labels field |
| **Phase label** | Must have `mvp` or `phase-2` |
| **Story points** | Required (Fibonacci: 1,2,3,5,8,13) - **except DOCS and QA tasks** |
| **Epic link** | Must be linked to a parent epic |
| **Priority** | Must be set (Blocker/High/Medium/Low) |
| **Description format** | Must use **Markdown** headings (`##`) - not wiki markup |
| **Description sections** | Must include: Task Overview, Acceptance Criteria, Definition of Done |

### For Epics

| Check | Rule |
|---|---|
| **Summary** | Clear feature-area name |
| **Phase label** | Must have `mvp` or `phase-2` |
| **Priority** | Must be set |
| **Description format** | Must use Markdown headings |
| **Description sections** | Must include: Epic Overview, Acceptance Criteria, Definition of Done |

## Step 5 - Output validation report

```
## Validation Report - {KEY}
{summary}
Issue type: {type}  |  Status: {status}

### Results

| Check | Status | Detail |
|---|---|---|
| Summary format | ✅ / ❌ | [what was found] |
| Labels | ✅ / ❌ | [what was found] |
| Story points | ✅ / ❌ / ⏭ skipped (DOCS/QA) | [value or missing] |
| Epic link | ✅ / ❌ | [value or missing] |
| Priority | ✅ / ❌ | [value] |
| Description format | ✅ / ❌ | [markup style found] |
| Description sections | ✅ / ❌ | [missing sections if any] |

### Verdict
✅ PASS - ticket meets all standards.
- or -
❌ FAIL - X issue(s) found. Fix the items marked ❌ above.
```

If there are failures, list concrete fixes:

```
### Fixes needed
1. [Specific action to fix issue 1]
2. [Specific action to fix issue 2]
```

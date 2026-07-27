> **Tools used:** `Bash(git:*)` (branch name), plus a Jira get-issue tool: `getJiraIssue` (connector) or `jira_get_issue` (self-hosted).

Fetch the Jira ticket for the current branch and summarise what still needs to be done.

## Step 0 - Preflight check

Two Jira setups are supported (see `references/jira-access.md`). Establish which is active before anything else:

1. If `getAccessibleAtlassianResources` is available → **connector**. Call it once and keep the returned `cloudId`; every later Jira call needs it.
2. Else if `jira_get_issue` is available → **self-hosted**. No `cloudId` is needed.
3. If neither is present, stop and tell the user: "No Jira MCP server is available. See `.claude/skills/repo-jira/references/jira-access.md` to set up either the Atlassian connector or `.mcp.json`, then restart Claude Code."

Below, tools are written as `connector-name` / `self-hosted-name` - use the one matching your active setup.

## Step 1 - Resolve ticket ID

The argument passed was: **`$ARGUMENTS`**

- If the argument contains a ticket ID after `status` (e.g. `status DEMO-160`), use it directly.
- Otherwise extract it from the current branch: `git branch --show-current`. The branch format is `{type}/DEMO-{number}-{slug}` - take `DEMO-{number}`.
- If neither yields a key, ask the user for the ticket ID.

## Step 2 - Fetch and summarise

Fetch the ticket with `getJiraIssue` / `jira_get_issue`. If it returns an error, tell the user: "Ticket [KEY] not found or not accessible - check the key and try again."

Output:

```
## {KEY} - {summary}

**Status**: {status}   **Assignee**: {assignee}

### Goal
{1-2 sentence description}

### Acceptance Criteria
{bulleted list from the description}

### What's done (based on git log since branch cut)
{read `git log main..HEAD --oneline` and match commits to criteria}

### What's likely still needed
{criteria not yet addressed - inferred from commits and file state}
```

Check for subtasks or linked issues. List any blockers or dependencies if present.

Keep the output concise - this is a quick context check, not a full audit.

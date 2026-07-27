> **Tools used:** `Read` (load config), plus a Jira JQL-search tool: `searchJiraIssuesUsingJql` (connector) or `jira_search` (self-hosted).

Search Jira issues using natural language or JQL filters.

## Step 0 - Preflight check

Two Jira setups are supported (see `references/jira-access.md`). Establish which is active before anything else:

1. If `getAccessibleAtlassianResources` is available → **connector**. Call it once and keep the returned `cloudId`; every later Jira call needs it.
2. Else if `jira_search` is available → **self-hosted**. No `cloudId` is needed.
3. If neither is present, stop and tell the user: "No Jira MCP server is available. See `.claude/skills/repo-jira/references/jira-access.md` to set up either the Atlassian connector or `.mcp.json`, then restart Claude Code."

Below, tools are written as `connector-name` / `self-hosted-name` - use the one matching your active setup.

## Step 1 - Load config

Read `.claude/jira-config.md` for the project key (default `DEMO`).

## Step 2 - Parse the search query

The argument passed was: **`$ARGUMENTS`**

Translate the argument into a JQL query. Examples:

| User says | JQL |
|---|---|
| `search label=BE status=todo` | `project = DEMO AND labels = BE AND status = "To Do"` |
| `search my open tasks` | `project = DEMO AND assignee = currentUser() AND status != Done` |
| `search epic DEMO-106 tasks` | `"Epic Link" = DEMO-106 AND issuetype = Task` |
| `search blocked tasks` | `project = DEMO AND labels = blocked` |
| `search unestimated BE tasks` | `project = DEMO AND labels = BE AND "Story Points" is EMPTY AND issuetype = Task` |
| `search sprint` | `project = DEMO AND sprint in openSprints()` |

If the argument already looks like raw JQL, pass it through directly.

## Step 3 - Execute search

Run via `searchJiraIssuesUsingJql` / `jira_search` with the constructed JQL. Limit to 25 results by default.

## Step 4 - Output results

```
## Search Results
Query: [JQL used]
Found: X issues

| Key | Summary | Status | Assignee | Points |
|---|---|---|---|---|
| DEMO-123 | [summary] | In Progress | [name] | 5 |
| DEMO-124 | [summary] | To Do | - | 3 |
```

If no results, suggest refining the query.
If >25 results, show the first 25 and tell the user to narrow the search.

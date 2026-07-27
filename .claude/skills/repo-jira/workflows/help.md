**`/jira` - Jira skill**

Manage Jira tasks, epics, and ticket status for project `DEMO` from Claude Code.

**Usage:**

| Command | Description |
|---|---|
| `/jira` | Create or manage tasks/epics as Product Owner |
| `/jira create tasks for [description]` | Break down a feature into tasks |
| `/jira status` | Summarise the ticket on the current branch |
| `/jira status DEMO-123` | Summarise a specific ticket |
| `/jira validate` | Validate the current-branch ticket against standards |
| `/jira validate DEMO-123` | Validate a specific ticket against standards |
| `/jira search [query]` | Search issues by label, status, assignee, etc. |
| `/jira worklog DEMO-123 2h` | Log hours on a ticket |
| `/jira timesheet` | Show today's logged hours across all projects |
| `/jira sprint DEMO-123` | Assign a ticket to the active sprint |
| `/jira transition DEMO-123` | Move a ticket to a new status |
| `/jira help` | Show this help |

**Auto-triggers (no command needed):**
- Mentioning a `DEMO-xxx` key, or asking "what's left" → status
- "I'm done", "ready for review", "ready for QA" → transition
- "log X hours", "how many hours did I log" → worklog / timesheet
- "search for tickets", "find issues" → search

**Prerequisites:**
- `.claude/jira-config.md` - project key (`DEMO`), story-points field, branch format (auto-created on first use)
- A Jira MCP server. Either one works:
  - **Atlassian connector** on claude.ai (OAuth, no config file) - simplest
  - **Self-hosted `mcp-atlassian`** via `.mcp.json` (copy `.mcp.json.example`) - adds sprint automation and works headless

  Setup for both, plus troubleshooting: `.claude/skills/repo-jira/references/jira-access.md`

**Note:** `/jira sprint` is fully automatic only on the self-hosted setup. On the connector you must supply the sprint ID, because it exposes no sprint listing.

**Standards:** `.claude/skills/repo-jira/references/standards.md`
**Jira access:** `.claude/skills/repo-jira/references/jira-access.md`

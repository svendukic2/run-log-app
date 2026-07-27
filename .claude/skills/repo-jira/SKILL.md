---
name: repo-jira
description: This skill should be used when the user asks to "create a Jira task", "break down a feature into tasks", "create a spike", "what's left on this ticket", "summarise the current ticket", "search issues", "log hours", "log my timesheet", "transition a ticket", "move to review", "validate a ticket", or says "/jira". Also auto-triggers when a DEMO-xxx ticket is mentioned, when the user asks "what's left", or when the user signals completion ("I'm done", "ready for QA"). Routes to the create / status / search / worklog / validate / help workflow based on arguments or conversation context.
argument-hint: "[create tasks for X | status [DEMO-123] | search [query] | worklog | timesheet | transition [DEMO-123] | validate [DEMO-123] | help]"
allowed-tools: Read, Bash(git:*), Skill, mcp__claude_ai_Atlassian__getAccessibleAtlassianResources, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__createJiraIssue, mcp__claude_ai_Atlassian__editJiraIssue, mcp__claude_ai_Atlassian__addWorklogToJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue, mcp__claude_ai_Atlassian__getTransitionsForJiraIssue, mcp__claude_ai_Atlassian__transitionJiraIssue, mcp__claude_ai_Atlassian__createIssueLink, mcp__claude_ai_Atlassian__getIssueLinkTypes, mcp__claude_ai_Atlassian__atlassianUserInfo, mcp__claude_ai_Atlassian__lookupJiraAccountId, mcp__claude_ai_Atlassian__getVisibleJiraProjects, mcp__claude_ai_Atlassian__getJiraProjectIssueTypesMetadata, mcp__claude_ai_Atlassian__getJiraIssueTypeMetaWithFields, mcp__mcp-atlassian__jira_get_issue, mcp__mcp-atlassian__jira_search, mcp__mcp-atlassian__jira_create_issue, mcp__mcp-atlassian__jira_update_issue, mcp__mcp-atlassian__jira_add_worklog, mcp__mcp-atlassian__jira_get_transitions, mcp__mcp-atlassian__jira_transition_issue, mcp__mcp-atlassian__jira_link_to_epic, mcp__mcp-atlassian__jira_get_agile_boards, mcp__mcp-atlassian__jira_get_sprints_from_board, mcp__mcp-atlassian__jira_get_user_profile, mcp__mcp-atlassian__jira_search_fields
---

> **Tools used:** the Jira MCP tools listed above (invoked via the delegated workflow files), plus `Read`, `Bash(git:*)`, `Skill`.

The user invoked this skill with the argument: **`$ARGUMENTS`**

This is a **routing skill**. Read `$ARGUMENTS` (and the conversation context), pick exactly one workflow, read that workflow file, and follow its instructions inline. Do nothing else.

## Project config

Project-specific settings (Jira project key `DEMO`, story-points field ID, branch format `{type}/DEMO-{number}-{slug}`) live in **`.claude/jira-config.md`**. Workflows read it; if it is missing, the `create` workflow gathers the values and writes it on first use.

## Jira access - two supported setups

Jira is reached over MCP, and **two different servers can provide it**. This skill works with either; only the tool names differ. Full setup instructions, trade-offs and troubleshooting are in **`references/jira-access.md`** - point students there before first use.

| Setup | Tool names | Configured in |
|---|---|---|
| **A.** Official Atlassian connector on claude.ai | `getJiraIssue`, `createJiraIssue`, `searchJiraIssuesUsingJql`, … | claude.ai → Settings → Connectors (OAuth, no file) |
| **B.** Self-hosted `mcp-atlassian` server | `jira_get_issue`, `jira_create_issue`, `jira_search`, … | `.mcp.json` (copy from `.mcp.json.example`) |

**Use whichever set is present in the session.** The `allowed-tools` list above names both; tools from a server that is not configured simply do not appear. Never assume one set exists without checking the preflight step.

### Differences that change how a workflow behaves

- **Setup A needs a `cloudId` on every call.** Fetch it once from `getAccessibleAtlassianResources` and reuse it for the session. Setup B takes the site URL from `.mcp.json`, so no `cloudId` is involved.
- **Setup A has no board or sprint tools.** The active sprint cannot be discovered automatically; `worklog.md` documents the manual route. Setup B has `jira_get_agile_boards` and `jira_get_sprints_from_board`.
- **Linking a task to an epic differs by project type on Setup A.** Team-managed projects use `parent`; company-managed use the Epic Link custom field via `additional_fields`. Setup B hides this behind `jira_link_to_epic`.
- **Setup A writes Markdown natively** via `contentFormat: "markdown"`, which satisfies the Markdown rule in `references/standards.md` without extra effort.

---

## Auto-triggers (no explicit /jira needed)

These fire automatically based on conversation context - read the matched workflow and execute it inline:

| Conversation signal | Workflow |
|---|---|
| A `DEMO-xxx` ticket number is mentioned, or the user asks "what do I need to do", "what's left", or "what's on this ticket" | `status.md` |
| User says "I'm done", "finished", "mark as done", "close the ticket", "moving to review", "ready for review", "ready for QA", "opening a PR", "starting this", "in progress", "reopen" | `worklog.md` (transition section) |
| User asks "how many hours", "what did I log", "show my timesheet", "hours today/this week" | `worklog.md` (timesheet section) |
| User asks "log X hours on DEMO-xxx", "add worklog", "track time" | `worklog.md` (log-hours section) |
| User asks "search for tickets", "find issues", "show me tasks with label X", "what's in the sprint" | `search.md` |
| User asks to "validate this ticket", "check if DEMO-xxx is correct" | `validate.md` |

---

## Explicit routing (when /jira is invoked with an argument)

Based on the argument above, do exactly one of the following and nothing else:

- If the argument is exactly `help` → read `.claude/skills/repo-jira/workflows/help.md` and output its contents, then stop.
- If the argument starts with `status` → read `.claude/skills/repo-jira/workflows/status.md` and follow its instructions.
- If the argument starts with `validate` → read `.claude/skills/repo-jira/workflows/validate.md` and follow its instructions.
- If the argument starts with `search` → read `.claude/skills/repo-jira/workflows/search.md` and follow its instructions.
- If the argument starts with `worklog` or `log` or `hours` or `timesheet` or `sprint` or `transition` → read `.claude/skills/repo-jira/workflows/worklog.md` and follow its instructions. (Note: `transition` and `sprint` route here - these are post-creation task ops handled alongside worklogs.)
- Otherwise → read `.claude/skills/repo-jira/workflows/create.md` and follow its instructions.

---

## Supporting Files

- **`workflows/`** - one file per sub-command: `create.md`, `status.md`, `search.md`, `worklog.md`, `validate.md`, `help.md`
- **`references/standards.md`** - Jira naming conventions, field rules, description templates

# Jira Project Configuration - Decode Academy Demo

## Project

| Field | Value |
|---|---|
| **Jira Project Key** | `DEMO` |
| **Project Name** | Decode Academy Demo |
| **Jira URL** | `https://decode.atlassian.net` |

## Story Points Field

| Field ID | Name | Note |
|---|---|---|
| `customfield_XXXXX` | Story point estimate | Placeholder - the `repo-jira` skill auto-discovers the real field ID on first use and writes it back here |

## Git Convention

| Field | Value |
|---|---|
| **Branch format** | `{type}/DEMO-{number}-{slug}` - e.g. `feat/DEMO-160-user-profile-card` |
| **Commit format** | `{type}({scope}): {description} (DEMO-{number})` - scope is `backend` \| `frontend` |
| **Main branch** | `main` |

## Notes

- **Jira is the source of truth** for tasks, statuses, and acceptance criteria.
- **Working on your own project?** Replace the Jira URL and project key above with your
  own. A free Jira Cloud site is enough; nothing else in the skill needs changing.
- **Access is over MCP, and two setups are supported:** the official Atlassian connector
  on claude.ai (OAuth, no file to edit) or a self-hosted `mcp-atlassian` server
  configured in `.mcp.json` (copy from `.mcp.json.example`). Setup steps, trade-offs and
  troubleshooting for both:
  `.claude/skills/repo-jira/references/jira-access.md`.
- Either setup only reaches Jira sites **your own account can already see**. Neither
  grants new access.

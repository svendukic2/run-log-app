# Connecting Claude Code to Jira

The `/jira` skill does not talk to Jira directly. It calls tools provided by an **MCP
server**, and there are two different servers that can supply them. This file explains
both, so you can pick one and know what you are getting.

Everything in the skill works either way. The only thing that changes is which tool
names exist in your session.

---

## What MCP is, in one paragraph

MCP (Model Context Protocol) is how Claude Code reaches systems outside your repo:
Jira, GitHub, a database, a design tool. An MCP server exposes a list of **tools** and
Claude calls them like functions. Every tool arrives under a namespaced name of the form
`mcp__<server-name>__<tool-name>`, which is how Claude Code keeps tools from different
servers apart. Nothing about MCP is Jira-specific; Jira is just the example here.

---

## Option A: the official Atlassian connector (recommended to start)

Authorized once through claude.ai. There is no config file in the repo and no token on
your disk.

### Setup

1. Open **claude.ai → Settings → Connectors**.
2. Find **Atlassian** and click connect. An Atlassian OAuth screen opens.
3. Approve access to the site (`your-org.atlassian.net`) you want Claude to reach.
4. Restart Claude Code so it picks up the connector.
5. Verify: run `/mcp` and confirm Atlassian is listed.

### Tool names you get

`mcp__claude_ai_Atlassian__getJiraIssue`, `...__createJiraIssue`,
`...__searchJiraIssuesUsingJql`, and so on. Camel-case, no `jira_` prefix.

### Things to know

- **Every call takes a `cloudId`.** Get it once per session from
  `getAccessibleAtlassianResources` and reuse it. The skill's workflows do this in their
  preflight step.
- **Descriptions are Markdown.** Pass `contentFormat: "markdown"` and the connector
  converts to Atlassian Document Format for you.
- **Confluence comes along for free** — the same connector exposes page read/write, which
  the self-hosted option below does not cover.

### What this option cannot do

| Missing                               | Workaround                                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| List boards, list sprints             | Sprint cannot be discovered automatically. Read the sprint ID from the Jira UI and set it with `editJiraIssue`.                           |
| Delete an issue                       | Delete it in the Jira UI.                                                                                                                 |
| Batch-create issues                   | Issues are created one call at a time. A ten-task breakdown is ten calls: slower, but it works.                                           |
| Upload or download attachments        | Handle attachments in the Jira UI.                                                                                                        |
| Remove an existing issue link         | `createIssueLink` exists; removing one is a UI job.                                                                                       |
| Run headless (`claude --print`, cron) | The connector is authorized interactively, so it may be unavailable in an automated run. Use Option B if you need Jira inside automation. |

It also only works with **Jira Cloud**, not a self-hosted Jira Server / Data Center.

---

## Option B: a self-hosted MCP server (`.mcp.json`)

You run the MCP server yourself, on your own machine, configured by a file in the repo.
More setup, more capability, and you see how an MCP server is actually wired.

### Setup

1. **Create an Atlassian API token** at
   <https://id.atlassian.com/manage-profile/security/api-tokens>. Copy it; you cannot
   view it again afterwards.
2. **Install a runner.** [`uv`](https://docs.astral.sh/uv/) provides `uvx`, which runs the
   server without installing it globally:

   ```bash
   brew install uv        # macOS
   ```

3. **Create the config** from the committed template:

   ```bash
   cp .mcp.json.example .mcp.json
   ```

4. **Fill in your values** in `.mcp.json`: `JIRA_URL`, `JIRA_USERNAME` (your Atlassian
   account email), `JIRA_API_TOKEN` (the token from step 1).
5. Restart Claude Code, then run `/mcp` to confirm the server started.

### `.mcp.json` is gitignored, and it must stay that way

It holds a real API token. It is already listed in `.gitignore`; only `.mcp.json.example`
is committed. Before your first commit, confirm:

```bash
git check-ignore -v .mcp.json
```

If that prints nothing, **stop and fix `.gitignore`** before committing anything.

### The server name decides the tool names

This is the part worth understanding, because it explains the names in the skill files.
The key under `mcpServers` becomes the middle segment of every tool name:

```json
{
  "mcpServers": {
    "mcp-atlassian": {  ← this name
      ...
    }
  }
}
```

With the key `mcp-atlassian`, the server's `jira_get_issue` tool arrives as
`mcp__mcp-atlassian__jira_get_issue`. Rename the key to `jira` and the same tool becomes
`mcp__jira__jira_get_issue`, and any skill that named the old form stops matching. **Keep
the key as `mcp-atlassian`** so the names in this skill line up.

### Tool names you get

`mcp__mcp-atlassian__jira_get_issue`, `...__jira_create_issue`, `...__jira_search`, and so
on. Snake-case with a `jira_` prefix.

### What this option adds

Board and sprint listing (so `/jira sprint` can find the active sprint by itself),
issue deletion, batch creation, attachment handling, and it works in headless and cron
runs because the credential is a token rather than an interactive login. It also supports
self-hosted Jira Server / Data Center.

---

## Picking one

|                          | Option A: connector | Option B: `.mcp.json`              |
| ------------------------ | ------------------- | ---------------------------------- |
| Setup                    | A few clicks        | Token + `uv` install + config file |
| Secret on disk           | none                | API token in `.mcp.json`           |
| Sprint automation        | ❌ manual           | ✅                                 |
| Works in cron / headless | ⚠️ unreliable       | ✅                                 |
| Confluence included      | ✅                  | ❌                                 |
| Jira Server (on-prem)    | ❌ Cloud only       | ✅                                 |

**Start with Option A.** It is fewer moving parts, and nothing that can leak a token.
Switch to Option B if you hit one of its limits, or if you want to see the mechanics of
running an MCP server.

You can also have both configured. If you do, both tool sets appear and the skill uses
whichever it finds.

---

## Whose Jira?

Separate from the two options above: the tools reach **the Jira instance your account can
see**. Neither option grants access you do not already have.

- Working on the shared `DEMO` project? You need an account on that Atlassian site.
- Working on your own final project? Create a free Jira Cloud site, then update
  `.claude/jira-config.md` with your site URL and project key. The skill reads that file,
  so nothing else needs changing.

---

## When it does not work

| Symptom                                   | Likely cause                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/mcp` does not list Atlassian at all     | Option A: connector not authorized, or Claude Code not restarted since. Option B: `.mcp.json` missing or malformed — check it with `jq -e . .mcp.json`. |
| Tools listed, but every call fails auth   | Option A: re-authorize the connector. Option B: token revoked or `JIRA_USERNAME` is not the account that owns the token.                                |
| Tools work, but the ticket is "not found" | Your account cannot see that project. Confirm you can open the ticket in a browser first.                                                               |
| Worked interactively, fails in a script   | Option A cannot be relied on headless. Use Option B for automation.                                                                                     |

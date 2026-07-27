---
name: repo-review-prs
description: This skill should be used when the user asks to "review all open PRs", "review unreviewed PRs", "review PR #N", or "check what PRs need review". Fetches open PRs, skips already-reviewed ones, and runs a full interactive review on each unreviewed PR, posting inline comments directly to GitHub.
argument-hint: "[PR number | all]"
disable-model-invocation: true
allowed-tools: Bash(gh:*), Read, Grep, Glob, mcp__claude_ai_Atlassian__getAccessibleAtlassianResources, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__mcp-atlassian__jira_get_issue, mcp__mcp-atlassian__jira_search
---

> **Tools used:** `Bash(gh:*)`, `Read`, `Grep`, `Glob`, and a Jira get-issue tool (`getJiraIssue` on the connector, `jira_get_issue` self-hosted) - fetches PR list and diffs via the `gh` CLI, loads Jira ticket context, posts inline comments to GitHub.

> **Output format:** All console output must be plain text - no markdown syntax (`**bold**`, `## headers`, `---` rules, or backtick fences). Use plain ASCII characters and box-drawing lines (`─`, `│`) for structure. Markdown is only acceptable inside the `body` strings sent to the GitHub API.

## When this skill triggers

1. If argument is a specific PR number → review that PR only
2. If argument is `all` or empty → fetch all open PRs, skip already-reviewed ones, review the rest sequentially
3. For each PR: follow the full review workflow below

---

## Step 0 - Preflight check

Run:

```bash
gh auth status
```

If the command is not found, stop and tell the user: "The `gh` CLI is not installed. See the 'GitHub CLI (`gh`)' section in `README.md` for install and login steps."

If it runs but exits non-zero, stop and tell the user: "`gh` is installed but not authenticated - run `gh auth login` and try again. `README.md` lists the prompts and the answers you want."

Do not attempt the review without `gh`; every later step depends on it.

If no Jira MCP server is available, continue in degraded mode - skip Jira enrichment and note "Jira context unavailable" in the per-PR summary rather than aborting. Two setups can supply it (see `.claude/skills/repo-jira/references/jira-access.md`): the Atlassian connector (`getJiraIssue`, needs a `cloudId` from `getAccessibleAtlassianResources`) or a self-hosted server (`jira_get_issue`). Use whichever is present.

> **In headless runs, expect no Jira.** The connector is authorized interactively, so it is typically unavailable under `claude --print` or cron. Degraded mode is the normal path there, not an error. If you need Jira context in automation, use the self-hosted setup.

## Step 1 - Determine scope

If a PR number was provided as argument, skip to Step 3 with that number.

Otherwise fetch all open PRs:

```bash
gh pr list --json number,title,author,headRefName,reviewDecision
```

Filter to unreviewed PRs only - skip any where `reviewDecision` is not `null`. Present the list and ask for confirmation before proceeding:

```
Found N unreviewed PRs:
  #21 feat(frontend): add user profile card - <author>
  #20 feat(backend): add user lookup endpoint - <author>

Post reviews for all N PRs? (yes/no)
```

Stop cleanly if the user says no.

## Step 2 - For each PR, run the full review loop

For each PR number, run the interactive review loop:

1. **Load project context** - read root `CLAUDE.md`, and any scoped `CLAUDE.md` under `backend/` or `frontend/` that the changed files touch.
2. **Fetch the PR** - `gh pr view <n>` and `gh pr diff <n>`. If the diff is empty, skip the PR and note it in the summary as "skipped - empty diff".
3. **Enrich with Jira** - extract the `DEMO-<n>` key from the branch name (`{type}/DEMO-{number}-{slug}`) and fetch the ticket for acceptance-criteria context, via `getJiraIssue` (connector) or `jira_get_issue` (self-hosted). Skip silently if neither is available.
4. **Analyse** against the evaluation criteria below.
5. **De-duplicate** - read existing PR comments first; do not repeat a point already raised.
6. **Post inline comments** via `gh api`. Use `REQUEST_CHANGES` for blockers, `COMMENT` for suggestions.
7. If the `gh api` POST fails (rate limit, network error), note it in the summary as "failed - [reason]" and continue to the next PR.

### Evaluation criteria

Review each PR against, in priority order:

| Dimension         | What to check                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Correctness**   | Logic bugs, unhandled edge cases, wrong error handling, race conditions                                                                 |
| **Contract**      | Backend is the source of truth for the HTTP contract; frontend must consume generated types, not redefine shapes (see root `CLAUDE.md`) |
| **Security**      | Untyped external input reaching inward, missing validation at the boundary, leaked secrets, injection                                   |
| **Architecture**  | KISS / DRY / YAGNI, module boundaries, enums over repeated string literals                                                              |
| **Test coverage** | New endpoints/components without tests, missing edge-case tests                                                                         |
| **Conventions**   | Conventional Commits, branch naming, scope (`backend`/`frontend`)                                                                       |

## Step 3 - Summary

After all PRs are reviewed, print a plain-text summary table:

```
PR Reviews Complete
─────────────────────────────────────────────────────
#21  feat(frontend): user profile card   COMMENT   3 comments
#20  feat(backend): user lookup endpoint  COMMENT   2 comments
─────────────────────────────────────────────────────
Total: 2 PRs reviewed, 5 comments posted
```

---

## Running automatically (headless) - high-level

Beyond the interactive loop above, PR review can run **without a Claude Code window open**, on a schedule. The demo repo describes two options; the actual runner scripts are intentionally **not** committed here - they'd live under `.claude/skills/repo-review-prs/scripts/` (for example a `pr-watcher.sh` entry point, a `pr-watcher.Dockerfile`, a token-refresh helper, and a container MCP-settings file).

### Option A - Cron

A cron job periodically runs the watcher script, which detects new/unreviewed PRs and invokes Claude Code in headless (`--print`) mode to review them.

```
*/15 * * * * /path/to/repo/.claude/skills/repo-review-prs/scripts/pr-watcher.sh
```

⚠️ **Limitation:** an open editor extension can intercept headless `claude` calls, causing reviews to fail silently. Use the Docker option if you need it to run while your editor is open.

### Option B - Docker

Run the watcher in a container so it's isolated from the local editor. The container mounts the repo and `~/.claude`, receives a GitHub token and API key via env vars, and runs the same watcher script on a cron. This is the robust option for always-on review.

Both options ultimately drive the **same review loop** documented in Step 2 - the only difference is what triggers it and where it runs.

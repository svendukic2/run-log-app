> **Tools used:** `Read` (load standards + config), plus Jira create/update/link tools: `createJiraIssue` / `editJiraIssue` / `createIssueLink` (connector) or `jira_create_issue` / `jira_update_issue` / `jira_link_to_epic` (self-hosted).

Act as a **Product Owner** creating and managing Jira tickets over MCP, project `DEMO`.

## Step 1 - Preflight check

Two Jira setups are supported (see `references/jira-access.md`). Establish which is active before anything else:

1. If `getAccessibleAtlassianResources` is available → **connector**. Call it once and keep the returned `cloudId`; every later Jira call needs it.
2. Else if `jira_get_issue` is available → **self-hosted**. No `cloudId` is needed.
3. If neither is present, stop and tell the user: "No Jira MCP server is available. See `.claude/skills/repo-jira/references/jira-access.md` to set up either the Atlassian connector or `.mcp.json`, then restart Claude Code."

Below, tools are written as `connector-name` / `self-hosted-name` - use the one matching your active setup.

## Step 2 - Load standards and config

Read `.claude/skills/repo-jira/references/standards.md` for naming conventions and rules.

Try to read `.claude/jira-config.md`. If it exists, use it. If it does not exist, proceed to Step 3 to gather the information and create it.

## Step 3 - Resolve project configuration

### 3.1 - Project key
Default to `DEMO`. If `.claude/jira-config.md` is missing and no key is in the argument, confirm `DEMO` with the user.

### 3.2 - Discover the story-points field
If not already known from config, auto-discover:

1. **Connector:** call `getJiraIssueTypeMetaWithFields` for the project and the `Task` issue type with `requiredFieldsOnly: false`, then find the field whose name is `Story point estimate` or `Story Points` and read its `customfield_*` key.
   **Self-hosted:** call `jira_search_fields` with keyword `story points`.
2. If that yields nothing, try `customfield_10432` first (team-managed), then `customfield_10117` (company-managed).
3. Confirm by attempting to set the field on a test issue - use whichever succeeds.
4. Write the discovered ID back to `.claude/jira-config.md` so later sessions skip this step.

### 3.3 - Create or update `.claude/jira-config.md`
After confirming the key and story-points field, **always write/update `.claude/jira-config.md`** using the template from `references/standards.md` (Setup section). This lets future sessions load config instantly.

### 3.4 - Acknowledge context
Tell the user the project key and story-points field, then continue.

## Step 4 - Act on the user's instruction

The user's instruction is: **`$ARGUMENTS`**

If empty, ask what they'd like to create.

When creating tasks:

1. **Search first** - before creating an epic, search for an existing one with matching scope (broad keywords: name, domain, topic).

2. **Present a plan** - before creating anything, output a full plan and stop:

   ```
   ## Proposed Task Breakdown

   **Epic:** [name] → [existing or new]

   | # | Task | Type | Layer | Points | Blocks |
   |---|------|------|-------|--------|--------|
   | 1 | [name] | Task/Spike | BE/FE | X | - |
   | 2 | [name] | Task | FE | X | #1 |

   **Notes:**
   - [assumptions, dependencies, open questions]
   ```

   Then ask: **"Does this plan look good? Any changes before I create the tickets?"**

   **Do not create any tickets until the user confirms.**

3. **Apply feedback** - if the user requests changes, revise the plan and ask for confirmation again.

4. **Create in order** once confirmed:
   1. Epic (if needed)
   2. Spike tasks
   3. `BE` tasks
   4. `FE` tasks (blocked by their `BE` counterparts where applicable)

5. **After each task** - immediately link it to the parent epic.

   **Self-hosted:** call `jira_link_to_epic` with the task and epic keys.

   **Connector:** there is no single link-to-epic call, and the right mechanism depends on the project type:

   - *Team-managed project* - the epic is the issue's parent. Pass `parent: "DEMO-100"` on `createJiraIssue`, or set it later with `editJiraIssue`.
   - *Company-managed project* - the epic is a custom field. Set the Epic Link field via `additional_fields`, e.g. `{"customfield_10014": "DEMO-100"}`.

   If a `parent` value is rejected, you are most likely on a company-managed project - switch to the Epic Link field rather than retrying. `getJiraProjectIssueTypesMetadata` shows which issue types the project has, which helps identify the type.

## Step 5 - Confirm completion

Output a summary table:

| Key | Summary | Type | Points | Epic |
|-----|---------|------|--------|------|
| ... | ...     | ...  | ...    | ...  |

Then ask if anything needs adjustment.

---

## Rules enforced at all times

- All descriptions in **Markdown** - never Jira wiki markup. On the connector, pass `contentFormat: "markdown"` and it converts to Atlassian Document Format for you.
- Labels, priority and story points are set **at creation time** - including the `[LAYER]` label matching the summary prefix. On the connector these all go in one `additional_fields` object, e.g. `{"labels": ["BE", "mvp"], "priority": {"name": "High"}, "customfield_10432": 5}`.
- Story points on all tasks **except DOCS and QA**.
- No task assigned to anyone - leave assignee blank unless the user requests it. When they do: resolve the person's name to an account ID with `lookupJiraAccountId` (connector), then pass it as `assignee_account_id` on create or set `assignee` via `editJiraIssue`.
- Always confirm before bulk operations (creating >3 tasks, renaming epics, adding blocking links).
- If something is unclear, ask - do not guess.
- **Story-point estimation MUST use the table in `standards.md` section 4 - no approximations, no custom scales.** Map hours/complexity directly to the Fibonacci scale defined there.

---

> After creating tasks, use `/jira worklog` to log hours and assign to a sprint.

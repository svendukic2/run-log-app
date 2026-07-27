---
name: repo-commit
description: This skill should be used when the user asks to "commit changes", "stage and commit", "create a git commit", "commit my work", "give me the commit plan", "plan the commits", "what should I commit", or says "/commit". Analyses changes, runs lint/tests on affected apps, shows a pre-flight test checklist, checks if multiple commits are needed, generates Conventional Commits messages with the DEMO ticket inferred from the branch, and presents them ready to run behind a confirmation gate.
argument-hint: "[refresh-checks]"
allowed-tools: Bash(git:*), Bash(npm:*), Read
---

> **Tools used:** `Bash(git:*)`, `Bash(npm:*)`, `Read` - git branch inspection, working-tree inspection, per-app lint/test, cache reads.

Prepare a git commit following the **Conventional Commits** standard, with pre-commit quality checks. This is a multi-app repo (`backend/` + `frontend/`), so checks are scoped per changed app.

## Supporting files

| File                       | Purpose                                                                                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/commit-checks.md` | Auto-generated cache of both apps, their available scripts (lint/test/build), and pre-built per-app commands. Written by `refresh-checks`, read on every commit run. Regenerate with `/commit refresh-checks` if it's missing or stale (older than 7 days). |

The Jira ticket for the commit message is inferred from the branch name (`{type}/DEMO-{number}-{slug}`) - see Step 9. No config file is required.

## PRE-CONDITION - Branch guard (run before everything else)

Run `git branch --show-current` immediately.

**If the branch is `main` or `master` → STOP. Do not proceed with any other step.**

Tell the user:

> You're on `{branch}`. Committing directly to `{branch}` is not allowed.
> Would you like to:
>
> 1. Create a new branch (provide a name or ticket and I'll format it per the branch convention `{type}/DEMO-{number}-{slug}`)
> 2. Switch to an existing branch

Wait for the user to confirm they've switched. Only then continue to Step 0.

---

## Step 0 - Handle special arguments

The argument passed was: **`$ARGUMENTS`**

- If the argument is `refresh-checks` → run the **Refresh Checks Cache** routine below and stop.
- Otherwise continue to Step 1.

### Refresh Checks Cache routine

Scan `backend/package.json` and `frontend/package.json`:

1. **Discover scripts** - for each app, record which of `lint`, `test`, `test:e2e`, `build` exist. Note missing ones as gaps (⚠️). Frontend has an `npm run lint` script (`eslint` via `eslint-config-next`); note that.
2. **Write `.claude/commit-checks.md`** with today's date, the per-app registry, and the pre-built per-app commands (see format below).
3. Output: "✅ commit-checks.md updated - found 2 apps, X gaps"

**Cache format to write:**

```markdown
# Commit Checks Cache - updated YYYY-MM-DD

## App Registry

| App      | lint           | test       | test:e2e           | build           |
| -------- | -------------- | ---------- | ------------------ | --------------- |
| backend  | `npm run lint` | `npm test` | `npm run test:e2e` | `npm run build` |
| frontend | `npm run lint` | `npm test` | -                  | `npm run build` |

## Per-app commands

**backend** (run from `backend/`):

- lint: `cd backend && npm run lint`
- test: `cd backend && npm test`
- e2e: `cd backend && npm run test:e2e`

**frontend** (run from `frontend/`):

- lint: `cd frontend && npm run lint`
- test: `cd frontend && npm test`
- build: `cd frontend && npm run build`
```

---

## Step 1 - Inspect the working tree

Run in parallel:

1. `git status` - identify staged, unstaged, and untracked files
2. `git diff` - review unstaged changes
3. `git diff --cached` - review already-staged changes
4. `git log --oneline -5` - understand the recent commit style in this repo

## Step 2 - Load checks cache

Try to read `.claude/commit-checks.md`.

- **If it exists and was updated within 7 days** → use it as-is
- **If missing or older than 7 days** → run the Refresh Checks Cache routine (Step 0) first, then continue

## Step 3 - Check for multiple commits

Before staging anything, look at the changed files from Step 1 and ask: **do these changes belong to one logical commit, or more than one?**

Split into multiple commits if the files span:

- Both apps (`backend/` and `frontend/`) with unrelated concerns
- Clearly unrelated concerns (e.g. a new feature + an unrelated bug fix)

If multiple commits are needed, **stop here** and present a proposed commit plan to the user listing each commit and its files. Do not stage or commit anything. Wait for the user to confirm before proceeding.

If only one commit is needed, continue to Step 4.

## Step 4 - Run lint per changed app

Read the App Registry from `.claude/commit-checks.md`. For each app that has changed files, run its lint command (where it exists per the registry). Skip apps with no changed files.

- **backend** changed → `cd backend && npm run lint`
- **frontend** changed → `cd frontend && npm run lint`

### On lint results

- **Lint errors** → show errors, ask: "Fix automatically? (yes/no)"
  - yes → re-run with the app's `--fix` equivalent (backend `npm run lint` already includes `--fix`; frontend `npm run lint -- --fix`), show what changed, continue
  - no → continue (user accepts)
- **Lint warnings** → note but continue

## Step 5 - Show pre-flight test checklist

Using `.claude/commit-checks.md` (App Registry) and the changed files from Step 1:

1. **Direct** - include the test command for each app with changed files
2. **E2E** - suggest the backend e2e command if `backend/test/` or backend controller/module files changed
3. **Full pre-push** - show the combined command block for every affected app at the end

Output each command in its own fenced code block for easy copying. Do **not** run these - only display them. Example:

```bash
cd backend && npm test
```

```bash
cd frontend && npm test
```

Both apps use Jest, which runs once and exits by default. No watch-disabling flag is
needed.

## Step 6 - Stage changes

### Single commit path

Before running `git add -A`, check `git status` for any sensitive files (e.g. `.env`, `*.pem`, large binaries) in the untracked list. If any are present, stage selectively with `git add <specific files>` instead. Otherwise run `git add -A` to stage everything. Re-run `git diff --cached` to confirm.

### Multiple commits path (confirmed split from Step 3)

Stage only the files for the **first commit** using `git add <specific files>`.
Present subsequent commits one at a time after each commit is made.

## Step 7 - Analyse the diff

From the staged diff, identify:

- **What changed** - files touched, functions added/removed, config updated, etc.
- **Why it changed** - infer from context, variable names, comments, and file paths
- **Scope** - infer from the app being committed:

  | If staged files are primarily in… | Scope      |
  | --------------------------------- | ---------- |
  | `backend/`                        | `backend`  |
  | `frontend/`                       | `frontend` |
  | root config, tooling              | omit scope |
  | `.claude/`                        | omit scope |
  | Mixed across both apps            | omit scope |

## Step 8 - Choose the commit type

Use exactly one - must match what `commitlint` accepts:

| Type       | When to use                                  |
| ---------- | -------------------------------------------- |
| `feat`     | A new feature or capability                  |
| `fix`      | A bug fix                                    |
| `chore`    | Maintenance, dependency updates, config      |
| `refactor` | Code restructuring without changing behavior |
| `docs`     | Documentation only                           |
| `test`     | Adding or updating tests                     |

## Step 9 - Write the commit message

Follow this format strictly:

```
<type>(<scope>): <subject> (DEMO-<number>)
```

### Rules

- **Single line only.** No body, no blank lines, no multi-line messages.
- **Subject line:** max 50 characters, lowercase, no trailing period, imperative mood ("add", "fix", "update")
- **Scope:** `backend` or `frontend`, inferred from file paths (see Step 7). Omit entirely - no empty `()` - if the change spans both apps or has no clear scope.
- **Ticket:** infer from the current branch name `{type}/DEMO-{number}-{slug}` and append as `(DEMO-<number>)`. If no ticket can be determined from the branch, omit it - do not guess.
- **Never** include `Co-Authored-By` or any AI attribution lines.
- **Never** reference internal tooling, Claude, or auto-generation in the message.

### Examples

```
feat(frontend): add UserProfileCard component (DEMO-160)
fix(backend): handle missing id in user lookup (DEMO-355)
test(backend): cover AppController error paths (DEMO-355)
chore: update dependencies
docs: document e2e setup and OpenAPI workflow
refactor(backend): extract user mapper into helper (DEMO-95)
```

## Step 10 - Present the result (confirmation gate)

Output the following - nothing more:

---

**Ready to commit.** Run this when you're happy:

```bash
git commit -m "<your generated message here>"
```

**Staged files:**
<list the staged files>

**Quality checks:** <e.g. "backend lint ✅" or "skipped (no app changes)">

---

Do **not** run `git commit` yourself. Stop after presenting the command.

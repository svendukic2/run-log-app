# Claude Code settings for this repo

| File                          | Committed?    | Scope                                                 |
| ----------------------------- | ------------- | ----------------------------------------------------- |
| `.claude/settings.json`       | ✅ yes        | Team-wide. Everyone who clones the repo gets this.    |
| `.claude/settings.local.json` | ❌ gitignored | Yours only. Personal preferences and local overrides. |

Settings load in order `user → project → local`, so `settings.local.json` wins over
`settings.json`, which wins over your global `~/.claude/settings.json`.

---

## What is in `settings.json`, and why

### `permissions.allow`

Commands you run dozens of times a day, all of them reversible: reading and searching
files, `npm install` / `run` / `test`, read-only git (`status`, `diff`, `log`, `show`,
`branch`), branching (`switch`, `checkout -b`), `git add` / `commit`, and
`curl http://localhost:*`. The `node --version` / `npm --version` entries are there
because the `/dev-setup` skill checks them in its first step.

### `permissions.ask`

Always asks, even though the commands are ordinary: `git push`, `git reset --hard`,
`npm publish`. These either send work outward or throw work away. `git push` in
particular gives the "never push directly to `main`" rule in `CLAUDE.md` a real
barrier instead of just an instruction.

### The `gh` split is the point, not an accident

`gh` commands are divided across both lists by one question: does this command **write
something other people will see?**

Reading is pre-approved (`gh auth status`, `gh pr list`, `gh pr view`, `gh pr diff`,
`gh pr checks`, `gh repo view`), because fetching a PR to review it should not require a
prompt every time.

Writing always asks (`gh pr create`, `gh pr review`, `gh pr comment`, `gh pr merge`,
`gh pr close`, `gh api`). Posting a review comment is visible to your team and notifies
people; merging changes the default branch. Neither should happen because a prompt was
click-throughed.

`gh api` sits in the `ask` list even though it is often just a `GET`, because the same
command with `-X POST` writes to GitHub. Nothing in a permission pattern can tell those
apart, so it is treated as a write.

Setup instructions for `gh` itself, including which OAuth scopes matter, are in the
`README.md` section "GitHub CLI (`gh`)". The `repo-review-prs` skill assumes it is already
authenticated.

### `permissions.deny`

Never, not even with a prompt:

- `rm -rf /`, `rm -rf ~`, `rm -rf .git*` - unrecoverable
- `git push --force*`, `git push -f*` - rewrites history other people have pulled

### Why there is no `Read(**/.env)` deny rule

Blocking `.env` looks like the obviously safe choice, and it was in this file at one
point. It was removed because it breaks the two skills that need those files:
`repo-dev-setup` reads `backend/.env` to tell you which variables are missing or still
hold placeholder values, and `repo-secrets` lists which keys are set locally. With the
deny rule in place, both stop at a permission error on their own documented step.

The protection you actually want is already there, in `.gitignore`: `.env` and
`.env.local` are never committed, so a leaked key stays on one machine. What the deny
rule adds on top of that is keeping values out of the model's context, which is worth
having, but not at the price of a boilerplate whose setup skill cannot run. If you
want it back for your own work, put it in `settings.local.json` and expect those two
skills to fail on the steps that touch `.env`.

**The habit that matters more than any setting:** real secrets belong in the team
secret manager, and `.env` holds a local copy. Treat anything you paste into a chat
window as public.

### `Edit` and `Write` are deliberately NOT allowed

This is the most important choice in the file. With no rule for them, Claude Code
asks before every file change, which means you see the diff before it lands. That is
half of what you are here to learn. Once it starts slowing you down, turn it off
yourself with Shift+Tab (accept-edits mode) or `/config` — the reverse never happens,
because a student who auto-approves from day one never looks at a diff.

### `attribution`

Both fields are `""`, which suppresses the `Co-Authored-By: Claude` trailer on commits
and the attribution line in PR bodies. The `/commit` skill asks for this in prose; this
setting is what actually enforces it.

> Note: the older `includeCoAuthoredBy` key does the same job but is deprecated. Use
> `attribution`.

---

## Personal preferences go in `settings.local.json`

Anything about how _you_ like to work belongs in the gitignored file, not in the
committed one: `theme`, `editorMode`, `verbose`, `effortLevel`, `alwaysThinkingEnabled`,
and the thinking-visibility settings below.

### Showing Claude's reasoning: which setting works depends on where you run Claude Code

Thinking itself is on by default on current models. What varies is whether the summary
is _displayed_, and the setting that controls it is not the same on every surface.

| Surface           | `showThinkingSummaries`                      | `CLAUDE_CODE_EXTRA_BODY`                      |
| ----------------- | -------------------------------------------- | --------------------------------------------- |
| Terminal CLI      | works                                        | works, but carries the risk below             |
| VS Code extension | **does not work** (observed on this project) | the only route that produced visible thinking |

**In the terminal**, use the first-class setting:

```json
{
  "showThinkingSummaries": true
}
```

**In the VS Code extension**, that setting had no effect, and the only thing that worked
was the raw request override:

```json
{
  "env": {
    "CLAUDE_CODE_EXTRA_BODY": "{\"thinking\":{\"type\":\"adaptive\",\"display\":\"summarized\"}}"
  }
}
```

The payload is correct on its own: `thinking: {type: "adaptive", display: "summarized"}`
is valid syntax for Opus 5, Sonnet 5, Opus 4.8 and Opus 4.7, and `display` really does
default to `"omitted"` on those models, so the intent is sound.

> The VS Code row is **this project's observed behavior, not a documented limitation.**
> It has not been checked against a changelog, so it may be version-specific or already
> fixed. Try `showThinkingSummaries` first and fall back to the override only if nothing
> shows up.

### The cost of the override, if you use it

`CLAUDE_CODE_EXTRA_BODY` splices a raw `thinking` field into **every** API request the
session makes, with no knowledge of which model serves it. `type: "adaptive"` is rejected
with an HTTP 400 on older models: Haiku 4.5 and Sonnet 4.5 take
`{"type": "enabled", "budget_tokens": N}` instead. Claude Code routes some work to Haiku
(prompt and agent hooks default to it), so unrelated operations can fail while your main
model keeps working, and the error points at the tool rather than at this setting.

So it is a real trade-off, not a free win: on the VS Code extension it may be the only way
to see reasoning, and the price is that class of failure. If a tool starts failing for no
obvious reason, empty this env var first and see if the failure goes away.

**Rule of thumb:** prefer the first-class setting; reach for `CLAUDE_CODE_EXTRA_BODY` only
when the first-class setting demonstrably does nothing on your surface. It is a raw escape
hatch: nothing checks the payload against the model that will receive it.

Either way this belongs in `settings.local.json`, never in the committed `settings.json`:
it is a personal preference, and on the shared file it would impose the failure mode above
on everyone who clones the repo.

---

## Changing these settings

Use `/config` for simple things (theme, model, editor mode). Edit the JSON directly for
permissions and hooks. The validator runs on save, so a typo in a field name is caught
immediately — but note that a malformed file silently disables **every** setting in it,
so keep `jq -e . .claude/settings.json` handy if something stops taking effect.

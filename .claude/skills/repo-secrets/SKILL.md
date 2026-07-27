---
name: repo-secrets
description: This skill should be used when the user asks to "add a secret", "add an API key", "add an env var", "update a secret value", "rotate a secret", "show secrets", "edit credentials", or says "/secrets". Manages local per-app `.env` files from a committed `.env.example` template, and explains where real secrets live.
argument-hint: "[action - add | show | rotate] [app - backend | frontend]"
allowed-tools: Read, Bash(cp:*), Bash(git:*)
---

> **Tools used:** `Read` (inspect `.env` and `.env.example`), `Bash(cp:*)` (create `.env` from template), `Bash(git:*)` (verify secrets are gitignored).

Manage local secrets and configuration for the two apps in this repo via per-app `.env` files.

> **Teaching note - this is a simplified reference.** A real production project would use a proper secret-management tool (a cloud secret manager, an encrypted-at-rest credential store, or a shared team password vault) so that encrypted secrets can be committed and decrypted at boot. This demo repo keeps it deliberately simple: `.env` files are **never committed**, real values live in a shared secret manager, and each developer pastes what they need into a local `.env`. The *concepts* below (template, never commit, single source of truth, rotate) transfer directly to the real thing.

---

## Model - how secrets work here

- Each app has a committed **`.env.example`** - the template. It lists every variable name the app reads, with placeholder or safe-default values and a short comment. It contains **no real secret values**.
- Each developer copies `.env.example` → **`.env`** locally and fills in real values. `.env` is **gitignored and never committed**.
- The **real values** live in the team's secret manager / shared vault (referenced generically here). That vault is the single source of truth - `.env` files are disposable local copies.
- `backend/.env` and `frontend/.env` are independent - a variable used by both must be added to both templates.

| File | Committed? | Contains |
|---|---|---|
| `backend/.env.example` / `frontend/.env.example` | ✅ yes | variable names + placeholders, no real values |
| `backend/.env` | ❌ never | real local values, read by `ConfigModule` |
| `frontend/.env.local` | ❌ never | real local values, read by Next.js |
| `.mcp.json` | ❌ never | MCP server credentials (see `.mcp.json.example`) |
| Team secret manager / vault | n/a (external) | the authoritative real values |

> Note the filename difference between the apps: Next.js reads **`.env.local`** in `frontend/`, while Nest reads **`.env`** in `backend/`. Both are gitignored.

**Golden rule:** a real secret value must never appear in a committed file, a commit message, a log, or chat output.

---

## Operation: Add a secret / env var

### Step 1 - Determine placement

Ask the user (if not obvious from context):
- **Which app?** `backend` or `frontend` (or both, if it crosses the wire).
- **Is it a secret or plain config?** Secrets (API keys, tokens, passwords) get a placeholder only in `.env.example`; non-sensitive config (ports, feature flags) can have a real default in the template.

### Step 2 - Add to the template

Add the variable to the app's `.env.example` with a placeholder and a one-line comment:

```dotenv
# Backend API key for the third-party X service (get from the team vault)
X_API_KEY=your-key-here
```

Keep names `UPPER_SNAKE_CASE`, matching the env var the code reads. Group related variables and keep the file readable.

### Step 3 - Add to the local `.env`

Add the same key to the developer's local `.env` with the **real value** pulled from the team vault. If `.env` doesn't exist yet, create it:

```bash
cd backend && cp .env.example .env
```

Then fill in the real value. Do **not** echo the real value back into the conversation.

### Step 4 - Wire it into the app (backend)

For backend secrets, confirm the variable is actually read at the boundary:

1. `ConfigModule.forRoot({ isGlobal: true })` is already registered in `backend/src/app.module.ts`, so any key in `backend/.env` is available without further wiring.
2. Read it through `ConfigService` (`config.get<string>('MY_KEY')`), as `src/main.ts` does - not via `process.env` scattered through the code.
3. Add a placeholder entry to `backend/.env.example` so the next person knows the variable exists.
4. **Not yet set up: validation.** There is no schema, so a missing value fails at first use rather than at boot. If a secret is required for the app to work at all, add a `validationSchema` to `ConfigModule.forRoot()` and say so to the user.

Inform the user of any missing wiring. (See the `backend-nestjs` skill for config patterns.)

For frontend config, confirm public values use the `NEXT_PUBLIC_` prefix and come from `.env.local` (or Vercel env vars). Secrets must stay server-side - never expose them to the browser with `NEXT_PUBLIC_`.

### Step 5 - Verify it stays out of git

```bash
git check-ignore backend/.env frontend/.env
```

Both should be reported as ignored. If not, stop and fix `.gitignore` before doing anything else. Only the `.env.example` change should be staged and committed:

```
chore(backend): document X_API_KEY in .env.example (DEMO-xxx)
```

---

## Operation: Show / list configured secrets

Never print real values. To show which variables an app expects, read the **template**:

```bash
cat backend/.env.example
```

To check which are set locally without revealing values, list the keys only (not the values) from `.env`. If the user needs an actual value, direct them to the team secret manager - do not surface it in chat.

---

## Operation: Rotate a secret

1. Generate / obtain the new value from the provider.
2. Update the value in the **team secret manager** (the source of truth) first.
3. Update the local `.env` for each developer/app that uses it.
4. If the secret has a counterpart elsewhere (e.g. a backend value that must match a frontend build-time value), update both so they stay in sync.
5. Restart the affected app so it re-reads `.env`.
6. Nothing to commit - rotation touches only `.env` and the external vault, never the repo.

---

## What does NOT belong in `.env` files

| Item | Where it belongs | Why |
|---|---|---|
| Real production secrets | Team secret manager / cloud vault | Single source of truth; `.env` is a local copy |
| CI/CD credentials | GitHub Actions secrets | Only the pipeline needs them |
| Infrastructure config (DB URLs per environment) | Deployment environment config | Varies per deploy, not a local concern |
| Anything you'd be unhappy to leak | Not the repo, ever | Committed files are forever in history |

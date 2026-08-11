---
name: repo-dev-setup
description: This skill should be used when the user asks to "set up the project", "onboard me", "get me running locally", "set up local dev", "how do I run the app", "configure my environment", "install dependencies", or says "/dev-setup", or on a first-time clone. Guides through full first-time local setup for the Decode Academy Demo repo (backend + frontend).
argument-hint: "[app - backend | frontend | omit for full stack]"
allowed-tools: Read, Bash(node:*), Bash(npm:*), Bash(curl:*), Bash(git:*), Bash(which:*), Bash(command:*), Bash(uname:*)
---

> **Tools used:** `Read` (check `.nvmrc` and `.env` files), `Bash(node:*)`/`Bash(npm:*)` (version checks, installs), `Bash(which:*)`/`Bash(command:*)`/`Bash(uname:*)` (locate the toolchain, detect the OS), `Bash(curl:*)` (verify a server the user started), `Bash(git:*)` (version and hook state).

Walk the user through setting up their local development environment for the Decode Academy Demo repo.

This is a **multi-app repository**: two independent npm projects in one git repo - `backend/` (NestJS 11, port 3000) and `frontend/` (Next.js 16, port 4200). There are **three** `package.json` files and each is installed separately. The root one is not a workspace manager; it holds only the repo-wide git-hook tooling, but installing it is **mandatory**, not optional (see Step 3).

The optional argument selects what to set up: `backend`, `frontend`, or omit for the full stack.

---

## Two rules that override convenience

These exist because breaking them produces a setup that appears to succeed and then does
not work for the user. Both have actually happened.

**Rule 1 - Never start a dev server yourself.** Any process you launch is bound to this
session and dies when the session ends, including anything backgrounded. The user is left
with nothing running and no way to tell why. Print the command, ask the user to run it in
their **own** terminal, and wait for them to confirm. You may then verify with a short
`curl`. This applies to `npm run start:dev`, `npm run dev` and `npm start`. It does not
apply to one-shot commands (`npm install`, `npm test`, `npm run build`), which you should
run yourself.

**Rule 2 - Confirm the toolchain is on the user's PATH, not just yours.** Claude Code can
be installed without a system Node (native installer, VSCode extension) and carries its
own runtime. Your `Bash` calls may resolve `node` to that bundled runtime while the user's
terminal has no `node` at all. A version check that passes for you therefore proves
nothing about them. Step 1 handles this; do not skip it as a formality.

---

## Step 1 - Locate the toolchain and check versions

Read `.nvmrc` first. Then find out *where* the tools come from, not only which version:

```bash
command -v node
command -v npm
node --version
npm --version
git --version
```

Judge the output of `command -v node`:

- A path under a version manager or system prefix (`~/.nvm/versions/node/...`,
  `/usr/local/bin`, `/opt/homebrew/bin`, `~/.fnm/...`, `C:\Program Files\nodejs\...`) means
  a real system Node. Good.
- A path inside a Claude Code installation (contains `.claude`, `Claude`, `claude-code`,
  or sits next to the Claude binary) means you are seeing a **bundled runtime**. The user
  very likely has no Node of their own. Treat this as "Node is missing" and go to Step 2.
- Empty output means Node is genuinely absent. Go to Step 2.

**Always confirm with the user directly**, because this is the one thing you cannot verify
for them:

> Open your own terminal, one you opened yourself, not through me, and run `node --version`
> and `npm --version`. Paste what you get.

If their terminal errors with `command not found`, Node is missing regardless of what your
own check returned. Go to Step 2.

Version requirements once Node is present:

- Match `.nvmrc` (currently **24**). CI reads that same file.
- The hard floor is **v20.9.0**, which `next` declares in `engines`; NestJS 11 asks for
  `>= 20`. All three `package.json` files carry that constraint, so npm warns with
  `EBADENGINE` on a mismatch. Compare against v20.9.0, never against a bare "v20".
- npm **v10+**, which ships with any acceptable Node.

If Node is present but the version is wrong, ask the user to run `nvm use` in their own
terminal. It reads `.nvmrc` and takes no version argument. Do **not** suggest
`nvm install --lts`, which installs whatever LTS happens to be current rather than the
pinned version. `nvm` is a shell function, so it cannot be invoked usefully from a tool
call; it has to be the user typing it.

---

## Step 2 - Install Node (only if Step 1 found none)

You cannot do this for the user. Detect their platform with `uname -s` (`Darwin`, `Linux`,
or `MINGW*`/`MSYS*`/`CYGWIN*` for git-bash on Windows), then give **only** the block that
applies. Ask them to run it in their own terminal and report back.

**macOS / Linux** - nvm, which respects `.nvmrc`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# then close and reopen the terminal, or source your shell profile, and from the repo root:
nvm install      # reads .nvmrc
nvm use          # reads .nvmrc
```

**Windows** - `nvm` from the block above does not exist on Windows. Use fnm, which also
reads `.nvmrc`:

```powershell
winget install Schniz.fnm
# reopen the terminal, then from the repo root:
fnm install
fnm use
```

Add fnm's shell hook so the version switches automatically per directory, following
<https://github.com/Schniz/fnm#shell-setup>. Alternatives, if the student prefers: nvm-windows
(<https://github.com/coreybutler/nvm-windows>, note it does not read `.nvmrc`, so pass `24`
explicitly), or `winget install OpenJS.NodeJS.LTS` for a plain install with no version
switching, or WSL2 and then the macOS/Linux instructions inside it.

After they report back, re-run Step 1 and confirm their own terminal now prints a version
that satisfies `.nvmrc`. Do not proceed until it does. Everything after this point fails
without Node, and fails confusingly.

---

## Step 3 - Install the repo tooling (root)

```bash
npm install
```

Run this from the repo root, and run it **first**, before either app. You can run it
yourself; it is a one-shot command.

**Do not skip this and do not describe it as optional.** The root `package.json` holds
Husky, commitlint, lint-staged and Prettier, and its `prepare` script is what points git
at the hooks by setting `core.hooksPath` to `.husky/_`. In a fresh clone that config is
unset, so `.husky/pre-commit` and `.husky/commit-msg` never execute. The failure is silent
and easy to misread:

- Commits with any message shape are accepted, so a bare `fixed stuff` goes through even
  though commitlint would reject it.
- Staged files are never linted or formatted, because `lint-staged` never runs.
- Everything looks fine locally, and then the `conventions` job fails on the PR.

`.husky/commit-msg` calls `npx --no-install commitlint`, so without root `node_modules`
that hook could not work even if `core.hooksPath` were set by hand.

Verify:

```bash
git config core.hooksPath      # expect: .husky/_
```

If that prints nothing, the install did not run its `prepare` script; run `npx husky` from
the root.

---

## Step 4 - Choose the setup path

- Argument `backend` → do **Step 5 (backend)** only, then **Step 8 - Verify**.
- Argument `frontend` → do **Step 6 (frontend)** only, then **Step 8 - Verify**.
- No argument (full stack) → do Step 5, Step 6, then Step 7 and Step 8.

Steps 1 to 3 always apply, whichever path is taken.

---

## Step 5 - Backend setup (`backend/`)

1. Install dependencies (you run this):

   ```bash
   cd backend && npm install
   ```

2. Create the local `.env` from the template:

   ```bash
   cd backend && cp .env.example .env
   ```

   `.env` is read at startup by `ConfigModule.forRoot()` in `src/app.module.ts`, and values are consumed through `ConfigService`. It is gitignored and must never be committed. The app **no longer runs without it**: `src/config/env.validation.ts` fails the boot on a missing `DATABASE_URL` (RUN-46) or `JWT_SECRET` (RUN-56).

3. Read `backend/.env` and flag any variables that are missing or still set to placeholder values. The backend currently reads four:

   | Variable       | Default if unset        | Purpose                             |
   | -------------- | ----------------------- | ----------------------------------- |
   | `PORT`         | `3000`                  | Port the API listens on             |
   | `FRONTEND_URL` | `http://localhost:4200` | CORS origin for client-side fetches |
   | `DATABASE_URL` | **none - boot fails**   | PostgreSQL connection string (RUN-46); create the DB once, then `npx prisma migrate dev` |
   | `JWT_SECRET`   | **none - boot fails**   | Signs auth tokens (RUN-56); min 32 chars, generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

   Anything set in the shell environment overrides `.env`.

   > Real secrets (API keys, tokens) never live in the repo - they come from the team secret manager and are pasted into `.env` locally. See the `repo-secrets` skill.

4. The dev server is **the user's** to start, per Rule 1. Give them this and wait:

   > In your own terminal, from the repo root:
   >
   > ```bash
   > cd backend && npm run start:dev
   > ```
   >
   > Leave that terminal open. It runs on `http://localhost:3000` in watch mode, and
   > stopping it stops the API.

---

## Step 6 - Frontend setup (`frontend/`)

1. Install dependencies (you run this):

   ```bash
   cd frontend && npm install
   ```

2. Create the local `.env.local` from the template:

   ```bash
   cd frontend && cp .env.example .env.local
   ```

   > Next.js reads env vars from `.env.local`; browser-exposed ones are prefixed `NEXT_PUBLIC_`. The app also runs on defaults without it.

3. Again the user starts it, in a **second** terminal:

   > ```bash
   > cd frontend && npm run dev
   > ```
   >
   > Leave it open. It serves `http://localhost:4200`.

---

## Step 7 - Run both apps together (full stack)

The backend serves the HTTP API on `:3000`; the frontend runs on `:4200` and calls the
backend. They need **two terminals, both owned by the user, both left open**:

```bash
# Terminal 1
cd backend && npm run start:dev
```

```bash
# Terminal 2
cd frontend && npm run dev
```

Then they open `http://localhost:4200` in a browser. The frontend calls the API at
`http://localhost:3000`; traffic never goes the other way.

If a port is already taken, the offender is usually a dev server from an earlier session.
On macOS/Linux `lsof -nP -iTCP:3000 -sTCP:LISTEN` names the process; on Windows
`netstat -ano | findstr :3000`.

---

## Step 8 - Verify

Only after the user confirms both servers are running in their own terminals.

**Backend** - you can check this yourself:

```bash
curl http://localhost:3000/api/hello
```

Expect a JSON body. A 404 on `/` is also correct and not a fault: the global `api` prefix
puts the route at `/api/hello`.

**Frontend** - ask the user to open `http://localhost:4200` and confirm the greeting from
the backend renders, with no errors in the browser console. You cannot see their browser.

**Hooks** - a silent miss here is the most common setup failure:

```bash
git config core.hooksPath      # expect: .husky/_
```

**Tests** - you run these:

```bash
cd backend && npm test
cd backend && npm run test:e2e
cd frontend && npm test
```

All Jest, all run once and exit. `npm run test:watch` in either app gives the watcher, but
that is a long-running process, so it belongs to the user's terminal too.

---

## Summary

Present a checklist of what passed and what still needs attention, and be explicit about
anything that depends on the user rather than on you:

```
✅ Node v24.x on the user's own PATH (~/.nvm/...), matches .nvmrc; npm v11.x
✅ root deps installed, git hooks active (core.hooksPath = .husky/_)
✅ backend deps installed, .env created
✅ frontend deps installed, .env.local created
✅ backend tests passing (unit + e2e), frontend tests passing
✅ user started both servers; curl to /api/hello returned 200
⚠️ node resolved to a Claude Code bundled runtime - user must install Node themselves
   before any of this works in their own terminal (Step 2)
```

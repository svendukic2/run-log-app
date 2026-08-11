# Decode Academy Demo

A starter repo for Decode Academy final projects: a **Next.js** frontend talking to a
**NestJS** backend, with the tooling you are expected to use on a real team already wired
up (git hooks, Conventional Commits, CI, per-app linting and tests).

Take a copy, build your project in it. It is deliberately small: one feature works end to
end, and the rest is yours.

## Getting your own copy

**Do not fork and do not clone this repo directly.** Use the template, so you get a
repository that is genuinely yours: your own history, no `forked from` label, and it
stays with you after the academy ends.

```bash
# 1. Create your own repo from this template, and clone it.
#    Replace <your-project-name>. The owner is YOUR personal account, not the org.
gh repo create <your-project-name> \
  --template DECODE-Agentic-Academy/decode-academy-demo \
  --private --clone

# 2. Give your mentor read access, so they can review your work.
gh api -X PUT repos/<your-username>/<your-project-name>/collaborators/mselendic \
  -f permission=pull
```

Prefer the browser? Hit **`Use this template`** at the top of this page, then
`Create a new repository`. In the **Owner** dropdown pick **your own account**, not
`DECODE-Agentic-Academy`. Then add the mentor under `Settings` → `Collaborators`.

Step 2 is not optional. Without it nobody can see your work or help you when you are
stuck.

Your repo starts private. You are free to switch it to public whenever you want it in
your portfolio: `Settings` → `General` → `Danger Zone` → `Change visibility`. Before you
do, check that no real secret ever got committed; `.env` files are gitignored precisely
so this stays safe.

## What works today

Exactly one thing, on purpose, so you can see the whole path from browser to API without
reading a lot of code:

```text
browser  ->  Next.js page (:4200)  ->  fetch on the server  ->  NestJS (:3000)
                                                                GET /api/hello
                                                                { "message": "..." }
```

Open the home page and you see a greeting that came from the backend. The relevant files
are [`frontend/src/app/page.tsx`](frontend/src/app/page.tsx) and
[`backend/src/app.controller.ts`](backend/src/app.controller.ts). Both are short. Read
them first.

If the backend is not running, the page says so instead of crashing, which is a useful
thing to notice: the frontend handles the failure rather than pretending it cannot happen.

## Prerequisites

| Tool    | Version                                   | Note                                                        |
| ------- | ----------------------------------------- | ----------------------------------------------------------- |
| Node.js | see [`.nvmrc`](.nvmrc) (currently **24**) | `nvm use` picks it up automatically. CI uses this same file |
| npm     | 10+                                       | Ships with Node 24                                          |
| git     | any recent                                |                                                             |

The hard floor is **v20.9.0**, which is what `next` declares in `engines`. All three
`package.json` files carry that constraint, so npm warns with `EBADENGINE` if you are below
it.

**Check in a terminal you opened yourself**, not through an editor extension or an AI
assistant:

```bash
node --version
npm --version
```

If that says `command not found`, you have no Node and nothing below will work. Note that
Claude Code can be installed without a system Node and carries its own bundled runtime, so
a version check that succeeds _inside_ the assistant can still mean your own terminal has
nothing. The terminal you type in is the one that counts.

### Installing Node on macOS or Linux

Use [nvm](https://github.com/nvm-sh/nvm), which reads `.nvmrc`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# reopen the terminal, then from the repo root:
nvm install    # reads .nvmrc
nvm use        # reads .nvmrc
```

### Installing Node on Windows

`nvm` is macOS/Linux only. Use [fnm](https://github.com/Schniz/fnm), which also reads
`.nvmrc`:

```powershell
winget install Schniz.fnm
# reopen the terminal, then from the repo root:
fnm install
fnm use
```

Add fnm's [shell hook](https://github.com/Schniz/fnm#shell-setup) so the version switches
per directory. Alternatives: [nvm-windows](https://github.com/coreybutler/nvm-windows)
(does not read `.nvmrc`, so pass `24` explicitly), `winget install OpenJS.NodeJS.LTS` for a
plain install with no switching, or WSL2 plus the macOS/Linux steps inside it.

## Quick start

This is a **multi-app repo**, not an npm-workspaces monorepo. There are three
`package.json` files and each one is installed separately.

```bash
# 1. Repo tooling. Do not skip this: it activates the git hooks.
npm install

# 2. Backend
cd backend && npm install && cp .env.example .env && cd ..

# 3. Frontend
cd frontend && npm install && cp .env.example .env.local && cd ..
```

> **Why step 1 matters.** The root `package.json` holds only Husky, commitlint,
> lint-staged and Prettier, and its `prepare` script is what installs the hooks. Skip it
> and your commits silently bypass every check the project relies on.

The frontend's `.env.local` is optional (it falls back to localhost defaults). The
backend's `.env` is **not optional anymore**: since RUN-46 the API connects to PostgreSQL
at startup and refuses to boot without a `DATABASE_URL`, and since RUN-56 it also
refuses to boot without a `JWT_SECRET` (auth tokens are signed with it). One-time setup:

```bash
# 4. Database (needs a locally installed PostgreSQL, no Docker required)
#    Create the empty database once, e.g. with psql:
#      CREATE DATABASE runlog;
#    Fill DATABASE_URL in backend/.env with your local credentials, then:
cd backend && npx prisma migrate dev && cd ..

# 5. JWT secret (min 32 chars; the template's placeholder is rejected at boot)
#    Generate one and paste it into JWT_SECRET in backend/.env:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`npx prisma migrate dev` applies the committed migrations from
`backend/prisma/migrations/`, so every clone ends up with an identical schema. The full
data-model contract and Prisma wiring notes live in
[docs/data-model.md](docs/data-model.md).

The backend e2e suite (`npm run test:e2e`) creates and uses its own `runlog_test`
database automatically; it wipes tables between tests and refuses to run against
anything not named `*_test`, so your development data is never at risk.

Now run both apps, each in its **own terminal**:

```bash
# Terminal 1
cd backend && npm run start:dev     # http://localhost:3000
```

```bash
# Terminal 2
cd frontend && npm run dev          # http://localhost:4200
```

Open <http://localhost:4200>. You should see "Frontend + Backend connected" with the
message fetched from the API.

Since RUN-48 the app screens (dashboard, runs, coach) read and write runs through the
backend: the browser calls same-origin `/api/*`, which Next.js proxies to :3000. Both
the backend and the database therefore need to be running for those screens to show
data; if they are not, the pages show a retry card instead of your runs.

### Verify the backend directly

```bash
curl http://localhost:3000/api/hello
# {"message":"Welcome friend, hello from the NestJS API 👋"}
```

Note the `/api` part. `http://localhost:3000/` on its own returns **404**, and that is
correct, not a broken server. See "Gotchas" below.

## Project structure

```text
backend/                  NestJS 11 API on :3000
  src/
    main.ts               Bootstrap: global 'api' prefix, CORS, port
    app.module.ts         Root module, registers ConfigModule
    app.controller.ts     GET /api/hello
    app.service.ts        Business logic + the HelloResponse contract
    app.controller.spec.ts
  test/                   Supertest e2e specs
  .env.example

frontend/                 Next.js 16 (App Router) + React 19 on :4200
  src/app/
    layout.tsx            Root layout
    page.tsx              Home route, async Server Component, fetches the API
    page.test.tsx         React Testing Library example
    globals.css           Tailwind v4 entry
  .env.example

.claude/                  Claude Code skills, agents and permissions
.github/workflows/ci.yml  Backend, frontend and commit-convention jobs
.husky/                   pre-commit and commit-msg hooks
CLAUDE.md                 Deeper architecture notes (also read by Claude Code)
```

New backend features go in their own module folder under `backend/src/`. New frontend
routes are folders under `frontend/src/app/` containing a `page.tsx`. Shared components
go in `frontend/src/components/`, which does not exist yet: create it with your first
one.

## Commands

Run these from inside the app directory, never from the repo root.

|                     | Backend (`cd backend`) | Frontend (`cd frontend`) |
| ------------------- | ---------------------- | ------------------------ |
| Dev server          | `npm run start:dev`    | `npm run dev`            |
| Production build    | `npm run build`        | `npm run build`          |
| Lint                | `npm run lint`         | `npm run lint`           |
| Unit tests          | `npm test`             | `npm test`               |
| Tests in watch mode | `npm run test:watch`   | `npm run test:watch`     |
| E2E tests           | `npm run test:e2e`     | not set up               |
| Coverage            | `npm run test:cov`     | not set up               |

Both apps use Jest, so `npm test` runs once and exits. To filter:
`npm test -- page` by path, `npm test -- -t "greeting"` by test name.

Neither app has a `typecheck` script. `npm run build` is the typecheck, because it runs
`tsc` (backend) or `next build` (frontend). Run it before you push.

## Environment variables

| App      | Template                | Your local file       | Variables                                                            |
| -------- | ----------------------- | --------------------- | -------------------------------------------------------------------- |
| Backend  | `backend/.env.example`  | `backend/.env`        | `PORT` (3000), `FRONTEND_URL` (CORS origin, `http://localhost:4200`), `DATABASE_URL` (**required**), `JWT_SECRET` (**required**, min 32 chars), `ROUTING_API_KEY` + `ROUTING_BASE_URL` (optional) |
| Frontend | `frontend/.env.example` | `frontend/.env.local` | `BACKEND_URL` (`http://localhost:3000`)                              |

Note the filename difference: Nest reads `.env`, Next.js reads `.env.local`. Both are
gitignored and must never be committed. Only the `.env.example` templates are.

The same names are used by the deployed environments, where they live in the host's env
config instead of a file - see [Deployment](#deployment).

**One rule worth memorising:** in Next.js, a variable prefixed `NEXT_PUBLIC_` is inlined
into the JavaScript sent to the browser, so it is public forever. `BACKEND_URL` has no
such prefix because it is read on the server. Never put a secret behind
`NEXT_PUBLIC_`.

The backend validates its environment at boot (`src/config/env.validation.ts`): a
missing or placeholder `DATABASE_URL`/`JWT_SECRET` stops the start with a message that
names the fix. The frontend has no such validation; a missing variable there falls back
to its default or fails at first use.

## Git workflow

**Never commit or push directly to `main`.** Branch first:

```bash
git switch -c feat/DEMO-123-short-description
```

Branch format is `{type}/DEMO-{number}-{slug}`.

**Commit messages must follow Conventional Commits**, enforced by a `commit-msg` hook. If
the message does not match, the commit is rejected.

```text
feat(backend): add orders module
fix(frontend): handle empty product list
docs: explain the env setup
```

Allowed types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`,
`revert`, `style`, `test`. Scope is usually `backend` or `frontend`, and can be omitted
for repo-level changes.

Two hooks run automatically:

- **pre-commit** runs `lint-staged`: ESLint `--fix` then Prettier, on staged files only,
  invoked from each app's own directory so the right config loads.
- **commit-msg** runs commitlint on your message.

**Backend tests are not run on commit** because they are slow; the hook only prints a
reminder. CI runs them on every PR, so run them locally before pushing backend changes.

## GitHub CLI (`gh`)

`gh` is GitHub's official command-line tool. It is **optional** for building the project
and **required** for anything involving pull requests from the terminal, including the
`repo-review-prs` Claude Code skill.

Why bother instead of using the website: opening a PR becomes one command, and you never
paste a personal access token anywhere, because `gh` stores an OAuth token in your OS
keychain and can act as git's credential helper.

### 1. Install

```bash
# macOS
brew install gh

# Windows
winget install --id GitHub.cli

# Linux (Debian/Ubuntu)
sudo apt install gh
```

Other distributions and installers: <https://github.com/cli/cli#installation>

Check it landed:

```bash
gh --version
```

### 2. Log in

```bash
gh auth login
```

It asks a short series of questions. The answers you want, matched on meaning rather than
position, since the wording and order shift between `gh` versions:

| Prompt                                         | Answer                       |
| ---------------------------------------------- | ---------------------------- |
| Which account or host                          | **GitHub.com**               |
| Preferred protocol for Git operations          | **HTTPS**                    |
| Authenticate Git with your GitHub credentials? | **Yes**                      |
| How would you like to authenticate?            | **Login with a web browser** |

It then shows a one-time code, opens your browser, and you paste the code there.

**HTTPS** plus **Yes** to the credential question is the combination that matters: it
makes `gh` act as git's credential helper, which is why git stops asking for a password
on every push. SSH works too, but then you manage keys yourself.

### 3. Verify

```bash
gh auth status
```

You want a green check, your username, and a scopes line. The default scopes
(`repo`, `read:org`, `gist`) are enough for everything in this repo: `repo` covers
reading and writing pull requests and review comments, `read:org` matters only if the
repository lives in an organisation rather than your personal account.

If you ever need to add a scope later, you do not start over:

```bash
gh auth refresh -s read:project
```

### 4. Commands you will actually use

```bash
gh pr create --fill                # open a PR from the current branch
gh pr list                         # open PRs in this repo
gh pr view 12                      # read PR #12
gh pr diff 12                      # its diff
gh pr checks                       # CI status for the current branch
gh repo view --web                 # open the repo in a browser
```

`gh pr create` reads the branch you are on, so commit and push first. Since this repo
forbids committing to `main`, the normal flow is: branch, commit, push, `gh pr create`.

### Troubleshooting

| Symptom                               | Fix                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `gh: command not found`               | Install step above. On macOS restart the terminal after `brew install`                     |
| `gh auth status` says not logged in   | Run `gh auth login`. In a container or over SSH, add `--web` or use a token via `GH_TOKEN` |
| `HTTP 403` when posting a review      | Your token lacks `repo`, or you lack write access to that repository                       |
| git still asks for a password on push | You answered "No" to the credential-helper prompt. Re-run `gh auth login` and answer Yes   |
| Two accounts, wrong one is used       | `gh auth switch`                                                                           |

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs three jobs in parallel on
every pull request and on pushes to `main`:

| Job           | Steps                                                             |
| ------------- | ----------------------------------------------------------------- |
| `backend`     | Postgres service container, migrate, lint, build, unit tests, e2e |
| `frontend`    | lint, unit tests, build                                           |
| `conventions` | commitlint over every commit in the PR                            |

The Node version comes from `.nvmrc`, so bump it there and CI follows.

A repo-wide `prettier --check` step exists but is commented out: 55 files predate the
Prettier config and it would fail on a fresh clone. To turn it on, run
`npx prettier --write .` once, commit that, then uncomment the step.

## Deployment

Two hosts, because each is the cheapest reliable fit for its half:

| Service            | Host                       | Config lives in                                     |
| ------------------ | -------------------------- | --------------------------------------------------- |
| Backend (NestJS)   | Render, free web service    | [`render.yaml`](render.yaml) (committed)             |
| Postgres           | Render, free managed database | [`render.yaml`](render.yaml) (committed)           |
| Frontend (Next.js) | Vercel, free (Hobby)        | Vercel project settings (no repo file needed)        |

### Why these

Of the three hosts the ticket weighed, **Render** is the only one that still has a real
free tier: Railway ended its free plan (a one-off trial credit, then $5/month Hobby) and
Fly retired free allowances in October 2024. Render gives a free web service plus a free
managed Postgres, needs exactly one repo file, and configures migrations and env vars
declaratively.

The frontend stays on **Vercel** because this repo was already connected to it before this
ticket, Next.js needs no configuration there, and - the part that matters for a demo -
Vercel's free tier does not sleep. Putting the frontend on Render's free tier too would
have made both halves cold-start.

Two free-tier catches to know before you rely on this:

- **Free web services sleep after 15 minutes idle** and take roughly a minute to wake. The
  first person to open the demo after a quiet spell waits; everyone after them does not.
  Only the backend is affected, so the page paints immediately and the data arrives late.
- **A free Render Postgres expires 30 days after creation**, then sits in a 14-day grace
  period before the data is deleted. Render emails a warning first. Two ways out, both
  fine: recreate the database and re-run the migrations (a demo's data is disposable), or
  point `DATABASE_URL` at a free [Neon](https://neon.com) database, which does not expire -
  it is only an env var, so nothing in the repo changes. Add `?sslmode=require` if you do.

### How a deploy is triggered

Both hosts watch **`master`**, so merging to `master` deploys. Feature branches merge into
`develop` first; `develop` to `master` is the release.

Render, on every deploy, in this order:

1. `npm ci --include=dev && npm run build` in `backend/` (this also runs `prisma generate`
   via `postinstall`).
2. `npx prisma migrate deploy && npm run start:prod` - migrations apply **before** the new
   server accepts traffic, which is the property AC2 asks for. `migrate deploy` applies the
   committed migrations verbatim and is a no-op when none are pending.

Migrations are in the start command rather than a pre-deploy step because Render's
pre-deploy command is a paid feature. To run them by hand instead, from `backend/` with
`DATABASE_URL` pointing at the deployed database:

```bash
npx prisma migrate deploy
```

That works from a laptop as long as you use the database's **external** URL with
`?sslmode=require`; the internal URL only resolves from inside Render.

### First-time setup

Render, once: **Dashboard > New > Blueprint**, point it at this repo. `render.yaml` creates
the service and the database and prompts for the three values it deliberately does not
contain (`JWT_SECRET`, `FRONTEND_URL`, `ROUTING_API_KEY`).

Vercel, once: import the repo, set **Root Directory** to `frontend`, add `BACKEND_URL`.
Setting the root directory is what keeps the host out of the repo root - it must never
install the root `package.json`, whose `prepare: husky` script has no business running on a
build server. `render.yaml` does the same thing with `rootDir: backend`.

### Environment variables per service

Set these in the host, never in the repo (AC3). **Secret** means treat it like a password.

Render, `runlog-backend`:

| Variable          | Secret | Value                                                              |
| ----------------- | ------ | ------------------------------------------------------------------ |
| `DATABASE_URL`    | yes    | wired automatically from `runlog-db` (internal URL, no `sslmode`)   |
| `JWT_SECRET`      | yes    | fresh random string, min 32 chars; generator below                  |
| `FRONTEND_URL`    | no     | the Vercel origin, no trailing slash, e.g. `https://<app>.vercel.app` |
| `ROUTING_API_KEY` | yes    | openrouteservice key; optional (see below)                          |
| `NODE_VERSION`    | no     | `24`, already set in `render.yaml`                                  |
| `PORT`            | -      | injected by Render; do not set it                                   |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Vercel, frontend:

| Variable      | Secret | Value                                                           |
| ------------- | ------ | --------------------------------------------------------------- |
| `BACKEND_URL` | no     | the Render backend origin, e.g. `https://runlog-backend.onrender.com` |

`BACKEND_URL` must **not** get a `NEXT_PUBLIC_` prefix. `next.config.ts` rewrites `/api/*`
to it server-side, which is why the browser only ever talks to its own origin and no CORS
is involved. A `NEXT_PUBLIC_` prefix would bake the backend URL into every browser bundle
permanently.

`FRONTEND_URL` and `BACKEND_URL` point at each other, so the first deploy is a two-step:
deploy both, then fill in each host's variable with the other's real URL and redeploy.

`ROUTING_API_KEY` is optional (RUN-53). Without it the app works and only
`POST /api/routes/plan` answers 503 `ROUTING_NOT_CONFIGURED`, which the Add run modal shows
while still letting you save the run by hand. Set it before demoing route maps.

### When a deploy fails

The backend validates its environment at boot and **fails loudly on purpose**
(`backend/src/config/env.validation.ts`), listing every problem at once. So a bad env var
shows up as a clear startup error in the logs rather than a broken request later. The
messages you are most likely to meet:

| Log says                                              | Fix                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL is not set`                             | the service is not linked to the database                            |
| `DATABASE_URL must start with postgresql://`          | a host or password was pasted instead of the whole URL               |
| `still contains a "<...>" placeholder`                 | the template text was pasted unedited                                |
| `JWT_SECRET must be at least 32 characters`            | generate a longer one                                                |
| `nest: not found` during build                         | the build command lost `--include=dev` (Render sets `NODE_ENV=production`, which makes npm skip devDependencies, and the Nest CLI is one) |
| SSL handshake / `sslmode` error                        | an external database URL without `?sslmode=require`                  |
| health check fails, service restarts                   | `healthCheckPath` must be `/api/hello`; `/` is a 404 behind the global `api` prefix |

### Logs

- **Render**: service > **Logs** for build and runtime output, streaming live. `render logs`
  in their CLI does the same. The database has its own Logs tab.
- **Vercel**: project > **Deployments** > a deployment for its build log; the **Logs** tab
  for server-side runtime output (which is where a failing `/api/*` rewrite surfaces).

## Working with Claude Code

This repo ships [Claude Code](https://claude.com/claude-code) configuration in
`.claude/`. It is optional, but if you use Claude Code these are already set up for you:

| Skill                                | What it does                                                             |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `repo-dev-setup`                     | Walks the setup above and tells you what is missing                      |
| `repo-commit`                        | Runs the right lint and tests, then writes a Conventional Commit message |
| `repo-secrets`                       | Manages `.env` files from the templates                                  |
| `repo-jira`                          | Creates, estimates and transitions Jira issues over MCP                  |
| `repo-review-prs`                    | Reviews open pull requests                                               |
| `backend-nestjs` / `frontend-nextjs` | Rule libraries consulted automatically while writing code                |

Invoke a skill by its full name (`/repo-dev-setup`), or just describe what you want:
descriptions are matched automatically.

Two things to know about the setup:

- **Claude asks before editing files.** `Edit` and `Write` are deliberately not
  pre-approved, so you see every diff before it lands. Reading diffs is a large part of
  what you are here to learn. Turn it off with Shift+Tab once it slows you down, not
  before.
- **`.claude/settings.json` is committed and shared**, so personal preferences go in
  `.claude/settings.local.json`, which is gitignored. Every choice in the shared file is
  explained in [`.claude/SETTINGS.md`](.claude/SETTINGS.md).

Using Jira needs an MCP server; see
[`.claude/skills/repo-jira/references/jira-access.md`](.claude/skills/repo-jira/references/jira-access.md)
for the two supported setups and their trade-offs.

## Gotchas

| Symptom                                                   | Cause                                                                                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http://localhost:3000/` returns 404                      | Correct. A global `api` prefix means the route is `/api/hello`. The prefix is set once in `backend/src/main.ts`                                      |
| Page says "Could not reach the API"                       | The backend is not running, or not on 3000                                                                                                           |
| `node: command not found`, but it worked via the AI agent | Claude Code can ship its own bundled Node, which your terminal does not see. Install Node yourself, see [Prerequisites](#prerequisites)              |
| Servers die as soon as the AI assistant finishes          | Expected. Processes an assistant starts belong to its session. Start `npm run start:dev` and `npm run dev` in your own terminals and leave them open |
| Commits go through with no lint or message check          | You skipped the root `npm install`, so the hooks were never installed. Check with `git config core.hooksPath`, which should print `.husky/_`         |
| ESLint cannot find its config                             | You ran it from the repo root. Each app's ESLint runs from that app's directory                                                                      |
| Ports look backwards                                      | They are asymmetric on purpose: backend **3000**, frontend **4200**. Both are wired into code and config, so do not swap them                        |
| Port already in use                                       | A dev server from an earlier session. `lsof -nP -iTCP:3000 -sTCP:LISTEN` on macOS/Linux, `netstat -ano \| findstr :3000` on Windows                  |

## Where to go from here

Things this boilerplate deliberately does not decide for you:

- **Auth.** Signup and login exist since RUN-56 (`POST /api/auth/signup`,
  `POST /api/auth/login`, JWT in the response), and since RUN-57 a global
  `JwtAuthGuard` protects every endpoint except `/api/auth/*` and `/api/hello`:
  send `Authorization: Bearer <token>` or get a 401. Every entity is owned by a
  user and queries are scoped server-side; see `docs/data-model.md` ("Ownership").
  Still yours to build: the frontend session handling (RUN-58).
- **Shared types between the apps.** Right now `HelloResponse` is declared in
  `backend/src/app.service.ts` and copied by hand into `frontend/src/app/page.tsx`.
  Changing the response shape means editing both. Generating types from an OpenAPI spec is
  the better answer once you have real endpoints.
- **A chat feature.** There is no `/api/chat` route yet, and the env template ships no
  model-provider key. Add the variable your provider needs when you build the route,
  server-side only.

[`CLAUDE.md`](CLAUDE.md) has the deeper architectural notes: why the ports are what they
are, how the request flows through the Server Component, and what else is not built yet.
Read it when you want the reasoning rather than the steps.

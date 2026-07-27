# Commit Pre-flight Checks
<!-- AUTO-GENERATED - refresh with `/commit refresh-checks` -->
<!-- Last updated: 2026-07-09 -->

This file is read by the `/commit` skill. It knows which apps exist, whether they
depend on each other, and which lint/test commands to surface before a commit.

---

## Dependency Note

`backend/` and `frontend/` are **independent** npm projects - neither imports the
other's source. A change in one app does not require re-testing the other. The
only cross-app coupling is the HTTP contract: `HelloResponse` is declared in
`backend/src/app.service.ts` and hand-mirrored in `frontend/src/app/page.tsx`, so
when the backend changes a response shape the frontend copy must be updated by
hand. That is a follow-up task, not a test dependency. Surface checks only for
the app(s) whose files actually changed.

---

## App Registry

| App        | Path        | Lint                 | Typecheck               | Unit Tests |
|------------|-------------|----------------------|-------------------------|------------|
| `backend`  | `backend/`  | ✅ `npm run lint`    | via `npm run build` (`tsc`) | ✅ `npm test` (Jest) |
| `frontend` | `frontend/` | ✅ `npm run lint`    | via `npm run build` (`next build`) | ✅ `npm test` (Jest) |

Notes:
- Backend has no standalone `typecheck` script - `npm run build` (`nest build`,
  which runs `tsc`) is the typecheck gate.
- Frontend has no standalone `typecheck` script - `npm run build` (`next build`)
  type-checks the whole app.
- `npm run lint` runs `eslint` via `eslint-config-next`, already wired in
  `frontend/`.

---

## Commands per App

### `backend` - `backend/`

```bash
cd backend && npm run lint
```
```bash
cd backend && npm run build   # doubles as typecheck
```
```bash
cd backend && npm test
```

### `frontend` - `frontend/`

```bash
cd frontend && npm run lint
```
```bash
cd frontend && npm run build  # doubles as typecheck
```
```bash
cd frontend && npm test
```

---

## Full pre-push (both apps)

Run when a change spans both apps, or before opening a PR:

```bash
cd backend  && npm run lint && npm run build && npm test && cd .. && \
cd frontend && npm run lint && npm run build && npm test && cd ..
```

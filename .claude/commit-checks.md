# Commit Checks Cache - updated 2026-07-31

<!-- AUTO-GENERATED - refresh with `/commit refresh-checks` -->

`backend/` and `frontend/` are independent npm projects - surface checks only for
the app(s) whose files actually changed. The only cross-app coupling is the HTTP
contract (`HelloResponse`, hand-mirrored between the apps).

## App Registry

| App      | lint           | test       | test:e2e           | build           |
| -------- | -------------- | ---------- | ------------------ | --------------- |
| backend  | `npm run lint` | `npm test` | `npm run test:e2e` | `npm run build` |
| frontend | `npm run lint` | `npm test` | -                  | `npm run build` |

Notes:

- Neither app has a standalone `typecheck` script - `npm run build` is the
  typecheck gate (backend `tsc` via `nest build`, frontend `next build`).
- Frontend lint runs `eslint` via `eslint-config-next`.

## Per-app commands

**backend** (run from `backend/`):

- lint: `cd backend && npm run lint`
- test: `cd backend && npm test`
- e2e: `cd backend && npm run test:e2e`
- build: `cd backend && npm run build`

**frontend** (run from `frontend/`):

- lint: `cd frontend && npm run lint`
- test: `cd frontend && npm test`
- build: `cd frontend && npm run build`

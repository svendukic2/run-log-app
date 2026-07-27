---
name: frontend-nextjs
description: This skill should be used when the user asks to "scaffold a Next.js page or component", "review Next.js/React code", "add a Server Action", "convert a component to a client component", "fetch data in the App Router", "set up a form", "fix a rendering/caching issue", or asks about Next.js 16 App Router, React 19, Server vs Client Components, Tailwind, or best practices. Passive reference library with 16 rules across 10 categories for production-ready Next.js App Router applications.
license: MIT
allowed-tools: Read, Grep, Glob
metadata:
  version: "1.0.0"
---

> **Tools used:** `Read`, `Grep`, `Glob` - loads rule files from `rules/` on demand.

# Next.js 16 (App Router) Best Practices

Reference guide for modern Next.js 16 applications using the App Router, React 19,
Server Components, and Tailwind CSS v4. Contains 16 rules across 10 categories,
prioritized by impact to guide code generation and review.

## When to Apply

Reference these guidelines when:

- Add routes, layouts, or components under `src/app/`
- Decide whether a component should be a Server or Client Component
- Fetch data or mutate it (Server Components, Server Actions, route handlers)
- Reason about static vs dynamic rendering, caching, and streaming
- Model client-side state with React hooks
- Build forms with Server Actions and server-side validation
- Write component unit tests (Jest + React Testing Library)

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Architecture | CRITICAL | `arch-` |
| 2 | Server & Client Components | CRITICAL | `rsc-` |
| 3 | Data Fetching & Mutations | CRITICAL | `data-` |
| 4 | Rendering & Caching | HIGH | `render-` |
| 5 | State & Reactivity | HIGH | `state-` |
| 6 | Forms | HIGH | `forms-` |
| 7 | Performance | HIGH | `perf-` |
| 8 | Type Safety | HIGH | `type-` |
| 9 | Testing | MEDIUM-HIGH | `test-` |
| 10 | Accessibility | MEDIUM-HIGH | `a11y-` |

## Quick Reference

### 1. Architecture (CRITICAL)

- `arch-app-router-structure` - Use the App Router file conventions (`page`/`layout`/`loading`/`error`)
- `arch-colocation` - Colocate components, keep route files thin

### 2. Server & Client Components (CRITICAL)

- `rsc-server-by-default` - Keep components server-first; no needless `'use client'`
- `rsc-use-client-boundaries` - Push `'use client'` down to the interactive leaves

### 3. Data Fetching & Mutations (CRITICAL)

- `data-fetch-in-server-components` - Fetch data in async Server Components
- `data-server-actions` - Mutate with Server Actions, then revalidate

### 4. Rendering & Caching (HIGH)

- `render-static-vs-dynamic` - Know what forces dynamic rendering; opt in deliberately
- `render-loading-and-suspense` - Stream slow data with `loading.tsx` / `<Suspense>`

### 5. State & Reactivity (HIGH)

- `state-minimal-client-state` - Keep client state minimal and local
- `state-derive-during-render` - Derive during render, do not sync with `useEffect`

### 6. Forms (HIGH)

- `forms-server-actions-validation` - Forms via actions with server-side validation

### 7. Performance (HIGH)

- `perf-list-keys` - Give lists stable, unique keys (never the index)
- `perf-next-image-and-dynamic` - Use `next/image` and dynamic imports

### 8. Type Safety (HIGH)

- `type-strict-typed-props` - Type props and (async) route params strictly

### 9. Testing (MEDIUM-HIGH)

- `test-rtl-component` - Test with React Testing Library and accessible queries

### 10. Accessibility (MEDIUM-HIGH)

- `a11y-basics` - Build accessible templates by default

## How to Use

Read individual rule files for detailed explanations and code examples:

```text
rules/arch-app-router-structure.md
rules/rsc-server-by-default.md
rules/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- A reference link to the official docs

The section overview lives in `rules/_sections.md`; the authoring template is `rules/_template.md`.

# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

---

## 1. Architecture (arch)

**Impact:** CRITICAL
**Description:** The App Router's file conventions (`page`, `layout`, `loading`, `error`) and colocated, thin route files are the foundation of a maintainable, fast-to-load Next.js application.

## 2. Server & Client Components (rsc)

**Impact:** CRITICAL
**Description:** Components are Server Components by default. Adding `'use client'` only at the interactive leaves keeps the client bundle small and lets data fetching stay on the server.

## 3. Data Fetching & Mutations (data)

**Impact:** CRITICAL
**Description:** Fetching in async Server Components and mutating through Server Actions (with revalidation) is the idiomatic App Router data model, replacing most client-side `useEffect` fetching.

## 4. Rendering & Caching (render)

**Impact:** HIGH
**Description:** Understanding static vs dynamic rendering and streaming with `loading.tsx` / `<Suspense>` controls both time-to-first-byte and how much work the server repeats per request.

## 5. State & Reactivity (state)

**Impact:** HIGH
**Description:** Minimal, local client state and deriving values during render (instead of syncing with `useEffect`) keep React components predictable and free of redundant re-renders.

## 6. Forms (forms)

**Impact:** HIGH
**Description:** Server Actions with server-side validation give forms a progressive-enhancement baseline and a single trustworthy place to parse and check input.

## 7. Performance (perf)

**Impact:** HIGH
**Description:** Stable list keys, `next/image`, and dynamic imports prevent needless DOM churn, oversized images, and bloated client bundles.

## 8. Type Safety (type)

**Impact:** HIGH
**Description:** Strict TypeScript, explicit prop types, and correctly typed (async) route params catch whole classes of errors at build time. Avoiding `any` preserves that safety throughout.

## 9. Testing (test)

**Impact:** MEDIUM-HIGH
**Description:** React Testing Library with accessible queries and mocked dependencies enables fast, isolated component tests that assert user-visible behavior rather than implementation details.

## 10. Accessibility (a11y)

**Impact:** MEDIUM-HIGH
**Description:** Semantic HTML, labeled inputs, keyboard-operable controls, and image alt text make the UI usable for everyone by default rather than as an afterthought.

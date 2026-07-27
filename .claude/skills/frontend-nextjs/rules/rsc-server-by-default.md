---
title: Keep Components Server-First
impact: CRITICAL
impactDescription: "less client JS, faster loads, direct data access"
tags: server-components, rsc, performance
---

## Keep Components Server-First

In the App Router every component is a React Server Component unless you opt out with `'use client'`. Server Components run only on the server, ship zero JavaScript to the browser, can be `async`, and can read data sources (databases, secrets, the filesystem) directly. Reach for `'use client'` only when a component genuinely needs interactivity: state, effects, event handlers, or browser-only APIs. Adding `'use client'` reflexively bloats the bundle, forfeits direct data access, and forces you to fetch over the network what you could have read in-process. Default to server; escalate to client at the leaves.

**Incorrect (client component with no interactive need):**

```tsx
'use client'; // unnecessary: no state, no events, no browser API

export default function PriceTag({ cents }: { cents: number }) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
  return <span className="font-semibold">{formatted}</span>;
}
```

**Correct (plain Server Component; can even fetch directly):**

```tsx
// No directive -> Server Component. Ships no JS, can be async.
import { db } from '@/lib/db';

export default async function ProductPrice({ id }: { id: string }) {
  const product = await db.product.findUniqueOrThrow({ where: { id } });
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(product.priceCents / 100);
  return <span className="font-semibold">{formatted}</span>;
}
```

If secrets or server-only modules must never leak into a client bundle, add the `server-only` package so an accidental client import fails the build.

Reference: [Server Components](https://react.dev/reference/rsc/server-components)

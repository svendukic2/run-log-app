---
title: Fetch Data in Server Components
impact: CRITICAL
impactDescription: "no request waterfalls, no loading flashes, less client JS"
tags: data-fetching, async, server-components
---

## Fetch Data in Server Components

Fetch initial data where the component renders on the server, using `await` inside an `async` Server Component with `fetch()` or a direct database call. This runs close to the data, streams finished HTML to the browser, and ships no fetching logic to the client. The `useEffect` + `useState` pattern is a regression here: it renders an empty shell, waits for hydration, then fires a second round trip, producing a loading flash and a client-side waterfall. Reserve client fetching for data that genuinely depends on user interaction after load. Next.js augments `fetch` with caching controls (`cache`, `next.revalidate`) so you tune freshness per request.

**Incorrect (client-side effect fetch for initial data):**

```tsx
'use client';
import { useEffect, useState } from 'react';

export default function Products() {
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    fetch('/api/products').then((r) => r.json()).then(setProducts);
  }, []);
  if (!products) return <p>Loading...</p>; // flash on every visit
  return <ul>{products.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

**Correct (async Server Component fetches directly):**

```tsx
// src/app/products/page.tsx  (Server Component)
export default async function ProductsPage() {
  const res = await fetch('https://api.example.com/products', {
    next: { revalidate: 60 }, // ISR: re-fetch at most once a minute
  });
  const products: Product[] = await res.json();
  return (
    <ul>
      {products.map((p) => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
}
```

Use `{ cache: 'no-store' }` for per-request data and `next: { tags: ['products'] }` when you want to invalidate on demand with `revalidateTag`.

Reference: [Data Fetching and Caching](https://nextjs.org/docs/app/building-your-application/data-fetching/fetching)

---
title: Keep Client State Minimal and Local
impact: HIGH
impactDescription: "less client JS, fewer sync bugs, server stays source of truth"
tags: state, hooks, react
---

## Keep Client State Minimal and Local

Client state exists for genuinely interactive UI concerns: is this menu open, what has the user typed, which tab is active. Use `useState` or `useReducer` in a client component for exactly that, and keep the state as local as the component that owns it. Do not copy server-fetched data into a global client store; the server is already the source of truth, and mirroring it introduces staleness, hydration mismatches, and a large bundle just to re-hold data you already rendered. If several components need the same server data, fetch it in a shared Server Component parent and pass it down, rather than hoisting it into client-side global state.

**Incorrect (server data lifted into a global client store):**

```tsx
'use client';
import { create } from 'zustand';

// Duplicating server data on the client just to read it back
const useStore = create<{ products: Product[] }>(() => ({ products: [] }));

export function ProductList({ initial }: { initial: Product[] }) {
  useStore.setState({ products: initial }); // now two sources of truth
  const products = useStore((s) => s.products);
  return <ul>{products.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

**Correct (server data stays on the server; only UI state is local):**

```tsx
// products-list.tsx  (Server Component renders the data)
export function ProductList({ products }: { products: Product[] }) {
  return (
    <ul>
      {products.map((p) => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
}

// filter-toggle.tsx  (client component owns only UI state)
('use client');
import { useState } from 'react';
export function FilterToggle() {
  const [showSale, setShowSale] = useState(false);
  return <button onClick={() => setShowSale((v) => !v)}>{showSale ? 'All' : 'On sale'}</button>;
}
```

Reach for a client store only for truly cross-cutting UI state (theme, an open modal) that no server render can own.

Reference: [Managing State](https://react.dev/learn/managing-state)

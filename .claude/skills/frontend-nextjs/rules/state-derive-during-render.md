---
title: Derive State During Render, Don't Sync It
impact: HIGH
impactDescription: "eliminates a class of stale-state and double-render bugs"
tags: state, hooks, derivation
---

## Derive State During Render, Don't Sync It

If a value can be computed from props or existing state, compute it during render instead of storing a copy in `useState` and keeping it in sync with `useEffect`. Mirroring props into state creates two sources of truth: the effect runs after render, so the UI briefly shows stale data, and every change now needs an effect to stay correct. Effects are for synchronizing with systems outside React (network, subscriptions, the DOM), not for reacting to prop changes. Derive plainly during render, and wrap the calculation in `useMemo` only when profiling shows it is genuinely expensive.

**Incorrect (mirroring props into state via an effect):**

```tsx
'use client';
import { useEffect, useState } from 'react';

function FullName({ first, last }: { first: string; last: string }) {
  const [fullName, setFullName] = useState('');
  useEffect(() => {
    setFullName(`${first} ${last}`); // stale for one render, extra re-render
  }, [first, last]);
  return <h1>{fullName}</h1>;
}
```

**Correct (derive during render; memoize only if costly):**

```tsx
'use client';
import { useMemo } from 'react';

function FullName({ first, last }: { first: string; last: string }) {
  const fullName = `${first} ${last}`; // always correct, no effect needed
  return <h1>{fullName}</h1>;
}

function SortedList({ items }: { items: Item[] }) {
  const sorted = useMemo(() => [...items].sort(byName), [items]); // expensive: memoize
  return <ul>{sorted.map((i) => <li key={i.id}>{i.name}</li>)}</ul>;
}
```

If you need to reset state when a prop changes, prefer a `key` on the component over an effect that clears state.

Reference: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

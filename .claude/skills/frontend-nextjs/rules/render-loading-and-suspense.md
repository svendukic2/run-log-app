---
title: Stream with loading.tsx and Suspense
impact: HIGH
impactDescription: "instant first paint instead of a blocked route"
tags: rendering, streaming, suspense, ux
---

## Stream with loading.tsx and Suspense

When a Server Component awaits data, everything above it in the tree waits too, so one slow query can block the entire route from rendering. The App Router fixes this with streaming: a `loading.tsx` file automatically wraps a segment in a Suspense boundary and shows a fallback while the segment loads, and an explicit `<Suspense>` boundary lets you stream just the slow part while the rest of the page paints immediately. Do not `await` every data source at the top of the page; instead, render the fast shell right away and suspend only the sections that are genuinely slow. This turns a blank wait into a responsive, progressively filling page.

**Incorrect (one slow call blocks the whole route):**

```tsx
// src/app/dashboard/page.tsx
export default async function Dashboard() {
  const profile = await getProfile();      // fast
  const feed = await getActivityFeed();     // slow: blocks EVERYTHING below
  return (
    <main>
      <ProfileHeader profile={profile} />
      <ActivityFeed feed={feed} />
    </main>
  );
}
```

**Correct (paint the shell, stream the slow section):**

```tsx
// src/app/dashboard/page.tsx
import { Suspense } from 'react';

export default async function Dashboard() {
  const profile = await getProfile(); // fast: render immediately
  return (
    <main>
      <ProfileHeader profile={profile} />
      <Suspense fallback={<FeedSkeleton />}>
        <ActivityFeed /> {/* async component that fetches its own data */}
      </Suspense>
    </main>
  );
}
```

A route-level `src/app/dashboard/loading.tsx` covers the whole segment automatically; use inline `<Suspense>` when you want finer-grained, per-section fallbacks.

Reference: [Loading UI and Streaming](https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming)

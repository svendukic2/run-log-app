---
title: Understand Static vs Dynamic Rendering
impact: HIGH
impactDescription: "keep routes cacheable; opt into dynamic only when needed"
tags: rendering, caching, performance
---

## Understand Static vs Dynamic Rendering

A route is statically rendered at build time (and cached) unless something forces it to render per request. The triggers are specific: reading `cookies()` or `headers()`, awaiting `searchParams`, or fetching with `{ cache: 'no-store' }`. Touch any of them and the whole route becomes dynamic, re-rendering on every request and losing the CDN cache. This is often accidental, for example reading a cookie in a shared layout drags every child route dynamic. Decide deliberately: keep content static and use time-based `revalidate` (ISR) for freshness, and reach for dynamic APIs only where per-request data is truly required. Isolate unavoidable dynamic reads in a small segment so the rest of the route stays cacheable.

**Incorrect (a cookie read in the page forces the whole route dynamic):**

```tsx
// src/app/blog/[slug]/page.tsx
import { cookies } from 'next/headers';

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const theme = (await cookies()).get('theme')?.value; // forces dynamic
  const { slug } = await params;
  const post = await getPost(slug); // now uncached on every request
  return <Article post={post} theme={theme} />;
}
```

**Correct (static + ISR; dynamic bits isolated in a client leaf):**

```tsx
// src/app/blog/[slug]/page.tsx  -> stays static, revalidates hourly
export const revalidate = 3600;

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug); // cached, served from the CDN
  return (
    <Article post={post}>
      <ThemeToggle /> {/* reads theme on the client, no dynamic penalty */}
    </Article>
  );
}
```

Use `export const dynamic = 'force-dynamic'` (or `'force-static'`) to be explicit when the rendering mode matters and you want it documented in the file.

Reference: [Partial Prerendering and Rendering Modes](https://nextjs.org/docs/app/building-your-application/rendering/server-components#server-rendering-strategies)

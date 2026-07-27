---
title: Use next/image and Dynamic Imports
impact: HIGH
impactDescription: "smaller payloads, better LCP, less blocking JS"
tags: performance, images, code-splitting
---

## Use next/image and Dynamic Imports

Serve images through `next/image` rather than a raw `<img>`: it lazy-loads offscreen images, generates responsive `srcset`s, serves modern formats, and reserves layout space from `width`/`height` so you avoid cumulative layout shift. For heavy client-only components (rich editors, charts, maps) that are not needed for the first paint, split them out with `next/dynamic` so their code loads on demand instead of bloating the initial bundle. Eagerly importing everything and shipping full-resolution images is one of the most common causes of a slow LCP and a heavy first load.

**Incorrect (raw img + eager heavy import):**

```tsx
'use client';
import { HeavyChart } from '@/components/heavy-chart'; // ~200kb loaded up-front

export function Report({ src }: { src: string }) {
  return (
    <section>
      <img src={src} /> {/* no sizing -> layout shift, no optimization */}
      <HeavyChart />
    </section>
  );
}
```

**Correct (next/image + code-split the heavy piece):**

```tsx
'use client';
import Image from 'next/image';
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('@/components/heavy-chart'), {
  loading: () => <ChartSkeleton />,
  ssr: false, // client-only widget
});

export function Report({ src }: { src: string }) {
  return (
    <section>
      <Image src={src} alt="Quarterly revenue" width={800} height={400} />
      <HeavyChart />
    </section>
  );
}
```

Add `priority` to the one above-the-fold image (your LCP element) so Next.js preloads it instead of lazy-loading it.

Reference: [Optimizing Images with next/image](https://nextjs.org/docs/app/building-your-application/optimizing/images)

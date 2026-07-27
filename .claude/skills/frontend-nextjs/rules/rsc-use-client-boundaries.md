---
title: Push 'use client' to the Leaves
impact: CRITICAL
impactDescription: "keeps most of the tree server-rendered and JS-free"
tags: server-components, use-client, boundaries
---

## Push 'use client' to the Leaves

The `'use client'` directive marks a boundary: the component it sits on and every module it imports become part of the client bundle. Place it as low in the tree as possible so only the genuinely interactive piece ships JavaScript. A common mistake is stamping `'use client'` at the top of a page to satisfy one button, which drags the entire subtree to the client. Crucially, a Client Component can still render Server Components passed through `children` or props, so wrap the interactive leaf in a client component and keep everything around it on the server. Think "islands of interactivity in a sea of server HTML."

**Incorrect (whole page becomes a client bundle for one button):**

```tsx
'use client'; // now the entire route ships to the browser
import { useState } from 'react';

export default function ProductPage({ product }: { product: Product }) {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <ProductGallery product={product} />   {/* forced client */}
      <ProductDescription product={product} /> {/* forced client */}
      <button onClick={() => setOpen(true)}>Add to cart</button>
    </main>
  );
}
```

**Correct (isolate the interactive leaf; keep the rest on the server):**

```tsx
// src/app/products/[id]/page.tsx  (Server Component, no directive)
import { AddToCartButton } from './_components/add-to-cart-button';

export default async function ProductPage({ product }: { product: Product }) {
  return (
    <main>
      <ProductGallery product={product} />      {/* stays server-rendered */}
      <ProductDescription product={product} />  {/* stays server-rendered */}
      <AddToCartButton productId={product.id} />
    </main>
  );
}

// add-to-cart-button.tsx
('use client');
import { useState } from 'react';
export function AddToCartButton({ productId }: { productId: string }) {
  const [pending, setPending] = useState(false);
  return <button disabled={pending} onClick={() => setPending(true)}>Add to cart</button>;
}
```

When a client component needs server-rendered content inside it, pass that content as `children` rather than importing it, so it is not pulled into the client bundle.

Reference: [Composition Patterns: Server and Client Components](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns)

---
title: Use the App Router File Conventions
impact: CRITICAL
impactDescription: "predictable routing, layouts, and loading states for free"
tags: architecture, app-router, routing
---

## Use the App Router File Conventions

The App Router derives routes from the folder structure under `src/app/`, and reserved filenames unlock framework features: `page.tsx` makes a route publicly addressable, `layout.tsx` wraps a segment and its children, `loading.tsx` provides an instant Suspense fallback, and `error.tsx` catches render errors for that segment. Dynamic segments use `[id]`, and route groups `(group)` organize folders without adding a URL path. Inventing your own flat structure or dumping everything into one component throws away streaming, nested layouts, and error isolation that Next.js gives you for free. Colocate each route's files inside its segment folder so the URL and the filesystem stay in sync.

**Incorrect (flat, ad-hoc structure that ignores conventions):**

```tsx
// src/app/page.tsx does everything: header, product list, error handling
// src/pages/product-detail.tsx  <- not a route, hand-wired in a giant switch
// src/app/AllRoutes.tsx  <- custom router the framework does not know about
export default function AllRoutes({ path }: { path: string }) {
  if (path.startsWith('/products/')) return <ProductDetail />;
  return <Home />;
}
```

**Correct (folder-based routing with reserved files):**

```tsx
// src/app/layout.tsx          -> root layout (html/body, shared shell)
// src/app/page.tsx            -> "/"
// src/app/(marketing)/about/page.tsx   -> "/about" (route group, no URL segment)
// src/app/products/page.tsx           -> "/products"
// src/app/products/loading.tsx        -> instant fallback while /products loads
// src/app/products/[id]/page.tsx      -> "/products/:id"
// src/app/products/[id]/error.tsx     -> error boundary for the detail route
export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return <ProductDetail params={params} />;
}
```

Route groups also let you apply different layouts to different sections (e.g. `(marketing)` vs `(app)`) without changing any URLs.

Reference: [Next.js Routing Fundamentals](https://nextjs.org/docs/app/building-your-application/routing)

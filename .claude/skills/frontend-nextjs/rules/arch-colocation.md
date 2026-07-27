---
title: Colocate Components, Keep Routes Thin
impact: HIGH
impactDescription: "routes stay readable; components stay reusable and testable"
tags: architecture, colocation, components
---

## Colocate Components, Keep Routes Thin

A `page.tsx` should read like a table of contents: it fetches the data the route needs and composes a handful of well-named components. Business logic, markup, and event wiring belong in feature or presentational components under `src/components/` (shared) or a colocated `_components/` folder inside the route (route-specific). The underscore prefix marks a folder as private so the router never treats it as a segment. When logic piles up in `page.tsx`, the route becomes untestable, unreusable, and impossible to skim. Thin routes also make the Server/Client boundary obvious, because each extracted component declares its own rendering needs.

**Incorrect (everything crammed into the route file):**

```tsx
// src/app/dashboard/page.tsx
export default async function DashboardPage() {
  const stats = await getStats();
  const orders = await getOrders();
  return (
    <main>
      <header>{/* 40 lines of nav markup */}</header>
      <section>{/* 60 lines of chart layout and formatting */}</section>
      <section>{/* 80 lines of order table with inline filtering */}</section>
    </main>
  );
}
```

**Correct (thin route composes colocated components):**

```tsx
// src/app/dashboard/page.tsx
import { DashboardHeader } from './_components/dashboard-header';
import { StatsPanel } from './_components/stats-panel';
import { OrdersTable } from './_components/orders-table';

export default async function DashboardPage() {
  const [stats, orders] = await Promise.all([getStats(), getOrders()]);
  return (
    <main>
      <DashboardHeader />
      <StatsPanel stats={stats} />
      <OrdersTable orders={orders} />
    </main>
  );
}
```

Promote a component from `_components/` to `src/components/` only once a second route actually needs it.

Reference: [Project Organization and Colocation](https://nextjs.org/docs/app/building-your-application/routing/colocation)

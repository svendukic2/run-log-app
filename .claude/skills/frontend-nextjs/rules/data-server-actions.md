---
title: Mutate with Server Actions
impact: HIGH
impactDescription: "type-safe mutations without hand-rolled API routes"
tags: data-fetching, mutations, server-actions
---

## Mutate with Server Actions

Server Actions are `async` functions marked `'use server'` that run on the server and can be called directly from components or bound to a form's `action`. For most mutations they replace the ceremony of writing an API route, wiring a client `fetch`, serializing the body, and parsing the response, all while staying end-to-end type-safe. After a write, call `revalidatePath` or `revalidateTag` so the affected Server Components re-render with fresh data instead of showing stale cache. Keep the action file server-only and validate its input, since a Server Action is a public HTTP endpoint that any client can invoke.

**Incorrect (client fetch to a hand-rolled route just to save a todo):**

```tsx
'use client';
export function AddTodo() {
  async function onSubmit(formData: FormData) {
    await fetch('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ title: formData.get('title') }),
      headers: { 'Content-Type': 'application/json' },
    });
    window.location.reload(); // crude cache-busting
  }
  return <form action={onSubmit}><input name="title" /></form>;
}
```

**Correct (Server Action with targeted revalidation):**

```tsx
// src/app/todos/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';

export async function addTodo(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  await db.todo.create({ data: { title } });
  revalidatePath('/todos'); // re-render the list with the new item
}

// src/app/todos/page.tsx
import { addTodo } from './actions';
export default function TodosPage() {
  return <form action={addTodo}><input name="title" /><button>Add</button></form>;
}
```

For richer submit UX, wrap the action with `useActionState` on the client to surface pending state and validation errors.

Reference: [Server Actions and Mutations](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)

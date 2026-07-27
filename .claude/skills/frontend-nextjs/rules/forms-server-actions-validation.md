---
title: Handle Forms with Actions and Validated Input
impact: HIGH
impactDescription: "trustworthy input and progressive-enhancement forms"
tags: forms, server-actions, validation
---

## Handle Forms with Actions and Validated Input

Wire forms to a Server Action via `action={serverAction}` so they submit and work even before JavaScript hydrates. Never trust the incoming `FormData`: parse and validate it on the server with a schema (e.g. Zod) before touching the database, because client-side checks are only a UX nicety and are trivially bypassed. Return a structured result from the action and read it on the client with `useActionState` to render field errors and a pending state. This keeps validation authoritative on the server while still giving users immediate, accessible feedback.

**Incorrect (client-only validation; server trusts raw input):**

```tsx
'use client';
export function SignupForm() {
  async function submit(formData: FormData) {
    const email = formData.get('email') as string;
    if (!email.includes('@')) return; // client check only; server never validates
    await fetch('/api/signup', { method: 'POST', body: formData });
  }
  return <form action={submit}><input name="email" /><button>Sign up</button></form>;
}
```

**Correct (server-side schema validation + useActionState):**

```tsx
// actions.ts
'use server';
import { z } from 'zod';
const schema = z.object({ email: z.string().email() });

export async function signup(_prev: unknown, formData: FormData) {
  const parsed = schema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: 'Enter a valid email address' };
  await db.user.create({ data: parsed.data });
  return { ok: true };
}

// signup-form.tsx
('use client');
import { useActionState } from 'react';
import { signup } from './actions';
export function SignupForm() {
  const [state, action, pending] = useActionState(signup, null);
  return (
    <form action={action}>
      <input name="email" type="email" aria-invalid={!!state?.error} />
      {state?.error && <p role="alert">{state.error}</p>}
      <button disabled={pending}>Sign up</button>
    </form>
  );
}
```

Share the same schema between client and server when you want optimistic checks, but the server parse is the one that guards your data.

Reference: [Forms and Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations#forms)

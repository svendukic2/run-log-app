---
title: Type Props and Route Params Strictly
impact: HIGH
impactDescription: "compile-time safety at every component boundary"
tags: type-safety, typescript, props
---

## Type Props and Route Params Strictly

Every component boundary is a contract, so type it explicitly with an interface or type alias and never fall back to `any`, which silently disables checking for everything it touches. In Next.js 16 the dynamic `params` and `searchParams` passed to pages and layouts are Promises, so their types must be `Promise<...>` and you must `await` them before use. Typing these accurately catches missing props, misspelled fields, and wrong shapes at compile time instead of at runtime in production. Prefer generated types from the backend contract for anything that crosses the wire, rather than hand-writing a duplicate shape that can drift.

**Incorrect (any props, untyped/sync params):**

```tsx
// Page treating params as a sync object, props typed as any
export default function UserPage({ params }: any) {
  const id = params.id; // wrong: params is a Promise in Next 16
  return <Profile user={id} />;
}

function Profile(props: any) { // no contract, no autocomplete, no checks
  return <h1>{props.user.name}</h1>;
}
```

**Correct (explicit prop types; awaited, typed params):**

```tsx
interface ProfileProps {
  user: { id: string; name: string };
}

function Profile({ user }: ProfileProps) {
  return <h1>{user.name}</h1>;
}

// params and searchParams are Promises in Next 16 -> type and await them
export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser(id);
  return <Profile user={user} />;
}
```

Enable `strict` in `tsconfig.json` so `any` leaks, missing props, and unchecked nulls surface during development.

Reference: [Pages and Layouts: params and searchParams](https://nextjs.org/docs/app/api-reference/file-conventions/page)

---
title: Give Lists Stable, Unique Keys
impact: HIGH
impactDescription: "correct reconciliation; no lost state or wrong-row bugs"
tags: performance, lists, keys, react
---

## Give Lists Stable, Unique Keys

When rendering an array, give each element a `key` that is stable and unique to the underlying item, normally a domain id. React uses the key to match elements between renders; a good key lets it move, keep, or reuse DOM and component state correctly. The array index is a poor key for any list that can reorder, filter, or have items inserted or removed, because the index of an item changes even though the item did not, causing React to associate the wrong state (input values, focus, animations) with the wrong row. Index keys are acceptable only for a static list that never changes order or length.

**Incorrect (index key on a reorderable list):**

```tsx
export function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul>
      {todos.map((todo, i) => (
        <li key={i}> {/* reorder/remove -> state attaches to wrong item */}
          <input defaultValue={todo.title} />
        </li>
      ))}
    </ul>
  );
}
```

**Correct (stable domain id as the key):**

```tsx
export function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}> {/* stable identity survives reordering */}
          <input defaultValue={todo.title} />
        </li>
      ))}
    </ul>
  );
}
```

If your data has no natural id, generate one when the item is created (e.g. `crypto.randomUUID()`) rather than falling back to the index.

Reference: [Rendering Lists: Keeping list items in order with key](https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key)

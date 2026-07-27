---
title: Build Accessible UI by Default
impact: MEDIUM-HIGH
impactDescription: "keyboard and screen-reader support without retrofits"
tags: accessibility, a11y, semantics
---

## Build Accessible UI by Default

Reach for the semantic element before the generic one: a real `<button>` is focusable, fires on Enter and Space, and is announced as a button, whereas a `<div onClick>` is invisible to keyboard and screen-reader users until you re-implement all of that with `role`, `tabIndex`, and key handlers. Associate every form control with a `<label>` (via `htmlFor`/`id` or by wrapping), use headings and landmarks (`<main>`, `<nav>`) to convey structure, and give every meaningful `next/image` a descriptive `alt` (empty `alt=""` for purely decorative images). Accessible markup is cheaper to write up front than to retrofit and improves usability for everyone.

**Incorrect (div soup with click handlers, unlabeled input):**

```tsx
'use client';
export function SearchBar({ onSearch }: { onSearch: () => void }) {
  return (
    <div>
      <input placeholder="Search" /> {/* placeholder is not a label */}
      <div onClick={onSearch}>Search</div> {/* not keyboard-operable */}
    </div>
  );
}
```

**Correct (semantic, labeled, keyboard-operable):**

```tsx
'use client';
export function SearchBar({ onSearch }: { onSearch: () => void }) {
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); onSearch(); }}>
      <label htmlFor="q">Search</label>
      <input id="q" name="q" type="search" />
      <button type="submit">Search</button>
    </form>
  );
}
```

When you must build a custom widget, follow the WAI-ARIA Authoring Practices for the roles, states, and keyboard interactions it expects.

Reference: [React Accessibility](https://react.dev/reference/react-dom/components/common#accessibility-attributes)

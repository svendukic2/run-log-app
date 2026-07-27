---
title: Test Components with React Testing Library
impact: MEDIUM-HIGH
impactDescription: "tests that survive refactors and assert real behavior"
tags: testing, jest, react-testing-library
---

## Test Components with React Testing Library

Test a client component the way a user experiences it: render it, find elements by accessible role or visible text, interact with `@testing-library/user-event`, and assert on what changed on screen. Avoid reaching into component internals (state variables, instance methods, class names), because those are implementation details that change during refactors even when behavior does not, giving you brittle tests that break for the wrong reasons. Query by role/label first, mock network and external dependencies so tests stay fast and deterministic, and `await` user interactions since they are asynchronous.

**Incorrect (asserting on internal state and structure):**

```tsx
import { render } from '@testing-library/react';
import { Counter } from './counter';

test('increments', () => {
  const { container } = render(<Counter />);
  const instance: any = (container.firstChild as any)._reactInternals;
  instance.setState({ count: 1 }); // poking at internals
  expect(container.querySelector('.count-value')?.textContent).toBe('1');
});
```

**Correct (role/text queries + real user interaction):**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Counter } from './counter';

test('increments when the user clicks the button', async () => {
  const user = userEvent.setup();
  render(<Counter />);

  expect(screen.getByText('Count: 0')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /increment/i }));
  expect(screen.getByText('Count: 1')).toBeInTheDocument();
});
```

For async Server Components, test the data functions and presentational children directly, or cover the route with an end-to-end test, since RTL renders client components.

Reference: [Testing with Jest](https://nextjs.org/docs/app/building-your-application/testing/jest)

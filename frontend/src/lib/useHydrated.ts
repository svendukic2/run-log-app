import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

// False during SSR/prerender and the hydration pass, true right after.
// Lets client-only values (like "today") render without hydration mismatches.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

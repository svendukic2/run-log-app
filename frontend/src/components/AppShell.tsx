'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Brand from '@/components/Brand';
import Sidebar, { SIDEBAR_ID } from '@/components/Sidebar';

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect y="3" width="20" height="2.5" rx="1.25" fill="currentColor" />
      <rect y="8.75" width="20" height="2.5" rx="1.25" fill="currentColor" />
      <rect y="14.5" width="20" height="2.5" rx="1.25" fill="currentColor" />
    </svg>
  );
}

// Shell shared by the four routed views (RUN-13). The sidebar is rendered by
// the layout, so navigating between views only swaps `children` (AC2) and the
// navigation never remounts. Below `lg` the sidebar becomes a drawer opened
// from a dark top bar, which keeps all four views reachable on a phone.
export default function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);

  // The drawer is per-view UI state, so a navigation always leaves it closed.
  // Storing the path alongside it resets it during the same render the new view
  // arrives in, instead of after an extra effect-driven pass.
  const [nav, setNav] = useState({ isOpen: false, pathname });
  if (nav.pathname !== pathname) {
    setNav({ isOpen: false, pathname });
  }
  const isNavOpen = nav.isOpen;

  const openNav = () => setNav({ isOpen: true, pathname });

  // Dismissing the drawer by hand hands focus back to the button that opened it.
  const closeNav = () => {
    setNav((current) => ({ ...current, isOpen: false }));
    toggleRef.current?.focus();
  };

  useEffect(() => {
    if (!isNavOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setNav((current) => ({ ...current, isOpen: false }));
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);

    // Stop the page behind the drawer from scrolling under the user's finger.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isNavOpen]);

  return (
    <div className="flex flex-1 flex-col bg-canvas lg:flex-row lg:items-start">
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-ink px-4 py-3 lg:hidden">
        <Brand onDark />
        <button
          ref={toggleRef}
          type="button"
          onClick={openNav}
          aria-label="Open navigation"
          aria-controls={SIDEBAR_ID}
          aria-expanded={isNavOpen}
          className="ml-auto flex size-10 items-center justify-center rounded-[10px] text-on-dark-soft hover:bg-ink-raised hover:text-white"
        >
          <MenuIcon />
        </button>
      </header>

      <div
        aria-hidden="true"
        data-testid="nav-backdrop"
        onClick={closeNav}
        className={`fixed inset-0 z-40 bg-ink/60 transition-opacity duration-200 lg:hidden ${
          isNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <Sidebar isOpen={isNavOpen} onClose={closeNav} />

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

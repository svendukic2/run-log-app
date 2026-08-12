'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES, isActiveRoute } from '@/lib/routes';
import { accountInitials, accountShortName, useAccount } from '@/lib/account';
import { signOut } from '@/lib/session';
import useFocusTrap from '@/lib/useFocusTrap';

// Icon geometry is taken 1:1 from the Figma exports (20x20 viewBox, node 47:40);
// fills are currentColor so the active state can recolor them via CSS.
function DashboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect width="8" height="8" rx="2" fill="currentColor" />
      <rect x="11" width="8" height="8" rx="2" fill="currentColor" />
      <rect y="11" width="8" height="8" rx="2" fill="currentColor" />
      <rect x="11" y="11" width="8" height="8" rx="2" fill="currentColor" />
    </svg>
  );
}

function RunsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect y="2" width="20" height="3" rx="1.5" fill="currentColor" />
      <rect y="8.5" width="20" height="3" rx="1.5" fill="currentColor" />
      <rect y="15" width="13" height="3" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function CoachIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 0L12.687 7.31299L20 10L12.687 12.687L10 20L7.31299 12.687L0 10L7.31299 7.31299L10 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Three ranked bars, tallest in the middle: the podium the leaderboard is.
function LeaderboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect y="9" width="5" height="10" rx="1.5" fill="currentColor" />
      <rect x="7.5" y="3" width="5" height="16" rx="1.5" fill="currentColor" />
      <rect x="15" y="12" width="5" height="7" rx="1.5" fill="currentColor" />
    </svg>
  );
}

// Two runners, one behind the other: the same head-and-shoulders the
// profile footer's avatar implies, doubled.
function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="7.5" cy="5.5" r="3.5" fill="currentColor" />
      <path d="M1 18C1 14.686 3.91 12 7.5 12C11.09 12 14 14.686 14 18H1Z" fill="currentColor" />
      <path
        d="M14.5 4C16.157 4 17.5 5.343 17.5 7C17.5 8.657 16.157 10 14.5 10C13.9 10 13.34 9.824 12.87 9.52C13.57 8.79 14 7.795 14 6.7C14 5.9 13.77 5.153 13.37 4.522C13.71 4.19 14.09 4 14.5 4Z"
        fill="currentColor"
      />
      <path
        d="M15.5 11.5C17.985 11.5 20 13.75 20 16.5V18H15.7C15.63 15.9 14.7 14.02 13.26 12.74C13.93 12.02 14.66 11.5 15.5 11.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function EventsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 18V2M4 2H16.5L13.5 6L16.5 10H4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect y="4" width="20" height="3" rx="1.5" fill="currentColor" />
      <rect y="13" width="20" height="3" rx="1.5" fill="currentColor" />
      <circle cx="15.5" cy="5.5" r="3.5" fill="currentColor" />
      <circle cx="5.5" cy="14.5" r="3.5" fill="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M1 1L17 17M17 1L1 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'MENU',
    items: [
      { label: 'Dashboard', href: ROUTES.dashboard, icon: <DashboardIcon /> },
      { label: 'Runs', href: ROUTES.runs, icon: <RunsIcon /> },
    ],
  },
  {
    label: 'ASSISTANT',
    items: [{ label: 'AI Coach', href: ROUTES.coach, icon: <CoachIcon /> }],
  },
  {
    // Complete since RUN-62, which owns this section: all three community
    // pages exist now, so all three are linked, in the Figma order.
    label: 'COMMUNITY',
    items: [
      { label: 'Leaderboard', href: ROUTES.leaderboard, icon: <LeaderboardIcon /> },
      { label: 'Events', href: ROUTES.events, icon: <EventsIcon /> },
      { label: 'People', href: ROUTES.people, icon: <PeopleIcon /> },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [{ label: 'Settings', href: ROUTES.settings, icon: <SettingsIcon /> }],
  },
];

// The element id AppShell points its toggle button at with aria-controls.
export const SIDEBAR_ID = 'app-navigation';

interface SidebarProps {
  // Drawer state. Ignored from `lg` up, where the sidebar is always a column.
  isOpen: boolean;
  onClose: () => void;
}

// The dark navigation column from the Figma frames (node 47:40). Below `lg`
// the 264px column does not fit next to the content, so the same markup slides
// in as an off-canvas drawer (RUN-13, responsive addendum).
export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const account = useAccount();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // Opening the drawer moves focus into it so keyboard and screen-reader users
  // land on the navigation instead of staying behind the backdrop.
  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  // ...and keeps it there while the drawer is open (AC5). Only while `isOpen`,
  // which is only ever true below `lg`: from `lg` up this is a static column
  // and trapping in it would be nonsense.
  useFocusTrap(drawerRef, isOpen);

  return (
    <aside
      ref={drawerRef}
      id={SIDEBAR_ID}
      className={`fixed inset-y-0 left-0 z-50 flex w-[264px] max-w-[85vw] shrink-0 flex-col overflow-y-auto bg-ink px-[18px] py-[26px] transition-[transform,visibility] duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:max-w-none lg:visible lg:translate-x-0 ${
        isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
      }`}
    >
      <div className="flex items-center gap-[11px] pb-[26px] pl-[10px]">
        <div className="flex size-[38px] items-center justify-center rounded-[11px] bg-accent">
          <span className="font-display text-[20px] font-bold text-white">R</span>
        </div>
        <div className="flex flex-col gap-px">
          <span className="font-display text-[19px] font-medium tracking-[-0.19px] text-white">
            Run Log
          </span>
          <span className="text-[11.5px] text-on-dark-subtle">TRAINING TRACKER</span>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          // 36x36 drawn, 44x44 tapped (RUN-75 AC3, the RUN-64 pattern), on
          // touch only: ungated it would enlarge :hover on a mouse as well.
          className="relative ml-auto flex size-9 shrink-0 items-center justify-center rounded-[10px] text-on-dark-subtle pointer-coarse:before:absolute pointer-coarse:before:-inset-[4px] pointer-coarse:before:content-[''] hover:bg-ink-raised hover:text-white lg:hidden"
        >
          <CloseIcon />
        </button>
      </div>

      <nav aria-label="Main" className="flex w-full flex-col gap-[2px]">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="flex w-full flex-col gap-[2px]">
            <p className="pt-[14px] pb-[8px] pl-[12px] text-[11px] font-medium tracking-[0.66px] text-on-dark-faint">
              {section.label}
            </p>
            {section.items.map((item) => {
              const isActive = isActiveRoute(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center gap-[13px] rounded-[10px] px-[12px] py-[11px] ${
                    isActive
                      ? 'bg-ink-raised text-white'
                      : 'text-on-dark-subtle hover:bg-ink-raised/60 hover:text-on-dark-soft'
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="flex-1 text-[14.5px] font-medium">{item.label}</span>
                  {isActive && (
                    <svg
                      width="6"
                      height="6"
                      viewBox="0 0 6 6"
                      fill="none"
                      aria-hidden="true"
                      data-testid="active-dot"
                      className="shrink-0"
                    >
                      <circle cx="3" cy="3" r="3" fill="#EC4E36" />
                    </svg>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="min-h-[26px] flex-1" />

      {/* Identity footer (RUN-14, reading the account since RUN-59).
          useAccount is null on the server snapshot, so
          the footer appears right after hydration; rendering nothing until then
          beats guessing a placeholder identity. */}
      {account && (
        <div
          data-testid="profile-footer"
          className="flex w-full flex-col border-t border-ink-border px-[10px] pt-[14px] pb-[6px]"
        >
          <div className="flex w-full items-center gap-[11px]">
            <div
              aria-hidden="true"
              className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-ink-elevated"
            >
              <span className="text-[14px] font-semibold text-white">
                {accountInitials(account)}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate text-[13px] font-medium text-on-dark-soft">
                {accountShortName(account)}
              </span>
              <span className="truncate text-[11.5px] text-on-dark-subtle">{account.email}</span>
            </div>
          </div>
          {/* Sign out (RUN-58 AC5): clears the session and lands on Sign in
              via a full page load, which also drops every store cache. */}
          <button
            type="button"
            onClick={signOut}
            className="mt-[10px] w-full rounded-[10px] border border-ink-border px-[12px] py-[8px] text-left text-[12.5px] font-medium text-on-dark-subtle hover:bg-ink-raised hover:text-white"
          >
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}

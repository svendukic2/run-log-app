'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES, isActiveRoute } from '@/lib/routes';
import { profileInitials, profileShortName, useProfile } from '@/lib/onboarding';

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
  const profile = useProfile();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Opening the drawer moves focus into it so keyboard and screen-reader users
  // land on the navigation instead of staying behind the backdrop.
  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  return (
    <aside
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
          className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-[10px] text-on-dark-subtle hover:bg-ink-raised hover:text-white lg:hidden"
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

      {/* Profile footer (RUN-14). useProfile is null on the server snapshot, so
          the footer appears right after hydration; rendering nothing until then
          beats guessing a placeholder identity. */}
      {profile && (
        <div
          data-testid="profile-footer"
          className="flex w-full items-center gap-[11px] border-t border-ink-border px-[10px] pt-[14px] pb-[6px]"
        >
          <div
            aria-hidden="true"
            className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-ink-elevated"
          >
            <span className="text-[14px] font-semibold text-white">{profileInitials(profile)}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-[13px] font-medium text-on-dark-soft">
              {profileShortName(profile)}
            </span>
            <span className="truncate text-[11.5px] text-on-dark-subtle">{profile.email}</span>
          </div>
        </div>
      )}
    </aside>
  );
}

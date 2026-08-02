'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
      { label: 'Dashboard', href: '/dashboard', icon: <DashboardIcon /> },
      { label: 'Runs', href: '/runs', icon: <RunsIcon /> },
    ],
  },
  {
    label: 'ASSISTANT',
    items: [{ label: 'AI Coach', href: '/coach', icon: <CoachIcon /> }],
  },
  {
    label: 'ACCOUNT',
    items: [{ label: 'Settings', href: '/settings', icon: <SettingsIcon /> }],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-[264px] shrink-0 flex-col bg-ink px-[18px] py-[26px]">
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
      </div>

      <nav className="flex w-full flex-col gap-[2px]">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="flex w-full flex-col gap-[2px]">
            <p className="pt-[14px] pb-[8px] pl-[12px] text-[11px] font-medium tracking-[0.66px] text-on-dark-faint">
              {section.label}
            </p>
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
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

      <div className="flex-1" />

      <div className="flex w-full items-center gap-[11px] border-t border-ink-border px-[10px] pt-[14px] pb-[6px]">
        <div className="flex size-[36px] items-center justify-center rounded-full bg-ink-elevated">
          <span className="text-[14px] font-semibold text-white">MK</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[13px] font-medium text-on-dark-soft">Marko K.</span>
          <span className="truncate text-[11.5px] text-on-dark-subtle">marko@email.com</span>
        </div>
      </div>
    </aside>
  );
}

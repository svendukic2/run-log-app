import type { ReactNode } from 'react';
import NotificationsBell from '@/components/NotificationsBell';

interface PageHeaderProps {
  // The small grey line above the title ("Good morning, Marko" on the
  // Dashboard, "Your activity" on Runs). A node, not a string, so client-only
  // content like the time-of-day greeting (RUN-16) can slot in. It renders
  // inside a <p>, so pass phrasing content only - no block elements.
  overline: ReactNode;
  title: string;
  // Primary action, top right from `sm` up. Passed in as a slot so this stays a
  // server component and only the action itself has to run on the client.
  action?: React.ReactNode;
}

// Topbar from the Figma frames (node 48:34). The same pattern serves Dashboard
// and Runs, which differ only in copy and action. Below `sm` the action cannot
// sit next to the title without squeezing it, so the two stack and the action
// spans the full width (RUN-15, responsive addendum).
//
// The notifications bell (RUN-66) is rendered here rather than passed in,
// because it belongs on every screen with a header, not to any one page. It
// rides in the same row as the action so that stacking below `sm` costs the
// header two rows, never three.
export default function PageHeader({ overline, title, action }: PageHeaderProps) {
  return (
    <header
      data-testid="page-header"
      className="flex flex-col items-stretch gap-4 px-5 pt-6 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 lg:px-[40px] lg:pt-[32px] lg:pb-[22px]"
    >
      <div className="flex min-w-0 flex-col gap-[3px]">
        {/* min-h reserves the overline's line while client-only content (the
            greeting) waits for hydration, so the title does not jump. */}
        <p className="min-h-[1lh] text-[13px] text-tertiary">{overline}</p>
        <h1 className="font-display text-[24px] font-bold tracking-[-0.6px] text-text-primary lg:text-[30px]">
          {title}
        </h1>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3">
        {/* The action keeps its own full-width-below-`sm` behaviour, so it
            grows into whatever the bell leaves of the row. */}
        {action ? <div className="min-w-0 flex-1">{action}</div> : null}
        <NotificationsBell />
      </div>
    </header>
  );
}

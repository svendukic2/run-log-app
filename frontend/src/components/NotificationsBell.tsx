'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  describeNotification,
  formatNotificationAge,
  markAllNotificationsRead,
  markNotificationRead,
  refreshNotifications,
  useNotifications,
  type AppNotification,
} from '@/lib/notifications';
import { mutationErrorMessage } from '@/lib/session';

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 2.2c-2.4 0-4.1 1.9-4.1 4.3 0 3-.9 4-1.5 4.7-.2.2 0 .6.3.6h10.6c.3 0 .5-.4.3-.6-.6-.7-1.5-1.7-1.5-4.7 0-2.4-1.7-4.3-4.1-4.3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M7.3 14.2a1.8 1.8 0 0 0 3.4 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// One glyph per notification type (AC2), so a row is recognisable before it
// is read. Same 14px line-art vocabulary as the run row menu's icons.
function FollowerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="5.6" cy="4.5" r="2.3" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M1.4 12.1c0-2.1 1.9-3.5 4.2-3.5s4.2 1.4 4.2 3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M11.6 4.2v3.4M13.3 5.9H9.9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M1.6 11.6c1.7 0 1.7-2.6 3.4-2.6s1.7 2.6 3.4 2.6 1.7-2.6 3.4-2.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="9.4" cy="3.3" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.6 6.4h3.1l1.7-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function EventIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.4 12.4V1.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M3.4 2.5h7.3l-1.6 2.4 1.6 2.4H3.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RowIcon({ type }: { type: AppNotification['type'] }) {
  if (type === 'new-follower') return <FollowerIcon />;
  if (type === 'followed-ran') return <RunIcon />;
  return <EventIcon />;
}

// Where the open panel sits, measured from the bell the moment it opens.
// Fixed positioning, like the run row menu: the header is sticky on a phone
// and the panel must not be clipped by anything it happens to sit inside.
interface PanelPlacement {
  top: number;
  right: number;
  // Measured, not a static class (review fix): the bell sits far lower on a
  // phone, where the shell adds a sticky bar and the header stacks, so a
  // height budgeted for the desktop position runs the last rows off the
  // bottom of the screen. Scrolling closes the panel by design, which would
  // make those rows unreachable rather than merely awkward.
  maxHeight: number;
  // Measured for the same reason the offsets are, and from the same
  // clientWidth, so the panel and its anchor agree about the scrollbar.
  width: number;
}

// The gap the panel keeps from the viewport edge on a phone, where the bell
// sits close enough to the right edge that a naive offset would clip it.
const VIEWPORT_MARGIN = 12;

// The panel never grows past this, however tall the viewport is, and never
// shrinks below the floor, however little room is left: a two-row panel is
// still readable, and anything less means the layout is already broken.
const MAX_PANEL_HEIGHT = 440;
const MIN_PANEL_HEIGHT = 160;

// The designed width, narrowed to whatever a phone actually has.
const MAX_PANEL_WIDTH = 340;

// The notifications bell and its dropdown panel (RUN-66, Figma "V2 ·
// Notifications (panel)"). Rendered by PageHeader, so it is present on every
// screen with a header (AC1).
//
// It is deliberately ungated: a failed notifications read shows no indicator
// and explains itself inside the panel, because the bell is never the reason
// anyone opened the page (see lib/notifications.ts). The popup discipline is
// the run row menu's, not a second pattern: Escape, outside click and scroll
// all close it without navigating (AC5).
export default function NotificationsBell() {
  const { status, items, unreadCount } = useNotifications();
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  // Frozen when the panel opens, so every row's "2h ago" is measured against
  // one clock and no row re-renders itself out of step with its neighbours.
  const [openedAt, setOpenedAt] = useState(0);
  const [markAllError, setMarkAllError] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isOpen = placement !== null;

  const openPanel = () => {
    const rect = buttonRef.current!.getBoundingClientRect();
    // clientWidth/Height, not the window's: fixed offsets resolve against the
    // initial containing block, which excludes a classical scrollbar (the
    // run row menu's reasoning).
    const viewport = document.documentElement;
    const top = rect.bottom + 8;
    setPlacement({
      top,
      right: Math.max(VIEWPORT_MARGIN, viewport.clientWidth - rect.right),
      maxHeight: Math.min(
        MAX_PANEL_HEIGHT,
        Math.max(MIN_PANEL_HEIGHT, viewport.clientHeight - top - VIEWPORT_MARGIN),
      ),
      width: Math.min(MAX_PANEL_WIDTH, viewport.clientWidth - VIEWPORT_MARGIN * 2),
    });
    setOpenedAt(Date.now());
    setMarkAllError(null);
    // The store loaded once, on the first page of this session; the bell
    // outlives client navigations, so every opening re-reads. The rows
    // already cached stay on screen while it runs.
    refreshNotifications();
  };

  const closePanel = useCallback((refocus: boolean) => {
    setPlacement(null);
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    // Focus lands on the panel itself rather than its first row: Tab then
    // walks the rows in order, and Escape hands focus back to the bell.
    panelRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closePanel(true);
    };
    // The panel is anchored to where the bell was when it opened, so a
    // scroll or resize has already moved its anchor; closing is the honest
    // response (AC5). Scrolling the panel's OWN list is excluded: that is
    // the user reading, not the page moving under them.
    const onAnchorLost = (event: Event) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      closePanel(false);
    };

    // Tabbing past the last row would otherwise leave focus on page content
    // sitting UNDER the scrim (review fix): reachable by keyboard, unclickable
    // by mouse, with an open panel that no longer relates to anything. The run
    // row menu closes on Tab outright; this panel is a list of links, so Tab
    // must keep walking the rows and only leaving the panel closes it.
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (
        next instanceof Node &&
        (panelRef.current?.contains(next) || buttonRef.current?.contains(next))
      ) {
        return;
      }
      closePanel(false);
    };

    const panel = panelRef.current;
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onAnchorLost, { capture: true });
    window.addEventListener('resize', onAnchorLost);
    panel?.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onAnchorLost, { capture: true });
      window.removeEventListener('resize', onAnchorLost);
      panel?.removeEventListener('focusout', onFocusOut);
    };
  }, [isOpen, closePanel]);

  // AC3. Awaited, with the failure kept inline instead of a badge that
  // silently lies about having cleared.
  const onMarkAllRead = async () => {
    setIsMarkingAll(true);
    setMarkAllError(null);
    try {
      await markAllNotificationsRead();
    } catch (error) {
      setMarkAllError(mutationErrorMessage(error));
    } finally {
      setIsMarkingAll(false);
    }
  };

  const hasUnread = unreadCount > 0;

  return (
    <span>
      <button
        ref={buttonRef}
        type="button"
        aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? closePanel(true) : openPanel())}
        // The bell is drawn 40x40, under the 44px minimum touch target, so a
        // pseudo-element grows the HIT area to 44x44 without moving anything
        // on screen (the pattern RUN-64 established for the privacy toggle).
        className="relative flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-line bg-white text-secondary pointer-coarse:before:absolute pointer-coarse:before:-inset-[2px] pointer-coarse:before:content-[''] hover:bg-muted hover:text-text-primary"
      >
        <BellIcon />
        {/* AC1. The count already lives in the button's accessible name, so
            the dot is decoration. */}
        {hasUnread ? (
          <span
            aria-hidden="true"
            data-testid="notifications-unread-dot"
            className="absolute top-[7px] right-[7px] size-[8px] rounded-full border-2 border-white bg-accent"
          />
        ) : null}
      </button>

      {isOpen ? (
        <>
          {/* Invisible scrim: any click outside closes the panel and goes no
              further, so a dismissal can never land on what is underneath
              (AC5). */}
          <div
            aria-hidden="true"
            data-testid="notifications-backdrop"
            onClick={() => closePanel(false)}
            className="fixed inset-0 z-40"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            tabIndex={-1}
            style={placement}
            className="fixed z-40 flex flex-col overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_16px_40px_0_rgba(0,0,0,0.16)] outline-none"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-[16px] py-[12px]">
              <p className="text-[14px] font-semibold text-text-primary">Notifications</p>
              {hasUnread ? (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  disabled={isMarkingAll}
                  className="text-[12.5px] font-semibold text-accent hover:text-accent-pressed disabled:text-tertiary"
                >
                  Mark all as read
                </button>
              ) : null}
            </div>

            {markAllError ? (
              <p role="alert" className="px-[16px] pt-[10px] text-[12.5px] text-accent">
                {markAllError}
              </p>
            ) : null}

            {/* overscroll-contain: without it, overscrolling this list on iOS
                chains to the document, whose scroll event closes the panel
                out from under the person reading it. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {status === 'error' && items.length === 0 ? (
                // The panel owns the load failure, so the header around it
                // never breaks over a read nobody asked for.
                <div className="flex flex-col items-start gap-[8px] px-[16px] py-[20px]">
                  <p className="text-[13px] leading-[1.5] text-secondary">
                    Your notifications could not be loaded.
                  </p>
                  <button
                    type="button"
                    onClick={refreshNotifications}
                    className="text-[13px] font-semibold text-accent hover:text-accent-pressed"
                  >
                    Try again
                  </button>
                </div>
              ) : items.length === 0 ? (
                // AC4.
                <div className="flex flex-col items-start gap-[4px] px-[16px] py-[20px]">
                  <p className="text-[13.5px] font-semibold text-text-primary">
                    Nothing new right now
                  </p>
                  <p className="text-[12.5px] leading-[1.5] text-secondary">
                    Follows, runs from people you follow and event joins land here.
                  </p>
                </div>
              ) : (
                <ul>
                  {/* Newest first, as the server returns them (AC2). */}
                  {items.map((item) => {
                    const { text, href } = describeNotification(item);
                    const isUnread = item.readAt === null;
                    return (
                      <li key={item.id} className="border-b border-line-subtle last:border-b-0">
                        <Link
                          href={href}
                          onClick={() => {
                            markNotificationRead(item.id);
                            closePanel(false);
                          }}
                          className={`flex items-start gap-[10px] px-[16px] py-[11px] hover:bg-muted ${
                            isUnread ? 'bg-accent-soft/40' : ''
                          }`}
                        >
                          <span
                            className={`mt-[2px] flex size-[26px] shrink-0 items-center justify-center rounded-full ${
                              isUnread ? 'bg-accent-soft text-accent' : 'bg-muted text-tertiary'
                            }`}
                          >
                            <RowIcon type={item.type} />
                          </span>
                          <span className="flex min-w-0 flex-col gap-[2px]">
                            <span
                              className={`text-[13px] leading-[1.45] ${
                                isUnread
                                  ? 'font-semibold text-text-primary'
                                  : 'font-normal text-secondary'
                              }`}
                            >
                              {text}
                            </span>
                            <span className="text-[11.5px] text-tertiary">
                              {formatNotificationAge(item, openedAt)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </span>
  );
}

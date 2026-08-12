'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DeleteRunDialog from '@/components/DeleteRunDialog';
import RunModal from '@/components/RunModal';
import type { Run } from '@/lib/runs';

function KebabIcon() {
  return (
    <svg width="4" height="16" viewBox="0 0 4 16" fill="none" aria-hidden="true">
      <circle cx="2" cy="2" r="1.7" fill="currentColor" />
      <circle cx="2" cy="8" r="1.7" fill="currentColor" />
      <circle cx="2" cy="14" r="1.7" fill="currentColor" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M9.7 1.8a1.5 1.5 0 0 1 2.1 2.1l-7 7-2.9.8.8-2.9 7-7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M1.8 3.6h10.4M5.3 3.6V2.3a.9.9 0 0 1 .9-.9h1.6a.9.9 0 0 1 .9.9v1.3M3.2 3.6l.6 7.9a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-7.9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Where the open menu sits, measured from the kebab at the moment it opens.
// Fixed positioning keeps it out of the table's scrollbox, which would
// otherwise clip the menus of the bottom rows (the container caps at 576px).
interface MenuPlacement {
  top?: number;
  bottom?: number;
  right: number;
}

// A close estimate is enough: it only decides whether the menu drops below
// the kebab or flips above it near the bottom of the viewport.
const MENU_HEIGHT_ESTIMATE = 104;

interface RunRowMenuProps {
  run: Run;
  // The card variant passes a larger hit area: on a phone the kebab sits
  // beside a full-card link, where a missed 32px tap would navigate instead.
  sizeClassName?: string;
}

// The table's 32px kebab is under the 44px minimum touch target, and the
// table is on screen from `md` up, which includes tablet widths where the
// sidebar is still a drawer. So the default grows its HIT area with a
// pseudo-element and leaves the drawn size alone (RUN-75 AC3, the RUN-64
// pattern).
//
// Gated on pointer-coarse, and here that gate is load-bearing rather than
// tidiness: the whole table row navigates on click, so on a mouse an ungated
// 6px band around the kebab would stop being row-click territory and open
// the menu instead. A finger gets the 44px target, a mouse gets the row back.
//
// The card variant passes size-11 and needs no pseudo-element at all.
const TABLE_SIZE =
  "size-8 pointer-coarse:before:absolute pointer-coarse:before:-inset-[6px] pointer-coarse:before:content-['']";

// The kebab and the row menu it opens (RUN-29, 12 · Runs - Row menu): "Edit"
// opens the Edit run modal prefilled with that row's run (AC2); "Delete"
// opens the delete confirmation quoting that row's run (RUN-30 AC1). Clicking
// elsewhere or pressing Escape closes the menu without any action (AC4): the
// transparent backdrop swallows the click, so a dismissal on the table can
// never fall through to the row navigation underneath.
export default function RunRowMenu({ run, sizeClassName = TABLE_SIZE }: RunRowMenuProps) {
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOpen = placement !== null;

  const openMenu = () => {
    const rect = buttonRef.current!.getBoundingClientRect();
    // clientWidth/Height, not window.innerWidth/Height: fixed offsets resolve
    // against the initial containing block, which excludes a classical
    // scrollbar, while the window sizes include it - the menu would sit a
    // scrollbar's width off the kebab on Windows.
    const viewport = document.documentElement;
    const right = viewport.clientWidth - rect.right;
    // Flip above the kebab when the viewport below cannot fit the menu.
    if (viewport.clientHeight - rect.bottom < MENU_HEIGHT_ESTIMATE + 8) {
      setPlacement({ bottom: viewport.clientHeight - rect.top + 4, right });
    } else {
      setPlacement({ top: rect.bottom + 4, right });
    }
  };

  const closeMenu = useCallback((refocus: boolean) => {
    setPlacement(null);
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    // The menu is a keyboard trap-free popup: focus lands on its first item,
    // Escape and Tab hand focus straight back to the kebab. preventScroll so
    // this focus can never be the scroll that closes the menu below.
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return;
      event.preventDefault();
      closeMenu(true);
    };
    // The menu is anchored to where the kebab was when it opened, so once
    // anything scrolls or the viewport resizes the anchor is gone; closing is
    // the honest response. Capture catches the table's inner scrollbox too.
    const onAnchorLost = () => closeMenu(false);

    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onAnchorLost, { capture: true });
    window.addEventListener('resize', onAnchorLost);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onAnchorLost, { capture: true });
      window.removeEventListener('resize', onAnchorLost);
    };
  }, [isOpen, closeMenu]);

  // Arrow keys move between the two items, as the menu pattern asks; with
  // only two of them, either arrow simply means "the other one".
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + delta + items.length) % items.length]?.focus();
  };

  // Dismissing the modal hands focus back to the kebab that started the
  // journey, mirroring RunDetailView. Stable across renders: a fresh callback
  // would re-run the modal's mount effect and yank focus back to its first
  // field mid-typing.
  const closeEditModal = useCallback(() => {
    setIsEditing(false);
    buttonRef.current?.focus();
  }, []);

  // Cancelling the delete works the same way; confirming does not refocus,
  // because the row - kebab included - unmounts together with the run.
  const closeDeleteDialog = useCallback(() => {
    setIsDeleting(false);
    buttonRef.current?.focus();
  }, []);

  return (
    // In the table the whole row is clickable, so every click inside this
    // subtree - kebab, backdrop, menu items, the modal on top - must stay out
    // of the row's navigation. One stop here covers all of them: the popup
    // and modal are position-fixed but still bubble through this span.
    <span onClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Open menu for ${run.routeName}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? closeMenu(true) : openMenu())}
        className={`relative flex shrink-0 items-center justify-center rounded-[8px] text-tertiary hover:bg-muted hover:text-text-primary ${sizeClassName}`}
      >
        <KebabIcon />
      </button>

      {isOpen ? (
        <>
          {/* Invisible scrim: any click outside the menu closes it and goes
              no further (AC4). */}
          <div
            aria-hidden="true"
            data-testid="run-row-menu-backdrop"
            onClick={() => closeMenu(false)}
            className="fixed inset-0 z-40"
          />
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Actions for ${run.routeName}`}
            onKeyDown={onMenuKeyDown}
            style={placement}
            className="fixed z-40 flex w-[150px] flex-col gap-[2px] rounded-[12px] border border-line bg-white p-[6px] shadow-[0_16px_40px_0_rgba(0,0,0,0.16)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu(false);
                setIsEditing(true);
              }}
              className="flex items-center gap-[10px] rounded-[8px] px-[12px] py-[9px] text-left text-[14px] font-medium text-text-primary hover:bg-muted"
            >
              <PencilIcon />
              Edit
            </button>
            {/* Opens the delete confirmation for this row's run (RUN-30 AC1);
                nothing is removed until the dialog's "Delete run" says so. */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu(false);
                setIsDeleting(true);
              }}
              className="flex items-center gap-[10px] rounded-[8px] px-[12px] py-[9px] text-left text-[14px] font-medium text-accent hover:bg-accent-soft"
            >
              <TrashIcon />
              Delete
            </button>
          </div>
        </>
      ) : null}

      {/* Mounted only while open, so every opening prefills from the run as
          currently stored (RUN-28 AC1). */}
      {isEditing ? <RunModal run={run} onClose={closeEditModal} /> : null}

      {/* Confirming deletes the run from the store, and this row unmounts
          with it - the "All runs" count and the records recompute from the
          same announcement (RUN-30 AC2, AC4). */}
      {isDeleting ? (
        <DeleteRunDialog
          run={run}
          onClose={closeDeleteDialog}
          onDeleted={() => setIsDeleting(false)}
        />
      ) : null}
    </span>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import FollowButton from '@/components/FollowButton';
import { formatCount, initialsOf } from '@/lib/eventMath';
import { personRoute } from '@/lib/routes';
import {
  reloadUserSearch,
  setFollowingInSearch,
  useUserSearch,
  type FollowCounts,
  type FoundRunner,
  type UserSearchStatus,
} from '@/lib/userSearch';

const CARD = 'rounded-[18px] border border-line bg-white';

// How long typing has to pause before the search runs (AC1 says "when
// typing pauses", not "per keystroke"). Long enough that a name typed at
// speed costs one request, short enough that the pause is not felt.
const SEARCH_DEBOUNCE_MS = 300;

// Mirrors MAX_SEARCH_LENGTH in the backend's UserSearchQueryDto. Without
// it, pasting a paragraph into the box answers 400 and the reader gets a
// red "the search didn't run" card for what is really "no such runner"
// (review fix).
const MAX_SEARCH_LENGTH = 60;

// V2 · Community - People (RUN-62): search runners by name, follow or
// unfollow them from the row, and open a public profile by clicking the row
// itself.
//
// The searching is entirely server-side (GET /api/users?search=): this
// component holds one piece of state, the text in the box, and the store
// keyed by its debounced value holds everything else.
export default function PeopleView() {
  const [input, setInput] = useState('');
  const query = useDebouncedValue(input.trim(), SEARCH_DEBOUNCE_MS);
  const { status, items, total, counts, error } = useUserSearch(query);

  return (
    <div className="flex flex-col gap-4 px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]">
      <section className={`${CARD} flex flex-col gap-[14px] px-[18px] py-[18px] sm:px-[24px]`}>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="people-search" className="text-[13px] font-semibold text-text-primary">
            Find runners
          </label>
          <input
            id="people-search"
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search by name"
            autoComplete="off"
            maxLength={MAX_SEARCH_LENGTH}
            className="w-full rounded-[12px] border border-line px-[14px] py-[11px] text-[14px] text-text-primary placeholder:text-tertiary focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </div>

        {/* AC3's simple resting state: my own counts, which the endpoint
            serves with every answer, so they are here before anything is
            typed and stay put while a search runs (the store keeps them
            across query changes for exactly that reason). */}
        <CountsLine counts={counts} status={status} />
      </section>

      <SearchResults query={query} status={status} error={error} items={items} total={total} />
    </div>
  );
}

// My own follow counts, which belong to the account rather than to any
// query. A failed read is reported HERE rather than as a search error
// (review fix): landing on the page reads the endpoint for these counts
// alone, and a reader who has typed nothing must not be told their search
// failed. Typing a name issues the next request, which is the retry.
function CountsLine({ counts, status }: { counts: FollowCounts | null; status: UserSearchStatus }) {
  if (counts) {
    return (
      <p className="text-[13px] text-secondary">
        {formatCount(counts.followers, 'follower')} · {counts.following} following
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p role="alert" className="text-[13px] text-accent-pressed">
        Couldn&apos;t load your follow counts. Searching for a name tries again.
      </p>
    );
  }
  return <p className="text-[13px] text-tertiary">Loading your follow counts…</p>;
}

// Everything below the box. Split out so the states read as a list rather
// than as nesting inside the form.
function SearchResults({
  query,
  status,
  error,
  items,
  total,
}: {
  query: string;
  status: UserSearchStatus;
  error: string | null;
  items: FoundRunner[];
  total: number;
}) {
  // The resting state (AC3) comes FIRST, before the error branch: with no
  // query there is no search to have failed, whatever the counts read did.
  // One line of hint copy rather than a suggested list nobody asked for.
  if (query === '') {
    return (
      <p className="px-[10px] text-[13.5px] leading-[1.55] text-secondary">
        Search for a runner by name to follow them. Following someone puts their runs on your radar;
        it does not open a private profile.
      </p>
    );
  }

  if (status === 'error') {
    return (
      <section
        role="alert"
        aria-labelledby="people-error-heading"
        className={`${CARD} flex flex-col items-start gap-[10px] px-[24px] py-[22px]`}
      >
        <h2
          id="people-error-heading"
          className="font-display text-[16px] font-bold tracking-[-0.3px] text-text-primary"
        >
          The search didn&apos;t run
        </h2>
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          {error ?? 'Something went wrong with the search.'}
        </p>
        <button
          type="button"
          onClick={() => reloadUserSearch(query)}
          className="mt-[6px] rounded-[12px] bg-accent px-[22px] py-[11px] text-[14px] font-semibold text-white hover:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Try again
        </button>
      </section>
    );
  }

  if (status === 'loading') {
    return (
      <p role="status" className="px-[10px] py-[6px] text-[13.5px] text-secondary">
        Searching…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      // break-words so a long pasted query cannot push the page wider than
      // a phone screen (review fix).
      <p className="px-[10px] text-[13.5px] leading-[1.55] break-words text-secondary">
        No runners match “{query}”. Check the spelling, or try just the first name.
      </p>
    );
  }

  return (
    <section className={`${CARD} px-[10px] py-[12px] sm:px-[14px]`} aria-label="Search results">
      <ul className="flex flex-col">
        {items.map((runner) => (
          <RunnerRow key={runner.id} runner={runner} />
        ))}
      </ul>

      {total > items.length && (
        // The endpoint pages at 20; saying so beats silently truncating.
        <p className="px-[10px] pt-[10px] text-[12.5px] text-tertiary">
          Showing the first {items.length} of {total} matches. Keep typing to narrow them down.
        </p>
      )}
    </section>
  );
}

// One result row: initials avatar, name, follow action. The whole row opens
// the public profile (AC5) through a stretched link, exactly like an event
// card, so the row is one tab stop for its navigation and the button keeps
// its own - and clicking Follow never navigates, because the button sits
// above the overlay.
function RunnerRow({ runner }: { runner: FoundRunner }) {
  return (
    <li className="relative flex items-center gap-3 rounded-[12px] px-[10px] py-[10px] hover:bg-muted">
      <span
        aria-hidden="true"
        className="grid size-[38px] shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent"
      >
        {initialsOf(runner.firstName, runner.lastName)}
      </span>

      <span className="min-w-0 flex-1">
        <Link
          href={personRoute(runner.id)}
          className="block truncate text-[14px] font-semibold text-text-primary after:absolute after:inset-0 after:content-[''] hover:text-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {runner.firstName} {runner.lastName}
        </Link>
      </span>

      <FollowButton target={runner} setFollowing={setFollowingInSearch} size="row" />
    </li>
  );
}

// The debounce AC1 asks for. The timer is cleared on every change AND on
// unmount, so a pending search can never fire into a component that is
// gone.
function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

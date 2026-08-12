// The outlier marker both leaderboards draw (RUN-72 AC2). One component
// rather than two copies, because the global board and the event board must
// say the same thing in the same words: a row that differs by a syllable
// reads as two different claims.
//
// Subtle by design. This is a note that a number is unusual, never an
// accusation, so it is tertiary text at the size of the run count it sits
// beside, not a red badge. It says "unverified" because that is what is
// true: nothing in this app can verify a manually entered run, and the
// marker only points at the ones far enough out to be worth a second look.
//
// Accessibility: the word alone would leave a screen reader user with a
// label and no meaning, so the explanation is in the accessible name
// itself (via the visually hidden span, which is what an assistive
// technology reads) as well as in `title` for a pointer hover. Deliberately
// not a bare glyph.
//
// Mobile: it sits on the row's SECOND line, next to the run count, which is
// the one part of the row that has room. Inline and wrappable, so a narrow
// phone drops it to its own line instead of squeezing the name or the
// kilometres.

export const UNVERIFIED_HINT =
  'Unusually fast or long for a manually entered run, so it has not been verified.';

export default function UnverifiedMarker() {
  return (
    <span
      className="ml-[6px] inline-block rounded-[6px] bg-muted px-[6px] py-[1px] text-[11px] font-medium tracking-[0.2px] text-tertiary"
      title={UNVERIFIED_HINT}
    >
      unverified
      <span className="sr-only">. {UNVERIFIED_HINT}</span>
    </span>
  );
}

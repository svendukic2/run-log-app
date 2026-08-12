// RUN-74: the token lifecycle decision, written down once and referenced
// from everywhere else that implements a piece of it.
//
// THE CHOICE: a sliding access token plus a `tokenVersion` column on User.
// NOT a refresh-token pair with its own table.
//
// Why. The pair is the textbook answer and it buys per-session revocation:
// each device holds its own refresh row, so "sign out this laptop" leaves
// the phone alone. That is a real property and we are deliberately not
// buying it. It costs a new table, a rotation-and-reuse-detection protocol,
// a cleanup job for expired rows, and a second artifact in localStorage on
// the frontend. This is an academy project whose users have one browser
// each; the ticket asks for refresh and revoke to exist and to have decided
// semantics, not for a session manager. One additive column with a default
// gives us both, and the whole frontend change stays inside apiFetch.
//
// THE SEMANTICS, in one place:
//
//   * An access token lives ACCESS_TOKEN_TTL_SECONDS. That is the only
//     thing the global JwtAuthGuard checks, and the guard deliberately
//     still performs NO database read - the hot path is unchanged.
//   * POST /api/auth/refresh takes an access token that may already be
//     expired, and mints a fresh one. It is the only place that reads
//     User.tokenVersion, so revocation costs one query per refresh rather
//     than one per request.
//   * Refresh is refused when the presented token was issued more than
//     REFRESH_IDLE_WINDOW_SECONDS ago. That is the idle timeout: stop using
//     the app for that long and you sign in again.
//   * Refresh is refused when the SESSION began more than
//     SESSION_ABSOLUTE_MAX_SECONDS ago. The session start rides along in
//     the `sst` claim and is COPIED, never reset, by every refresh, so
//     sliding cannot outrun it. That is the ceiling. To be exact about it: a
//     refresh accepted one second before the ceiling still mints a token
//     good for its full TTL, so the true bound is the ceiling plus at most
//     one ACCESS_TOKEN_TTL_SECONDS. Not worth clamping the expiry for.
//   * POST /api/auth/logout increments User.tokenVersion. Every token
//     carrying the old `ver` is then unrefreshable, so every session on
//     every device for that account ends.
//
// WHAT THIS DOES NOT PROTECT AGAINST, stated plainly:
//
//   1. Per-session revocation. Logout is per ACCOUNT. Signing out on a
//      phone signs out the laptop too. Accepted; see above.
//   2. A stolen access token keeps working until it expires on its own,
//      because the guard does not consult tokenVersion. So logout revokes a
//      SESSION immediately but an already-issued access token only within
//      ACCESS_TOKEN_TTL_SECONDS. Closing that gap means a database read on
//      every authenticated request, which is a trade we are not making for
//      a 15 minute window. Shortening the TTL shortens the exposure; that
//      is the knob.
//   3. Anyone holding a stolen token can also slide it, exactly as the
//      legitimate user can, until the account logs out anywhere or the
//      absolute ceiling arrives. There is no per-token blocklist.
//
// EXISTING DEPLOYED SESSIONS (RUN-60 shipped this to a real host, so this
// paragraph is the one that matters most). Tokens already in real browsers
// were signed with `{ sub, email }` and a seven day expiry. They carry
// neither `ver` nor `sst`.
//   * The guard is unchanged, so they keep authenticating until their own
//     expiry. Nobody is logged out by deploying this.
//   * A MISSING `ver` CLAIM IS READ AS 0, which is exactly the default the
//     migration gives every existing row. So a legacy token refreshes
//     successfully into the new regime instead of being rejected. This is
//     the single decision that keeps the deploy from logging out every
//     real user, and it is why the migration's default must stay 0.
//   * A missing `sst` falls back to the token's own `iat`, so a legacy
//     session's ceiling is counted from when it was issued.

// Fifteen minutes. Short enough that item 2 above is a small window, long
// enough that a normal session refreshes a handful of times a day. Was
// seven days before RUN-74, when there was no way to renew.
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

// Fourteen days of not using the app and the session is over. Replaces what
// the seven day token used to mean in practice, and is generous on purpose:
// this is the number a user actually feels.
export const REFRESH_IDLE_WINDOW_SECONDS = 14 * 24 * 60 * 60;

// Thirty days from the sign-in itself, however actively the session is
// used. The ceiling that makes "sliding" bounded rather than perpetual.
export const SESSION_ABSOLUTE_MAX_SECONDS = 30 * 24 * 60 * 60;

// What we sign. `iat` and `exp` are added by the JWT library; the three
// application claims are `email` (carried since RUN-56), `ver` and `sst`.
// Everything is optional here because this interface describes a token we
// just VERIFIED, not one we just signed: a legacy token verifies fine and
// has none of the RUN-74 claims, and treating that as a parse failure would
// log out the deployed users this file exists to protect.
export interface AccessTokenClaims {
  sub?: unknown;
  email?: unknown;
  // User.tokenVersion when the token was minted. Absent on pre-RUN-74
  // tokens, and absence means 0. See the deployed-sessions note above.
  ver?: unknown;
  // Unix seconds at which the SESSION started, copied unchanged through
  // every refresh. Absent on pre-RUN-74 tokens, and absence means `iat`.
  sst?: unknown;
  iat?: unknown;
  exp?: unknown;
}

// The version a token claims, with the legacy default applied. Anything
// that is not a non-negative integer reads as 0 as well: a hand-crafted
// `ver: "banana"` must not compare equal to a real version by accident, and
// it must not crash the refresh either.
export function claimedTokenVersion(claims: AccessTokenClaims): number {
  const version = claims.ver;
  return typeof version === 'number' &&
    Number.isInteger(version) &&
    version >= 0
    ? version
    : 0;
}

// Unix seconds at which the session behind this token began. Falls back to
// the token's own issue time, which is what a pre-RUN-74 token gives us and
// is also the correct answer for a token minted by signup or login.
export function sessionStartedAt(claims: AccessTokenClaims): number | null {
  const start = typeof claims.sst === 'number' ? claims.sst : claims.iat;
  return typeof start === 'number' && Number.isFinite(start) ? start : null;
}

// The RFC 6750 bearer grammar, shared by the guard (which reads the header
// off a protected request) and the auth controller (which reads it off the
// public refresh and logout routes). One spelling of the rule, not two:
// RFC 9110 makes the scheme case-insensitive and allows any run of
// whitespace after it.
export function extractBearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match ? match[1] : null;
}

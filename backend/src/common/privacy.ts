// The account's privacy settings (RUN-64) and the pure gating helpers that
// read them. Pure and dependency-free on purpose: the rules are tested
// without a database, and both the privacy module (which serves the
// settings) and the features that honour them (the event leaderboard
// today) share one definition instead of re-deriving "is this allowed"
// per call site.
//
// Every setting is a permission GRANT, never a restriction: false means
// private, true means shared. That direction is what makes the defaults
// safe - a new column, a new account and a forgotten check all fall to
// private.

export interface PrivacySettings {
  // Whether other runners may open this account's public profile (the
  // reader is RUN-63's profile page).
  profilePublic: boolean;
  // Whether this account is ranked on leaderboards, global and per event.
  showOnLeaderboard: boolean;
  // Whether this account's route maps are shown to other runners (the
  // reader is RUN-63's profile page; route maps themselves are RUN-72).
  showRoutes: boolean;
}

// The decided defaults, written down once so a reader does not have to
// infer the policy from three @default(false) column attributes. Those
// attributes are what actually applies the defaults to a new row; this
// constant is the statement of intent the specs assert against, and the
// value RUN-70's global leaderboard and RUN-71's seeder should read
// rather than re-typing three literals.
export const PRIVACY_DEFAULTS: PrivacySettings = Object.freeze({
  profilePublic: false,
  showOnLeaderboard: false,
  showRoutes: false,
});

// Whether a runner is ranked at all. Applied to every leaderboard the same
// way (RUN-69's event one today, RUN-70's global one next): an opted-out
// runner gets no place and none of the numbers a client could rebuild one
// from.
export function appearsOnLeaderboard(
  settings: Pick<PrivacySettings, 'showOnLeaderboard'>,
): boolean {
  return settings.showOnLeaderboard;
}

// profilePublic and showRoutes deliberately have no gating helper yet:
// their only reader is RUN-63's public profile page, which does not exist
// (the /people/:id route is still a placeholder). A helper written now
// would be a guess at a call site nobody has, and an unused gate is worse
// than no gate - it reads as protection that is actually never applied.
// Storing and serving the flags is this ticket's half of that contract.

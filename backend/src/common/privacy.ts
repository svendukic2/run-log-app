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
  // readers are RUN-63's profile page and RUN-55's run detail map).
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

// The other half of the contract RUN-64 left open: RUN-63's public profile
// page is now the reader of profilePublic and showRoutes, so their gates
// exist and are applied.
//
// Both take the VIEWER's id and the profile OWNER's id, because the owner
// override is a viewer check, not a settings check: your own profile is
// always fully visible to you, whatever the toggles say. Passing ids rather
// than a boolean keeps the comparison itself in one place, so no call site
// can get "is this me" subtly wrong.

// Whether this account's body - records, weekly distance and runs - may be
// served to this viewer. False means the response OMITS them: the header and
// the follow button still render (a private profile is a normal 200, never a
// 403, which would confirm the account exists to anyone probing ids), but
// nothing below it is sent for a client to un-hide.
export function canViewProfile(
  settings: Pick<PrivacySettings, 'profilePublic'>,
  viewerId: string,
  ownerId: string,
): boolean {
  return viewerId === ownerId || settings.profilePublic;
}

// Whether this account's route maps may be shown to this viewer. Strictly
// narrower than canViewProfile: a public profile with showRoutes off serves
// its runs without their routes, so the grant is the AND of the two.
export function canViewRoutes(
  settings: Pick<PrivacySettings, 'profilePublic' | 'showRoutes'>,
  viewerId: string,
  ownerId: string,
): boolean {
  if (viewerId === ownerId) return true;
  return canViewProfile(settings, viewerId, ownerId) && settings.showRoutes;
}

// How much of a route this viewer may be sent (RUN-55 AC3/AC4). A boolean is
// no longer enough, because a granted route is not the same route: the owner
// gets the whole thing, and everybody else gets it with the ends cut off, since
// a route that starts at somebody's front door IS their address. Three-valued
// on purpose - 'trimmed' has to be a state the payload builder must handle
// rather than a flag it can leave false.
export type RouteVisibility = 'full' | 'trimmed' | 'hidden';

export function routeVisibility(
  settings: Pick<PrivacySettings, 'profilePublic' | 'showRoutes'>,
  viewerId: string,
  ownerId: string,
): RouteVisibility {
  // Your own runs are never trimmed: the trim protects you from strangers, and
  // hiding your own start from you would just be a broken map.
  if (viewerId === ownerId) return 'full';
  return canViewRoutes(settings, viewerId, ownerId) ? 'trimmed' : 'hidden';
}

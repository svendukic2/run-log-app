-- RUN-59: the User row becomes the single source of truth for a runner's
-- name and email, so the Profile row drops its copies.
--
-- Order matters. Before the columns go, carry the profile's NAMES back to
-- the User row: the v1 Settings form wrote name edits to the profile only,
-- so for any account whose owner renamed themselves there, the profile holds
-- the newer spelling while every social surface (events, follow,
-- notifications, leaderboards) has been showing the older one from User.
-- Copying makes the surviving row the one the user last chose.
UPDATE "User" AS u
SET "firstName" = p."firstName",
    "lastName" = p."lastName"
FROM "Profile" AS p
WHERE p."userId" = u."id"
  AND (u."firstName" <> p."firstName" OR u."lastName" <> p."lastName")
  -- Only the DTO ever forbade empty names, so a row written outside the API
  -- can hold ''. Copying that would blank the only names left in the system.
  AND p."firstName" <> ''
  AND p."lastName" <> '';

-- Profile.email is deliberately NOT carried over. User.email is the login
-- credential and is UNIQUE, so copying could collide with another account,
-- and the only rows where the two ever differed are v1 device-era accounts
-- (User.email = runner-<random>@device.runlog) whose password was never
-- known to their owner - RUN-58 already made those unreachable, so their
-- stored human email is inert data, not a login anyone can use.
--
-- Kept anyway, because a DROP COLUMN is the one step here that cannot be
-- undone: this table is the last place a v1 device-era account could ever be
-- reunited with a human address. It costs nothing on the fresh databases CI
-- and new clones start from, and it is the only reason this migration is
-- reversible at all. Drop it by hand once nobody needs it.
CREATE TABLE IF NOT EXISTS "profile_identity_backup" AS
SELECT "userId", "firstName", "lastName", "email" FROM "Profile";

ALTER TABLE "Profile" DROP COLUMN "firstName",
                      DROP COLUMN "lastName",
                      DROP COLUMN "email";

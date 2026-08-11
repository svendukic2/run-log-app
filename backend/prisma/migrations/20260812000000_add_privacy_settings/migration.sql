-- The remaining two privacy toggles (RUN-64). showOnLeaderboard already
-- landed in add_show_on_leaderboard, pulled forward by RUN-69, so this
-- migration is deliberately additive next to it rather than a rewrite.
--
-- Both default to FALSE for the same reason that one did: the roadmap
-- decided every privacy setting starts private, and a migration that
-- silently published existing accounts' profiles or route maps would be
-- exactly the regression that decision guards against. Existing rows
-- therefore land private, and the Settings card is the only way out of it.
ALTER TABLE "User" ADD COLUMN "profilePublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "showRoutes" BOOLEAN NOT NULL DEFAULT false;

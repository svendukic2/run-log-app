-- RUN-78 item 6: CoachPlan.sessions, a display string like "3-4", becomes the
-- two numbers the frontend plan already carries (sessionsMin, sessionsMax in
-- frontend/src/lib/plan.ts). The table has no reader and no writer in
-- backend/src - the plan is computed on the client - so this migration
-- changes no behaviour today. Its value is that the schema now describes the
-- data rather than its rendering, before anything is built on top of it.
--
-- The columns are added with a default, backfilled from whatever the string
-- held, and only then made permanent: the tolerant parse below is for a table
-- that is empty on every database anyone has, but a migration that assumes
-- "there are no rows" is a migration that corrupts the one database where
-- there are. Anything unparseable lands on 0, which reads as "unknown" and is
-- impossible to mistake for a real suggestion.
ALTER TABLE "CoachPlan" ADD COLUMN "sessionsMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CoachPlan" ADD COLUMN "sessionsMax" INTEGER NOT NULL DEFAULT 0;

-- "3-4" -> (3, 4); "3" -> (3, 3); anything else -> (0, 0).
UPDATE "CoachPlan"
SET
  "sessionsMin" = COALESCE(
    NULLIF(regexp_replace(split_part("sessions", '-', 1), '\D', '', 'g'), '')::integer,
    0
  ),
  "sessionsMax" = COALESCE(
    NULLIF(
      regexp_replace(
        CASE
          WHEN position('-' IN "sessions") > 0 THEN split_part("sessions", '-', 2)
          ELSE "sessions"
        END,
        '\D', '', 'g'
      ),
      ''
    )::integer,
    0
  );

ALTER TABLE "CoachPlan" ALTER COLUMN "sessionsMin" DROP DEFAULT;
ALTER TABLE "CoachPlan" ALTER COLUMN "sessionsMax" DROP DEFAULT;

-- DropColumn
ALTER TABLE "CoachPlan" DROP COLUMN "sessions";

-- RUN-57: every entity gains an owning user. Existing rows (created before
-- accounts existed) are adopted by a documented placeholder user instead of
-- being lost (AC4). The placeholder's bcrypt hash was generated from a
-- random 48-byte string that was immediately discarded, so no credentials
-- can ever log in as it; the .invalid TLD is reserved (RFC 2606) so the
-- email can never collide with a real signup.
-- User.email is unique too, and IsEmail accepts the .invalid TLD, so a
-- signup could have squatted the reserved address before this migration
-- runs and the INSERT would then fail on the email index (which the
-- ON CONFLICT ("id") clause does not cover). Since .invalid can never be a
-- deliverable mailbox (RFC 2606), such an account can only be a squat:
-- remove it. At this point in history no table references User yet, so the
-- delete cannot cascade into anyone's data.
DELETE FROM "User"
WHERE "email" = 'legacy-data@runlog.invalid'
  AND "id" <> 'legacy-placeholder-user';

INSERT INTO "User" ("id", "email", "passwordHash", "firstName", "lastName")
VALUES (
    'legacy-placeholder-user',
    'legacy-data@runlog.invalid',
    '$2b$12$qvlS32ivhFXt8erPIP9PHevmHV13fg2.f586B8dBCULTu3xvzZube',
    'Legacy',
    'Data'
)
ON CONFLICT ("id") DO NOTHING;

-- v1's "single row" rule for Profile and Goal was app convention only - the
-- init migration carries no unique constraint - so a database where a seed,
-- psql session or bug left extra rows would make the UNIQUE userId indexes
-- below abort the whole migration. Keep the newest row of each (cuids sort
-- roughly by creation time) and drop the rest BEFORE backfilling.
DELETE FROM "Profile"
WHERE "id" NOT IN (SELECT "id" FROM "Profile" ORDER BY "id" DESC LIMIT 1);
DELETE FROM "Goal"
WHERE "id" NOT IN (SELECT "id" FROM "Goal" ORDER BY "id" DESC LIMIT 1);

-- Each table follows the same safe sequence: add the column nullable,
-- backfill to the placeholder, then tighten to NOT NULL and add the
-- foreign key. A plain ADD COLUMN NOT NULL would fail on any database
-- that already holds rows.

-- Profile: one row per user now (was single-row in v1).
ALTER TABLE "Profile" ADD COLUMN "userId" TEXT;
UPDATE "Profile" SET "userId" = 'legacy-placeholder-user' WHERE "userId" IS NULL;
ALTER TABLE "Profile" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- Goal: one row per user now (was single-row in v1).
ALTER TABLE "Goal" ADD COLUMN "userId" TEXT;
UPDATE "Goal" SET "userId" = 'legacy-placeholder-user' WHERE "userId" IS NULL;
ALTER TABLE "Goal" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Goal_userId_key" ON "Goal"("userId");

-- WeekTarget: uniqueness widens from one row per week to one row per user
-- per week.
ALTER TABLE "WeekTarget" ADD COLUMN "userId" TEXT;
UPDATE "WeekTarget" SET "userId" = 'legacy-placeholder-user' WHERE "userId" IS NULL;
ALTER TABLE "WeekTarget" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "WeekTarget" ADD CONSTRAINT "WeekTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "WeekTarget_weekStart_key";
CREATE UNIQUE INDEX "WeekTarget_userId_weekStart_key" ON "WeekTarget"("userId", "weekStart");

-- Run: the list index becomes (userId, date) because every query is now
-- scoped to the owner first.
ALTER TABLE "Run" ADD COLUMN "userId" TEXT;
UPDATE "Run" SET "userId" = 'legacy-placeholder-user' WHERE "userId" IS NULL;
ALTER TABLE "Run" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Run" ADD CONSTRAINT "Run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "Run_date_idx";
CREATE INDEX "Run_userId_date_idx" ON "Run"("userId", "date");

-- CoachPlan: same owner-first index swap.
ALTER TABLE "CoachPlan" ADD COLUMN "userId" TEXT;
UPDATE "CoachPlan" SET "userId" = 'legacy-placeholder-user' WHERE "userId" IS NULL;
ALTER TABLE "CoachPlan" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "CoachPlan" ADD CONSTRAINT "CoachPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "CoachPlan_weekStart_idx";
CREATE INDEX "CoachPlan_userId_weekStart_idx" ON "CoachPlan"("userId", "weekStart");

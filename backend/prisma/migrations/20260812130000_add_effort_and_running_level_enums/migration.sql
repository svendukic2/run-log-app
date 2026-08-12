-- RUN-78 item 1: Run.effort and Profile.runningLevel become real database
-- enums instead of TEXT. The vocabularies were always closed (EFFORT_LEVELS,
-- RUNNING_LEVELS); only the database did not know it, which is why the read
-- path carried toEffort/toRunningLevel guards that answered 500 on a value
-- typed straight into psql. Those guards go with this migration.

-- CreateEnum
CREATE TYPE "Effort" AS ENUM ('Easy', 'Medium', 'Hard');

-- CreateEnum
CREATE TYPE "RunningLevel" AS ENUM ('Beginner', 'Intermediate', 'Advanced');

-- Normalize BEFORE the cast, and this is the load-bearing half of the file.
-- `USING "effort"::"Effort"` is all-or-nothing: one row holding anything
-- outside the vocabulary aborts the ALTER, the transaction, and with it the
-- whole deploy. There is a live database with real rows behind this (RUN-60),
-- and nothing before today stopped a hand-edited row from holding 'banana'.
--
-- So a stray value is rewritten to the same default the API already uses for
-- an omitted one rather than being allowed to fail the release. That is a
-- deliberate, and very small, loss: such a row is unreadable through the API
-- today anyway (toEffort throws a 500 on it), so the choice is between a
-- broken row becoming 'Medium' and every account losing the deploy. The
-- UPDATEs are no-ops on any database that only ever saw API writes.
UPDATE "Run" SET "effort" = 'Medium'
WHERE "effort" NOT IN ('Easy', 'Medium', 'Hard');

UPDATE "Profile" SET "runningLevel" = 'Beginner'
WHERE "runningLevel" NOT IN ('Beginner', 'Intermediate', 'Advanced');

-- AlterTable
ALTER TABLE "Run" ALTER COLUMN "effort" TYPE "Effort" USING "effort"::"Effort";

-- AlterTable
ALTER TABLE "Profile" ALTER COLUMN "runningLevel" TYPE "RunningLevel" USING "runningLevel"::"RunningLevel";

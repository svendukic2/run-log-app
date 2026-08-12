-- RUN-78 item 3: Run.createdAt, so two runs logged on the same calendar day
-- have a real order instead of the arbitrary cuid tiebreak.
--
-- DEFAULT CURRENT_TIMESTAMP is not optional here and it is not the same thing
-- Prisma would have generated. Its own output for a new required column is a
-- bare NOT NULL, which fails on any table that already holds rows - and Run
-- is the table that holds the most. The default is also permanent (unlike the
-- audit columns in the next migration, which drop theirs): the schema
-- declares @default(now()), so DEFAULT CURRENT_TIMESTAMP is the shape Prisma
-- expects to find here.
--
-- Every pre-existing row gets this migration's timestamp and therefore still
-- ties with every other pre-existing row, falling through to the id exactly
-- as before. That is not a shortcut; those rows' real insertion order was
-- never recorded and cannot be reconstructed.
ALTER TABLE "Run" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- The list query now orders by (date, createdAt, id) within one owner, so the
-- index covers that whole shape. Dropped and recreated rather than added
-- alongside: (userId, date) is a strict prefix of the new one, so keeping it
-- would mean maintaining a second index that answers nothing the first cannot.
DROP INDEX "Run_userId_date_idx";

-- CreateIndex
CREATE INDEX "Run_userId_date_createdAt_id_idx" ON "Run"("userId", "date", "createdAt", "id");

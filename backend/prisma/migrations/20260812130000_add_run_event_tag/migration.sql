-- RUN-76: a run may be tagged to one event.
--
-- Additive and nullable, with no backfill on purpose. A backfill WOULD be
-- possible - every run whose date falls in an event window whose participants
-- include its owner is exactly what the old leaderboard counted - but it would
-- be guessing intent: the whole point of this ticket is that being inside the
-- window is no longer the same statement as "this run was for the event".
-- Existing runs therefore start untagged, and existing event leaderboards read
-- empty until someone tags a run. That is the behaviour change the ticket
-- accepts, written down where it happens.
ALTER TABLE "Run" ADD COLUMN "eventId" TEXT;

-- ON DELETE SET NULL: deleting an event unties its runs and must never delete
-- them - the run is the runner's own data (see the schema comment).
ALTER TABLE "Run"
  ADD CONSTRAINT "Run_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Both event reads (the run feed and the leaderboard aggregation) filter on
-- this column alone.
CREATE INDEX "Run_eventId_idx" ON "Run"("eventId");

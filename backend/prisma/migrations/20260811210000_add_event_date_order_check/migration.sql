-- The endDate-on-or-after-startDate rule (RUN-67 AC1) is validated in the
-- service on the merged pair, but that check is check-then-act: two
-- concurrent owner PATCHes each moving one date can both validate against
-- the stale row and commit a reversed pair, which would then match BOTH the
-- upcoming and finished state filters. This CHECK makes the database the
-- final arbiter; the racy loser gets an error instead of corrupting the
-- state partition. Prisma cannot express CHECK constraints in the schema,
-- so this lives only here (noted on the model in schema.prisma).
ALTER TABLE "Event" ADD CONSTRAINT "Event_date_order_check" CHECK ("endDate" >= "startDate");

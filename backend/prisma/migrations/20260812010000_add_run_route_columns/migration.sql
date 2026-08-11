-- The optional route on a run (RUN-54): the three columns RUN-53 deliberately
-- left to this ticket, so its endpoint could ship without touching storage.
--
-- Additive and nullable end to end: every existing run keeps NULL in all
-- three, which is exactly what "this run has no route" means, so no backfill
-- exists and none is needed. Nothing reads these columns until a run is saved
-- with a route drawn.
ALTER TABLE "Run" ADD COLUMN "routePolyline" TEXT;
ALTER TABLE "Run" ADD COLUMN "routeWaypoints" JSONB;
ALTER TABLE "Run" ADD COLUMN "routeSource" TEXT;

-- All three or none. The API writes them together (runs.service.ts
-- routeColumns), but "the current writer is careful" is not an invariant -
-- a psql session, a future importer or a half-applied update would each be
-- free to leave a polyline with no waypoints, and that row is not a partial
-- route, it is an unreadable one: the picker cannot restore points it does
-- not have and the reader cannot say who drew a line with no source. Making
-- the database the arbiter turns that from a silently broken run detail into
-- a rejected write. Same technique (and same Prisma limitation - CHECK
-- constraints cannot be expressed in the schema) as
-- 20260811210000_add_event_date_order_check.
ALTER TABLE "Run" ADD CONSTRAINT "Run_route_columns_all_or_none"
  CHECK (num_nonnulls("routePolyline", "routeWaypoints", "routeSource") IN (0, 3));

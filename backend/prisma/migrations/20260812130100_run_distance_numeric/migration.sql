-- RUN-78 item 2: Run.distanceKm becomes NUMERIC(5, 2) instead of DOUBLE
-- PRECISION. A logged distance is an exact quantity a human typed to one or
-- two decimals, not a measurement, and storing it as binary floating point
-- meant 12.3 was never quite 12.3 and a week of runs summed to
-- 30.000000000000004.
--
-- Precision 5 is not a guess: RUN-72 refuses any single run over 150 km, so
-- three integer digits cover every value the API can write, with the same
-- headroom for anything already stored. Scale 2 is what the form accepts;
-- Postgres rounds a third decimal away on write, which is exactly the
-- "stored exactly at two decimals" this item asks for.
--
-- The USING clause casts through numeric and rounds, so a float that was
-- stored as 8.199999999999999 lands on 8.20 rather than being rejected for
-- scale. A row above 999.99 km would overflow and fail the migration; no such
-- row can exist through the API (the 150 km cap) and none exists in the demo
-- data, so that is left to fail loudly rather than be silently clamped -
-- clamping would invent a distance nobody ran.
ALTER TABLE "Run"
  ALTER COLUMN "distanceKm" TYPE DECIMAL(5, 2) USING ROUND("distanceKm"::numeric, 2);

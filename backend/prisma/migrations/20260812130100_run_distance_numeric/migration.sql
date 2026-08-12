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
-- A row above 999.99 km overflows the new type and aborts the cast, the
-- transaction and the deploy with it, so it is dealt with BEFORE the cast for
-- exactly the reason the enum migration normalizes a stray effort first.
--
-- Such a row can exist. The 150 km cap arrived with RUN-72, the live database
-- with RUN-60, and in between neither the form (its only distance rule was
-- "greater than 0") nor the DTO had an upper bound - so a metres-for-kilometres
-- typo, 8200 for 8.2, is exactly the mistake RUN-72 was written to catch and
-- exactly what could be sitting there. Betting the release on its absence is
-- the bet this ticket exists to stop making.
--
-- The clamp is deliberately minimal: it touches ONLY rows that cannot fit,
-- leaving every value the column can hold exactly as it was. The landing value
-- is the column ceiling rather than the 150 km cap, because 999.99 km reads as
-- obviously broken where 150 km reads as a plausible ultra, and a row that
-- looks broken is one its owner will fix. Nothing is lost that was not already
-- invalid: a run that long is one the API has refused to write or accept since
-- RUN-72, and the row stays fully editable afterwards.
UPDATE "Run" SET "distanceKm" = 999.99 WHERE "distanceKm" > 999.99;

-- The USING clause casts through numeric and rounds, so a float that was
-- stored as 8.199999999999999 lands on 8.20 rather than being rejected for
-- scale.
ALTER TABLE "Run"
  ALTER COLUMN "distanceKm" TYPE DECIMAL(5, 2) USING ROUND("distanceKm"::numeric, 2);

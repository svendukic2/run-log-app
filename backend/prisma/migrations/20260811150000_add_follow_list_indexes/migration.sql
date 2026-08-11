-- RUN-61 review fix: the list endpoints filter on one side of the edge and
-- ORDER BY (createdAt, id), but neither original index covered the sort, so
-- every page request fetched and sorted the user's entire edge set. Each
-- side gets a composite index matching the query's full shape; the plain
-- followeeId index is subsumed by its composite and dropped. The unique
-- (followerId, followeeId) pair stays: it is what makes follow idempotent.

-- DropIndex
DROP INDEX "Follow_followeeId_idx";

-- CreateIndex
CREATE INDEX "Follow_followerId_createdAt_id_idx" ON "Follow"("followerId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Follow_followeeId_createdAt_id_idx" ON "Follow"("followeeId", "createdAt", "id");

-- Promote product_serving_units from per-user to household-shared (in practice,
-- product-shared — there's no user/household column needed because the row's
-- product already implies the household via downstream queries).

-- 1. Dedupe rows that share (product_id, name) across different users — pick
--    the oldest as the canonical definition. Test data is disposable, so any
--    rule works; oldest is deterministic.
DELETE FROM "product_serving_units" WHERE "id" NOT IN (
  SELECT DISTINCT ON ("product_id", "name") "id"
  FROM "product_serving_units"
  ORDER BY "product_id", "name", "created_at" ASC
);
--> statement-breakpoint

-- 2. Swap the unique + secondary indexes from (product, user, name) to
--    (product, name).
DROP INDEX IF EXISTS "product_serving_units_product_user_name_uq";
DROP INDEX IF EXISTS "product_serving_units_product_user_idx";
CREATE UNIQUE INDEX "product_serving_units_product_name_uq"
  ON "product_serving_units" ("product_id", "name");
CREATE INDEX "product_serving_units_product_idx"
  ON "product_serving_units" ("product_id");
--> statement-breakpoint

-- 3. Drop the user column (cascades the FK to users).
ALTER TABLE "product_serving_units" DROP COLUMN "user_id";

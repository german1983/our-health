-- Model-B refactor: barcode + chain SKU codes move from Product to Presentation.
-- A Product is now the conceptual umbrella (name, brand, nutrition, category);
-- each ProductPresentation is the consumer-facing SKU.

-- 1. Add the new columns (nullable to allow backfill).
ALTER TABLE "product_presentations" ADD COLUMN "barcode" text;
CREATE UNIQUE INDEX "product_presentations_barcode_unique"
  ON "product_presentations" ("barcode")
  WHERE "barcode" IS NOT NULL;

ALTER TABLE "chain_product_codes"
  ADD COLUMN "presentation_id" uuid
  REFERENCES "product_presentations"("id") ON DELETE cascade;
--> statement-breakpoint

-- 2. Every product needs a default presentation so its barcode and any chain
--    SKU codes have somewhere to live. Synthesize a "Default" 1-unit
--    presentation for products that have none.
INSERT INTO "product_presentations" ("product_id", "name", "amount", "unit", "is_default")
SELECT p."id", 'Default', 1, 'unit', true
FROM "products" p
WHERE NOT EXISTS (
  SELECT 1 FROM "product_presentations" pp WHERE pp."product_id" = p."id"
);
--> statement-breakpoint

-- 3. For products that have presentations but none flagged default,
--    promote the oldest one.
WITH first_pres AS (
  SELECT DISTINCT ON (pp."product_id") pp."id"
  FROM "product_presentations" pp
  WHERE pp."product_id" NOT IN (
    SELECT "product_id" FROM "product_presentations" WHERE "is_default" = true
  )
  ORDER BY pp."product_id", pp."created_at"
)
UPDATE "product_presentations"
SET "is_default" = true
WHERE "id" IN (SELECT "id" FROM first_pres);
--> statement-breakpoint

-- 4. Move each product's barcode onto its default presentation.
UPDATE "product_presentations" pp
SET "barcode" = p."barcode"
FROM "products" p
WHERE pp."product_id" = p."id"
  AND pp."is_default" = true
  AND p."barcode" IS NOT NULL;
--> statement-breakpoint

-- 5. Repoint chain_product_codes at the product's default presentation.
UPDATE "chain_product_codes" cpc
SET "presentation_id" = pp."id"
FROM "product_presentations" pp
WHERE cpc."product_id" = pp."product_id"
  AND pp."is_default" = true;
--> statement-breakpoint

-- 6. Anything left without a presentation_id is an orphan chain code — drop
--    to keep the upcoming NOT NULL constraint valid.
DELETE FROM "chain_product_codes" WHERE "presentation_id" IS NULL;
--> statement-breakpoint

-- 7. Now we can drop the old columns/constraints.
DROP INDEX IF EXISTS "chain_product_codes_product_idx";
ALTER TABLE "chain_product_codes" DROP COLUMN "product_id";
ALTER TABLE "chain_product_codes" ALTER COLUMN "presentation_id" SET NOT NULL;
CREATE INDEX "chain_product_codes_presentation_idx"
  ON "chain_product_codes" ("presentation_id");

ALTER TABLE "products" DROP COLUMN "barcode";

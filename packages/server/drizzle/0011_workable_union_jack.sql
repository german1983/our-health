ALTER TABLE "product_serving_units" ALTER COLUMN "grams_equivalent" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "intake_entries" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "product_serving_units" ADD COLUMN "base_unit_equivalent" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "nutrition_base_amount" double precision DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "nutrition_base_unit" text DEFAULT 'g' NOT NULL;--> statement-breakpoint

-- Backfill: copy legacy values into the new columns. nutrition_base_unit was
-- implicitly 'g' for all existing rows.
UPDATE "products" SET "nutrition_base_amount" = "nutrition_base_grams";
--> statement-breakpoint
UPDATE "product_serving_units" SET "base_unit_equivalent" = "grams_equivalent"
WHERE "grams_equivalent" IS NOT NULL;
--> statement-breakpoint

-- storage_items.unit migrated from 'units' (legacy default) to 'unit' (the
-- COUNT-family base unit code in units.ts).
UPDATE "storage_items" SET "unit" = 'unit' WHERE "unit" = 'units';
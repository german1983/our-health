-- Three small chores in one migration.

-- 1. products.brand was the denormalized text alongside brand_id. brands.name
--    is the source of truth; drop the text column. Existing rows already have
--    brand_id populated whenever brand text was non-null (the upsert paths
--    always set both).
ALTER TABLE "products" DROP COLUMN "brand";
--> statement-breakpoint

-- 2. Multiple images per product. Introduce product_images and migrate the
--    existing image_url onto it as the primary image. Then drop the column.
CREATE TABLE "product_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "url" text NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id");
--> statement-breakpoint

INSERT INTO "product_images" ("product_id", "url", "is_primary", "sort_order")
SELECT "id", "image_url", true, 0
FROM "products"
WHERE "image_url" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "products" DROP COLUMN "image_url";
--> statement-breakpoint

-- 3. Recipes get an instructions body and a user-provided external link.
ALTER TABLE "recipes" ADD COLUMN "instructions" text;
ALTER TABLE "recipes" ADD COLUMN "external_url" text;

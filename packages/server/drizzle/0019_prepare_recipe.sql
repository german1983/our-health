-- "Prepare this recipe" feature: deducts ingredients from stock and optionally
-- saves leftovers to a storage space.

ALTER TABLE "recipes" ADD COLUMN "result_product_id" uuid;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_result_product_id_products_id_fk"
  FOREIGN KEY ("result_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "recipe_preparations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipe_id" uuid NOT NULL,
  "household_id" uuid NOT NULL,
  "prepared_by_id" uuid NOT NULL,
  "scale" double precision DEFAULT 1 NOT NULL,
  "allowed_shortage" boolean DEFAULT false NOT NULL,
  "notes" text,
  "stored_item_id" uuid,
  "prepared_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "recipe_preparations" ADD CONSTRAINT "recipe_preparations_recipe_id_recipes_id_fk"
  FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recipe_preparations" ADD CONSTRAINT "recipe_preparations_household_id_households_id_fk"
  FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recipe_preparations" ADD CONSTRAINT "recipe_preparations_prepared_by_id_users_id_fk"
  FOREIGN KEY ("prepared_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "recipe_preparations" ADD CONSTRAINT "recipe_preparations_stored_item_id_storage_items_id_fk"
  FOREIGN KEY ("stored_item_id") REFERENCES "public"."storage_items"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "recipe_preparations_recipe_idx" ON "recipe_preparations" USING btree ("recipe_id");
CREATE INDEX "recipe_preparations_household_idx" ON "recipe_preparations" USING btree ("household_id");

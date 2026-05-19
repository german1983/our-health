CREATE TABLE "chain_product_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" uuid NOT NULL,
	"code" text NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chain_product_codes" ADD CONSTRAINT "chain_product_codes_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chain_product_codes" ADD CONSTRAINT "chain_product_codes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chain_product_codes_chain_id_code_uq" ON "chain_product_codes" USING btree ("chain_id","code");--> statement-breakpoint
CREATE INDEX "chain_product_codes_product_idx" ON "chain_product_codes" USING btree ("product_id");--> statement-breakpoint

-- Backfill chain-level mappings from any existing store-level mappings
-- via the store's chain link. Store rows without a linked chain are
-- dropped on the floor (their codes weren't usable for parsing anyway).
INSERT INTO "chain_product_codes" ("chain_id", "code", "product_id")
SELECT DISTINCT "stores"."chain_id", "store_product_codes"."code", "store_product_codes"."product_id"
FROM "store_product_codes"
JOIN "stores" ON "stores"."id" = "store_product_codes"."store_id"
WHERE "stores"."chain_id" IS NOT NULL
ON CONFLICT ("chain_id", "code") DO NOTHING;

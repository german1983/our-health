CREATE TABLE "receipt_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" double precision NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipt_adjustments" ADD CONSTRAINT "receipt_adjustments_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_adjustments" ADD CONSTRAINT "receipt_adjustments_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_adjustments_receipt_idx" ON "receipt_adjustments" USING btree ("receipt_id");--> statement-breakpoint

-- Seed a default "Cashback / Rewards" income category for every existing
-- household that doesn't already have one. New households also get it via
-- createHousehold (see modules/household/service.ts).
INSERT INTO "categories" ("household_id", "name", "type", "sort_order", "icon")
SELECT h."id", 'Cashback / Rewards', 'INCOME', 100, 'gift'
FROM "households" h
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" c
  WHERE c."household_id" = h."id" AND c."name" = 'Cashback / Rewards'
);
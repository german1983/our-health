CREATE TABLE "chain_tax_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" text NOT NULL,
	"code" text NOT NULL,
	"tax_category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rate" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "tax_category_id" uuid;--> statement-breakpoint
ALTER TABLE "chain_tax_codes" ADD CONSTRAINT "chain_tax_codes_tax_category_id_tax_categories_id_fk" FOREIGN KEY ("tax_category_id") REFERENCES "public"."tax_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chain_tax_codes_chain_code_uq" ON "chain_tax_codes" USING btree ("chain","code");--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_tax_category_id_tax_categories_id_fk" FOREIGN KEY ("tax_category_id") REFERENCES "public"."tax_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Seed: common Canadian tax categories. Fixed UUIDs so chain_tax_codes
-- below can reference them deterministically.
INSERT INTO "tax_categories" ("id", "name", "rate") VALUES
  ('00000000-0000-4000-8000-000000000001', 'Tax-free',           0),
  ('00000000-0000-4000-8000-000000000002', 'HST 13% (ON)',       0.13),
  ('00000000-0000-4000-8000-000000000003', 'HST 15% (Atlantic)', 0.15),
  ('00000000-0000-4000-8000-000000000004', 'GST 5%',             0.05),
  ('00000000-0000-4000-8000-000000000005', 'GST + PST 12%',      0.12),
  ('00000000-0000-4000-8000-000000000006', 'GST + QST 14.975%',  0.14975)
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint

-- Seed: Walmart Canada (Ontario) receipt letter -> tax category. The
-- user can override any of these from the receipt detail page, and the
-- override persists in this same table for future receipts.
INSERT INTO "chain_tax_codes" ("chain", "code", "tax_category_id") VALUES
  ('WALMART', 'J', '00000000-0000-4000-8000-000000000002'),
  ('WALMART', 'H', '00000000-0000-4000-8000-000000000001'),
  ('WALMART', 'D', '00000000-0000-4000-8000-000000000001')
ON CONFLICT ("chain", "code") DO NOTHING;
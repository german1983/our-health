CREATE TABLE "chains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chains_key_unique" UNIQUE("key")
);
--> statement-breakpoint

-- Seed common Canadian grocery chains with deterministic UUIDs so other
-- statements (and future migrations) can reference them.
INSERT INTO "chains" ("id", "key", "name") VALUES
  ('00000000-0000-4000-8000-000000000101', 'WALMART',  'Walmart'),
  ('00000000-0000-4000-8000-000000000102', 'LOBLAWS',  'Loblaws'),
  ('00000000-0000-4000-8000-000000000103', 'FARM_BOY', 'Farm Boy')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

DROP INDEX "chain_tax_codes_chain_code_uq";--> statement-breakpoint
ALTER TABLE "chain_tax_codes" ALTER COLUMN "chain" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "store" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chain_tax_codes" ADD COLUMN "chain_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "chain_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "chain_id" uuid;--> statement-breakpoint
ALTER TABLE "chain_tax_codes" ADD CONSTRAINT "chain_tax_codes_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Backfill chain_id on existing rows from the legacy text columns before
-- they get dropped in the next migration.
UPDATE "chain_tax_codes" SET "chain_id" = (
  SELECT "chains"."id" FROM "chains" WHERE "chains"."key" = "chain_tax_codes"."chain"
);
--> statement-breakpoint
UPDATE "receipts" SET "chain_id" = (
  SELECT "chains"."id" FROM "chains" WHERE "chains"."key" = "receipts"."store"
);
--> statement-breakpoint

CREATE UNIQUE INDEX "chain_tax_codes_chain_id_code_uq" ON "chain_tax_codes" USING btree ("chain_id","code");

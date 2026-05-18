ALTER TABLE "chain_tax_codes" ALTER COLUMN "chain_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chain_tax_codes" DROP COLUMN "chain";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "store";
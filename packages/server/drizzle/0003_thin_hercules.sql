ALTER TABLE "receipt_items" ADD COLUMN "tax_rate" double precision;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "tax_amount" double precision;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "final_line_total" double precision;
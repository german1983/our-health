CREATE TYPE "public"."payment_method_type" AS ENUM('CASH', 'CREDIT', 'DEBIT', 'BANK', 'OTHER');--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "payment_method_type" DEFAULT 'OTHER' NOT NULL,
	"initial_balance" double precision DEFAULT 0 NOT NULL,
	"currency_code" text DEFAULT 'CAD' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "finance_category_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "payment_method_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "default_category_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "payment_method_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "receipt_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_methods_household_idx" ON "payment_methods" USING btree ("household_id");--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_finance_category_id_categories_id_fk" FOREIGN KEY ("finance_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_default_category_id_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_payment_method_idx" ON "transactions" USING btree ("payment_method_id");--> statement-breakpoint
CREATE INDEX "transactions_receipt_idx" ON "transactions" USING btree ("receipt_id");
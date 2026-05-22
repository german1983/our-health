ALTER TABLE "receipt_items" ADD COLUMN "storage_space_id" uuid;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "expiry_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "default_storage_space_id" uuid;--> statement-breakpoint
ALTER TABLE "storage_items" ADD COLUMN "receipt_item_id" uuid;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_storage_space_id_storage_spaces_id_fk" FOREIGN KEY ("storage_space_id") REFERENCES "public"."storage_spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_default_storage_space_id_storage_spaces_id_fk" FOREIGN KEY ("default_storage_space_id") REFERENCES "public"."storage_spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_items" ADD CONSTRAINT "storage_items_receipt_item_id_receipt_items_id_fk" FOREIGN KEY ("receipt_item_id") REFERENCES "public"."receipt_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_items_receipt_item_idx" ON "storage_items" USING btree ("receipt_item_id");
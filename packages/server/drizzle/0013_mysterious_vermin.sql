CREATE TABLE "product_presentations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" double precision NOT NULL,
	"unit" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipt_items" ADD COLUMN "presentation_id" uuid;--> statement-breakpoint
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_presentations_product_idx" ON "product_presentations" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_presentation_id_product_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."product_presentations"("id") ON DELETE set null ON UPDATE no action;
-- Household-shared calendar: anniversaries (repeat yearly) + one-off events.

CREATE TYPE "calendar_entry_type" AS ENUM('ANNIVERSARY', 'EVENT');
--> statement-breakpoint

CREATE TABLE "calendar_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL,
  "type" "calendar_entry_type" NOT NULL,
  "title" text NOT NULL,
  "notes" text,
  "date" timestamp with time zone NOT NULL,
  "all_day" boolean DEFAULT true NOT NULL,
  "created_by_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_household_id_households_id_fk"
  FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_created_by_id_users_id_fk"
  FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "calendar_entries_household_idx" ON "calendar_entries" USING btree ("household_id");
CREATE INDEX "calendar_entries_date_idx" ON "calendar_entries" USING btree ("date");

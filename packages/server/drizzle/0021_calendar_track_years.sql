-- Calendar refinements: timed events + opt-out of anniversary year tracking.
-- (Event time-of-day reuses the existing all_day flag + date timestamp; only
-- the new track_years column needs a migration.)

ALTER TABLE "calendar_entries" ADD COLUMN "track_years" boolean DEFAULT true NOT NULL;

-- Async receipt parsing via OpenAI Responses API (background mode).
-- We persist the OpenAI response_id and add a PROCESSING status; the client
-- polls a server route which calls OpenAI for the parsed result. This lets
-- the original POST /receipts return immediately and dodges Vercel's
-- per-function timeout, which the synchronous chat.completions call kept
-- bumping into on Hobby's 60s cap.

ALTER TYPE "receipt_status" ADD VALUE IF NOT EXISTS 'PROCESSING';
--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "openai_response_id" text;

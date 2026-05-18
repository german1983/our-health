import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

const here = path.dirname(fileURLToPath(import.meta.url));
// Pick up DATABASE_URL whether the .env lives in packages/server/ or at the repo root.
loadEnv({ path: path.resolve(here, '.env') });
loadEnv({ path: path.resolve(here, '../../.env') });

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Add it to .env (repo root or packages/server/.env) or export it before running drizzle-kit.',
  );
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});

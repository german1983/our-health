import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Walk upward from this file's directory loading any .env we find.
// dotenv won't overwrite vars already set in process.env, so the closest
// .env wins. This makes the server work whether it's started from the
// repo root or from packages/server (workspace script).
const here = path.dirname(fileURLToPath(import.meta.url));

let dir = here;
for (let i = 0; i < 6; i++) {
  const candidate = path.join(dir, '.env');
  if (fs.existsSync(candidate)) {
    loadEnv({ path: candidate });
  }
  const parent = path.dirname(dir);
  if (parent === dir) break;
  dir = parent;
}

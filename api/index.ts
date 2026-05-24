import type { IncomingMessage, ServerResponse } from 'http';

// `packages/server` is `"type": "module"`, but Vercel's @vercel/node may
// compile this file to CommonJS, in which case a static `import { default }
// from '...app.js'` becomes a `require()` of an ESM module and crashes the
// function with ERR_REQUIRE_ESM. A dynamic import works under either format.
const appPromise = import('../packages/server/src/app.js').then((m) => m.default);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await appPromise;
  return app(req, res);
}

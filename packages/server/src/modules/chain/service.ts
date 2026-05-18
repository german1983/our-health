import { asc, eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { chains } from '../../db/schema.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import type { ChainResponse, CreateChainInput, UpdateChainInput } from '@personal-budget/shared';

export async function listChains(): Promise<ChainResponse[]> {
  const rows = await db.query.chains.findMany({ orderBy: asc(chains.name) });
  return rows.map(format);
}

export async function createChain(input: CreateChainInput): Promise<ChainResponse> {
  const existing = await db.query.chains.findFirst({ where: eq(chains.key, input.key) });
  if (existing) throw new ConflictError(`Chain "${input.key}" already exists`);

  const [chain] = await db
    .insert(chains)
    .values({ key: input.key, name: input.name })
    .returning();
  return format(chain);
}

export async function updateChain(id: string, input: UpdateChainInput): Promise<ChainResponse> {
  const existing = await db.query.chains.findFirst({ where: eq(chains.id, id) });
  if (!existing) throw new NotFoundError('Chain');

  const [chain] = await db.update(chains).set(input).where(eq(chains.id, id)).returning();
  return format(chain);
}

function format(c: typeof chains.$inferSelect): ChainResponse {
  return {
    id: c.id,
    key: c.key,
    name: c.name,
    createdAt: c.createdAt.toISOString(),
  };
}

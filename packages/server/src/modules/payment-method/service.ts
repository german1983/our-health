import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { paymentMethods, transactions } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import type {
  CreatePaymentMethodInput,
  PaymentMethodResponse,
  UpdatePaymentMethodInput,
} from '@personal-budget/shared';

type Row = typeof paymentMethods.$inferSelect;

async function balanceFor(paymentMethodId: string): Promise<number> {
  // Sum signed amounts: income adds, expense subtracts.
  const [{ net }] = await db
    .select({
      net: sql<string | null>`coalesce(sum(case when ${transactions.type} = 'INCOME' then ${transactions.amount} else -${transactions.amount} end), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.paymentMethodId, paymentMethodId));
  return Number(net ?? 0);
}

async function withBalance(row: Row): Promise<PaymentMethodResponse> {
  const delta = await balanceFor(row.id);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    initialBalance: row.initialBalance,
    currentBalance: Math.round((row.initialBalance + delta) * 100) / 100,
    currencyCode: row.currencyCode,
    archived: row.archived,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function list(householdId: string): Promise<PaymentMethodResponse[]> {
  const rows = await db.query.paymentMethods.findMany({
    where: eq(paymentMethods.householdId, householdId),
  });
  // Sort archived to the bottom; primary sort by name.
  rows.sort((a, b) => (a.archived === b.archived ? a.name.localeCompare(b.name) : a.archived ? 1 : -1));
  return Promise.all(rows.map(withBalance));
}

export async function create(input: CreatePaymentMethodInput, householdId: string): Promise<PaymentMethodResponse> {
  const [row] = await db
    .insert(paymentMethods)
    .values({
      householdId,
      name: input.name,
      type: input.type,
      initialBalance: input.initialBalance,
      currencyCode: input.currencyCode,
    })
    .returning();
  return withBalance(row);
}

export async function update(
  id: string,
  input: UpdatePaymentMethodInput,
  householdId: string,
): Promise<PaymentMethodResponse> {
  const [row] = await db
    .update(paymentMethods)
    .set(input)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.householdId, householdId)))
    .returning();
  if (!row) throw new NotFoundError('Payment method');
  return withBalance(row);
}

export async function remove(id: string, householdId: string): Promise<void> {
  await db
    .delete(paymentMethods)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.householdId, householdId)));
}

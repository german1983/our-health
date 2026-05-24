import { and, eq, gte, lte, asc, desc, type SQL } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { categories, transactions } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateTransactionInput,
  UpdateTransactionInput,
  TransactionQueryInput,
  FinanceSummaryQueryInput,
  CategoryResponse,
  TransactionResponse,
  FinanceSummaryResponse,
} from '@personal-budget/shared';

// ==================== Categories ====================

export async function getCategoryTree(householdId: string): Promise<CategoryResponse[]> {
  const rows = await db.query.categories.findMany({
    where: eq(categories.householdId, householdId),
    orderBy: [asc(categories.sortOrder), asc(categories.name)],
  });

  const map = new Map<string, CategoryResponse>();
  const roots: CategoryResponse[] = [];

  for (const cat of rows) {
    map.set(cat.id, {
      id: cat.id,
      name: cat.name,
      parentId: cat.parentId,
      type: cat.type,
      level: cat.level,
      icon: cat.icon,
      sortOrder: cat.sortOrder,
      hasNutritionalFacts: cat.hasNutritionalFacts,
      children: [],
    });
  }

  for (const cat of rows) {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function createCategory(
  input: CreateCategoryInput,
  householdId: string,
): Promise<CategoryResponse> {
  let level = 0;
  if (input.parentId) {
    const parent = await db.query.categories.findFirst({
      where: and(eq(categories.id, input.parentId), eq(categories.householdId, householdId)),
    });
    if (!parent) throw new NotFoundError('Parent category');
    level = parent.level + 1;
  }

  const [category] = await db
    .insert(categories)
    .values({
      householdId,
      name: input.name,
      parentId: input.parentId,
      type: input.type,
      level,
      icon: input.icon,
      sortOrder: input.sortOrder,
      hasNutritionalFacts: input.hasNutritionalFacts ?? false,
    })
    .returning();

  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    type: category.type,
    level: category.level,
    icon: category.icon,
    sortOrder: category.sortOrder,
    hasNutritionalFacts: category.hasNutritionalFacts,
  };
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
  householdId: string,
): Promise<CategoryResponse> {
  const existing = await db.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.householdId, householdId)),
  });
  if (!existing) throw new NotFoundError('Category');

  let level = existing.level;
  if (input.parentId !== undefined) {
    if (input.parentId === null) {
      level = 0;
    } else {
      const parent = await db.query.categories.findFirst({
        where: and(eq(categories.id, input.parentId), eq(categories.householdId, householdId)),
      });
      if (!parent) throw new NotFoundError('Parent category');
      level = parent.level + 1;
    }
  }

  const [category] = await db
    .update(categories)
    .set({ ...input, level })
    .where(eq(categories.id, id))
    .returning();

  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    type: category.type,
    level: category.level,
    icon: category.icon,
    sortOrder: category.sortOrder,
    hasNutritionalFacts: category.hasNutritionalFacts,
  };
}

export async function deleteCategory(id: string, householdId: string): Promise<void> {
  const category = await db.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.householdId, householdId)),
  });
  if (!category) throw new NotFoundError('Category');

  await db.transaction(async (tx) => {
    await tx
      .update(categories)
      .set({ parentId: category.parentId, level: category.level })
      .where(eq(categories.parentId, id));
    await tx.delete(categories).where(eq(categories.id, id));
  });
}

// ==================== Transactions ====================

export async function getTransactions(householdId: string, query: TransactionQueryInput) {
  const filters: SQL[] = [eq(transactions.householdId, householdId)];
  if (query.type) filters.push(eq(transactions.type, query.type));
  if (query.categoryId) filters.push(eq(transactions.categoryId, query.categoryId));
  if (query.from) filters.push(gte(transactions.date, new Date(query.from)));
  if (query.to) filters.push(lte(transactions.date, new Date(query.to)));

  const where = and(...filters);

  const [items, total] = await Promise.all([
    db.query.transactions.findMany({
      where,
      with: { category: true, createdBy: true },
      orderBy: desc(transactions.date),
      offset: (query.page - 1) * query.limit,
      limit: query.limit,
    }),
    db.$count(transactions, where),
  ]);

  return {
    items: items.map(formatTransaction),
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.ceil(total / query.limit),
  };
}

export async function createTransaction(
  input: CreateTransactionInput,
  householdId: string,
  userId: string,
): Promise<TransactionResponse> {
  const [inserted] = await db
    .insert(transactions)
    .values({
      householdId,
      categoryId: input.categoryId,
      amount: input.amount,
      currencyCode: input.currencyCode,
      type: input.type,
      description: input.description,
      date: new Date(input.date),
      createdById: userId,
    })
    .returning({ id: transactions.id });

  const transaction = await db.query.transactions.findFirst({
    where: eq(transactions.id, inserted.id),
    with: { category: true, createdBy: true },
  });
  return formatTransaction(transaction!);
}

export async function updateTransaction(
  id: string,
  input: UpdateTransactionInput,
  householdId: string,
): Promise<TransactionResponse> {
  const existing = await db.query.transactions.findFirst({
    where: and(eq(transactions.id, id), eq(transactions.householdId, householdId)),
  });
  if (!existing) throw new NotFoundError('Transaction');

  await db
    .update(transactions)
    .set({
      ...input,
      date: input.date ? new Date(input.date) : undefined,
    })
    .where(eq(transactions.id, id));

  const transaction = await db.query.transactions.findFirst({
    where: eq(transactions.id, id),
    with: { category: true, createdBy: true },
  });
  return formatTransaction(transaction!);
}

export async function deleteTransaction(id: string, householdId: string): Promise<void> {
  const existing = await db.query.transactions.findFirst({
    where: and(eq(transactions.id, id), eq(transactions.householdId, householdId)),
  });
  if (!existing) throw new NotFoundError('Transaction');
  await db.delete(transactions).where(eq(transactions.id, id));
}

export async function getFinanceSummary(
  householdId: string,
  query: FinanceSummaryQueryInput,
): Promise<FinanceSummaryResponse[]> {
  const from = new Date(query.from);
  const to = new Date(query.to);

  const rows = await db.query.transactions.findMany({
    where: and(
      eq(transactions.householdId, householdId),
      gte(transactions.date, from),
      lte(transactions.date, to),
    ),
    with: { category: true },
    orderBy: asc(transactions.date),
  });

  const groups = new Map<string, typeof rows>();
  for (const t of rows) {
    const key = getPeriodKey(t.date, query.groupBy);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const summaries: FinanceSummaryResponse[] = [];
  for (const [period, txns] of groups) {
    const totalIncome = txns.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
    const totalExpenses = txns.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);

    const byCategoryMap = new Map<string, { name: string; type: 'INCOME' | 'EXPENSE'; total: number }>();
    for (const t of txns) {
      const ex = byCategoryMap.get(t.categoryId);
      if (ex) ex.total += t.amount;
      else byCategoryMap.set(t.categoryId, { name: t.category.name, type: t.category.type, total: t.amount });
    }

    summaries.push({
      period,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      net: Math.round((totalIncome - totalExpenses) * 100) / 100,
      currencyCode: query.currencyCode || 'USD',
      byCategory: Array.from(byCategoryMap.entries()).map(([categoryId, data]) => ({
        categoryId,
        categoryName: data.name,
        type: data.type,
        total: Math.round(data.total * 100) / 100,
      })),
    });
  }

  return summaries;
}

function getPeriodKey(date: Date, groupBy: string): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  switch (groupBy) {
    case 'day':
      return `${y}-${m}-${d}`;
    case 'week': {
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      return `${weekStart.getFullYear()}-W${String(Math.ceil(weekStart.getDate() / 7)).padStart(2, '0')}`;
    }
    case 'month':
      return `${y}-${m}`;
    case 'year':
      return `${y}`;
    default:
      return `${y}-${m}`;
  }
}

function formatTransaction(t: {
  id: string;
  categoryId: string;
  category: { name: string };
  amount: number;
  currencyCode: string;
  type: 'INCOME' | 'EXPENSE';
  description: string | null;
  date: Date;
  createdById: string;
  createdBy: { name: string };
  createdAt: Date;
}): TransactionResponse {
  return {
    id: t.id,
    categoryId: t.categoryId,
    categoryName: t.category.name,
    amount: t.amount,
    currencyCode: t.currencyCode,
    type: t.type,
    description: t.description,
    date: t.date.toISOString(),
    createdBy: t.createdBy.name,
    createdAt: t.createdAt.toISOString(),
  };
}

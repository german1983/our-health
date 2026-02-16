import { prisma } from '../../lib/prisma.js';
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
  const categories = await prisma.category.findMany({
    where: { householdId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  // Build tree from flat list
  const map = new Map<string, CategoryResponse>();
  const roots: CategoryResponse[] = [];

  for (const cat of categories) {
    map.set(cat.id, {
      id: cat.id,
      name: cat.name,
      parentId: cat.parentId,
      type: cat.type,
      level: cat.level,
      icon: cat.icon,
      sortOrder: cat.sortOrder,
      children: [],
    });
  }

  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function createCategory(input: CreateCategoryInput, householdId: string): Promise<CategoryResponse> {
  let level = 0;
  if (input.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: input.parentId, householdId },
    });
    if (!parent) throw new NotFoundError('Parent category');
    level = parent.level + 1;
  }

  const category = await prisma.category.create({
    data: {
      householdId,
      name: input.name,
      parentId: input.parentId,
      type: input.type,
      level,
      icon: input.icon,
      sortOrder: input.sortOrder,
    },
  });

  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    type: category.type,
    level: category.level,
    icon: category.icon,
    sortOrder: category.sortOrder,
  };
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
  householdId: string,
): Promise<CategoryResponse> {
  const existing = await prisma.category.findFirst({ where: { id, householdId } });
  if (!existing) throw new NotFoundError('Category');

  let level = existing.level;
  if (input.parentId !== undefined) {
    if (input.parentId === null) {
      level = 0;
    } else {
      const parent = await prisma.category.findFirst({
        where: { id: input.parentId, householdId },
      });
      if (!parent) throw new NotFoundError('Parent category');
      level = parent.level + 1;
    }
  }

  const category = await prisma.category.update({
    where: { id },
    data: { ...input, level },
  });

  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    type: category.type,
    level: category.level,
    icon: category.icon,
    sortOrder: category.sortOrder,
  };
}

export async function deleteCategory(id: string, householdId: string): Promise<void> {
  const category = await prisma.category.findFirst({ where: { id, householdId } });
  if (!category) throw new NotFoundError('Category');

  // Re-parent children to this category's parent
  await prisma.category.updateMany({
    where: { parentId: id },
    data: { parentId: category.parentId, level: category.level },
  });

  await prisma.category.delete({ where: { id } });
}

// ==================== Transactions ====================

export async function getTransactions(householdId: string, query: TransactionQueryInput) {
  const where: Record<string, unknown> = { householdId };
  if (query.type) where.type = query.type;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.from || query.to) {
    where.date = {};
    if (query.from) (where.date as Record<string, unknown>).gte = new Date(query.from);
    if (query.to) (where.date as Record<string, unknown>).lte = new Date(query.to);
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: true, createdBy: true },
      orderBy: { date: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    items: transactions.map(formatTransaction),
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
  const transaction = await prisma.transaction.create({
    data: {
      householdId,
      categoryId: input.categoryId,
      amount: input.amount,
      currencyCode: input.currencyCode,
      type: input.type,
      description: input.description,
      date: new Date(input.date),
      createdById: userId,
    },
    include: { category: true, createdBy: true },
  });

  return formatTransaction(transaction);
}

export async function updateTransaction(
  id: string,
  input: UpdateTransactionInput,
  householdId: string,
): Promise<TransactionResponse> {
  const existing = await prisma.transaction.findFirst({ where: { id, householdId } });
  if (!existing) throw new NotFoundError('Transaction');

  const transaction = await prisma.transaction.update({
    where: { id },
    data: {
      ...input,
      date: input.date ? new Date(input.date) : undefined,
    },
    include: { category: true, createdBy: true },
  });

  return formatTransaction(transaction);
}

export async function deleteTransaction(id: string, householdId: string): Promise<void> {
  const existing = await prisma.transaction.findFirst({ where: { id, householdId } });
  if (!existing) throw new NotFoundError('Transaction');
  await prisma.transaction.delete({ where: { id } });
}

export async function getFinanceSummary(
  householdId: string,
  query: FinanceSummaryQueryInput,
): Promise<FinanceSummaryResponse[]> {
  const from = new Date(query.from);
  const to = new Date(query.to);

  const transactions = await prisma.transaction.findMany({
    where: {
      householdId,
      date: { gte: from, lte: to },
    },
    include: { category: true },
    orderBy: { date: 'asc' },
  });

  // Group by period
  const groups = new Map<string, typeof transactions>();
  for (const t of transactions) {
    const key = getPeriodKey(t.date, query.groupBy);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const summaries: FinanceSummaryResponse[] = [];
  for (const [period, txns] of groups) {
    const totalIncome = txns.filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = txns.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0);

    // Aggregate by category
    const byCategoryMap = new Map<string, { name: string; type: string; total: number }>();
    for (const t of txns) {
      const existing = byCategoryMap.get(t.categoryId);
      if (existing) {
        existing.total += t.amount;
      } else {
        byCategoryMap.set(t.categoryId, {
          name: t.category.name,
          type: t.category.type,
          total: t.amount,
        });
      }
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
        type: data.type as 'INCOME' | 'EXPENSE',
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
      return `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate()) / 7)).padStart(2, '0')}`;
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
  type: string;
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
    type: t.type as 'INCOME' | 'EXPENSE',
    description: t.description,
    date: t.date.toISOString(),
    createdBy: t.createdBy.name,
    createdAt: t.createdAt.toISOString(),
  };
}

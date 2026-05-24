import { z } from 'zod';

export const categoryTypeEnum = z.enum(['INCOME', 'EXPENSE']);
export const transactionTypeEnum = z.enum(['INCOME', 'EXPENSE']);

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100),
  parentId: z.string().uuid().optional(),
  type: categoryTypeEnum,
  icon: z.string().max(50).optional(),
  sortOrder: z.number().int().min(0).default(0),
  hasNutritionalFacts: z.boolean().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
  icon: z.string().max(50).optional(),
  sortOrder: z.number().int().min(0).optional(),
  hasNutritionalFacts: z.boolean().optional(),
  /**
   * When true alongside `hasNutritionalFacts`, the new value is applied
   * to every descendant of this category. Not persisted; one-shot action.
   */
  cascadeHasNutritionalFacts: z.boolean().optional(),
});

export const createTransactionSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.number().positive('Amount must be positive'),
  currencyCode: z.string().length(3),
  type: transactionTypeEnum,
  description: z.string().max(500).optional(),
  date: z.string(),
});

export const updateTransactionSchema = createTransactionSchema.partial();

export const transactionQuerySchema = z.object({
  type: transactionTypeEnum.optional(),
  categoryId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const financeSummaryQuerySchema = z.object({
  from: z.string(),
  to: z.string(),
  groupBy: z.enum(['day', 'week', 'month', 'year']).default('month'),
  currencyCode: z.string().length(3).optional(),
});

export type CategoryType = z.infer<typeof categoryTypeEnum>;
export type TransactionType = z.infer<typeof transactionTypeEnum>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionQueryInput = z.infer<typeof transactionQuerySchema>;
export type FinanceSummaryQueryInput = z.infer<typeof financeSummaryQuerySchema>;

export interface CategoryResponse {
  id: string;
  name: string;
  parentId: string | null;
  type: CategoryType;
  level: number;
  icon: string | null;
  sortOrder: number;
  hasNutritionalFacts: boolean;
  children?: CategoryResponse[];
}

export interface TransactionResponse {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  currencyCode: string;
  type: TransactionType;
  description: string | null;
  date: string;
  createdBy: string;
  createdAt: string;
}

export interface FinanceSummaryResponse {
  period: string;
  totalIncome: number;
  totalExpenses: number;
  net: number;
  currencyCode: string;
  byCategory: {
    categoryId: string;
    categoryName: string;
    type: CategoryType;
    total: number;
  }[];
}

import { z } from 'zod';

export const paymentMethodTypeEnum = z.enum(['CASH', 'CREDIT', 'DEBIT', 'BANK', 'OTHER']);
export type PaymentMethodType = z.infer<typeof paymentMethodTypeEnum>;

export const createPaymentMethodSchema = z.object({
  name: z.string().min(1).max(100),
  type: paymentMethodTypeEnum.default('OTHER'),
  initialBalance: z.number().default(0),
  currencyCode: z.string().length(3).default('CAD'),
});
export type CreatePaymentMethodInput = z.infer<typeof createPaymentMethodSchema>;

export const updatePaymentMethodSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    type: paymentMethodTypeEnum.optional(),
    initialBalance: z.number().optional(),
    currencyCode: z.string().length(3).optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>;

export interface PaymentMethodResponse {
  id: string;
  name: string;
  type: PaymentMethodType;
  initialBalance: number;
  /** initialBalance + net of all linked transactions (income - expense). */
  currentBalance: number;
  currencyCode: string;
  archived: boolean;
  createdAt: string;
}

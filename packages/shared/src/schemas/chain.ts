import { z } from 'zod';

// Chain key: short uppercase identifier used by the receipt parser
// (WALMART, LOBLAWS, FARM_BOY...). Stored case-sensitive; we normalize
// to upper + underscore for new entries.
const chainKeyRegex = /^[A-Z][A-Z0-9_]{1,31}$/;

export const createChainSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(32)
    .regex(chainKeyRegex, 'Chain key must be uppercase letters, digits, and underscores (e.g. METRO)'),
  name: z.string().min(1).max(100),
});
export type CreateChainInput = z.infer<typeof createChainSchema>;

export const updateChainSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});
export type UpdateChainInput = z.infer<typeof updateChainSchema>;

export interface ChainResponse {
  id: string;
  key: string;
  name: string;
  createdAt: string;
}

import { z } from 'zod';

export const createHouseholdSchema = z.object({
  name: z.string().min(1, 'Household name is required').max(100),
  defaultCurrency: z.string().length(3, 'Currency code must be 3 characters').default('USD'),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const joinHouseholdSchema = z.object({
  code: z.string().min(1, 'Invite code is required'),
});

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type JoinHouseholdInput = z.infer<typeof joinHouseholdSchema>;

export type HouseholdRole = 'OWNER' | 'MEMBER';

export interface HouseholdResponse {
  id: string;
  name: string;
  defaultCurrency: string;
  createdAt: string;
}

export interface HouseholdMemberResponse {
  userId: string;
  userName: string;
  userEmail: string;
  role: HouseholdRole;
  joinedAt: string;
}

export interface HouseholdDetailResponse extends HouseholdResponse {
  members: HouseholdMemberResponse[];
}

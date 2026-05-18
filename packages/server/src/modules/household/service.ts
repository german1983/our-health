import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { households, householdMembers, householdCurrencies } from '../../db/schema.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../lib/errors.js';
import type { CreateHouseholdInput, HouseholdDetailResponse, HouseholdMemberResponse } from '@personal-budget/shared';

export async function createHousehold(input: CreateHouseholdInput, userId: string) {
  const household = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(households)
      .values({
        name: input.name,
        defaultCurrency: input.defaultCurrency,
        createdById: userId,
      })
      .returning();

    await tx.insert(householdMembers).values({
      householdId: created.id,
      userId,
      role: 'OWNER',
      acceptedAt: new Date(),
    });

    await tx.insert(householdCurrencies).values({
      householdId: created.id,
      currencyCode: input.defaultCurrency,
      isDefault: true,
    });

    return created;
  });

  return {
    id: household.id,
    name: household.name,
    defaultCurrency: household.defaultCurrency,
    createdAt: household.createdAt.toISOString(),
  };
}

export async function getHousehold(householdId: string): Promise<HouseholdDetailResponse> {
  const household = await db.query.households.findFirst({
    where: eq(households.id, householdId),
    with: {
      members: {
        where: (m, { isNotNull }) => isNotNull(m.acceptedAt),
        with: { user: true },
      },
    },
  });

  if (!household) throw new NotFoundError('Household');

  return {
    id: household.id,
    name: household.name,
    defaultCurrency: household.defaultCurrency,
    createdAt: household.createdAt.toISOString(),
    members: household.members.map((m) => ({
      userId: m.userId,
      userName: m.user.name,
      userEmail: m.user.email,
      role: m.role,
      joinedAt: (m.acceptedAt ?? m.invitedAt).toISOString(),
    })),
  };
}

export async function getInviteCode(householdId: string, userId: string): Promise<string> {
  const membership = await db.query.householdMembers.findFirst({
    where: and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)),
  });
  if (!membership || membership.role !== 'OWNER') {
    throw new ForbiddenError('Only owners can generate invite codes');
  }

  const household = await db.query.households.findFirst({ where: eq(households.id, householdId) });
  return household!.inviteCode;
}

export async function joinHousehold(code: string, userId: string) {
  const household = await db.query.households.findFirst({ where: eq(households.inviteCode, code) });
  if (!household) throw new NotFoundError('Invalid invite code');

  const existing = await db.query.householdMembers.findFirst({
    where: and(eq(householdMembers.householdId, household.id), eq(householdMembers.userId, userId)),
  });
  if (existing) throw new ConflictError('Already a member of this household');

  await db.insert(householdMembers).values({
    householdId: household.id,
    userId,
    role: 'MEMBER',
    acceptedAt: new Date(),
  });

  return {
    id: household.id,
    name: household.name,
    defaultCurrency: household.defaultCurrency,
    createdAt: household.createdAt.toISOString(),
  };
}

export async function getMembers(householdId: string): Promise<HouseholdMemberResponse[]> {
  const members = await db.query.householdMembers.findMany({
    where: and(
      eq(householdMembers.householdId, householdId),
      isNotNull(householdMembers.acceptedAt),
    ),
    with: { user: true },
  });

  return members.map((m) => ({
    userId: m.userId,
    userName: m.user.name,
    userEmail: m.user.email,
    role: m.role,
    joinedAt: (m.acceptedAt ?? m.invitedAt).toISOString(),
  }));
}

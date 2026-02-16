import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../lib/errors.js';
import type { CreateHouseholdInput, HouseholdDetailResponse, HouseholdMemberResponse } from '@personal-budget/shared';

export async function createHousehold(input: CreateHouseholdInput, userId: string) {
  const household = await prisma.household.create({
    data: {
      name: input.name,
      defaultCurrency: input.defaultCurrency,
      createdById: userId,
      members: {
        create: {
          userId,
          role: 'OWNER',
          acceptedAt: new Date(),
        },
      },
      householdCurrencies: {
        create: {
          currencyCode: input.defaultCurrency,
          isDefault: true,
        },
      },
    },
  });

  return {
    id: household.id,
    name: household.name,
    defaultCurrency: household.defaultCurrency,
    createdAt: household.createdAt.toISOString(),
  };
}

export async function getHousehold(householdId: string): Promise<HouseholdDetailResponse> {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    include: {
      members: {
        include: { user: true },
        where: { acceptedAt: { not: null } },
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
  const membership = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
  });

  if (!membership || membership.role !== 'OWNER') {
    throw new ForbiddenError('Only owners can generate invite codes');
  }

  const household = await prisma.household.findUnique({ where: { id: householdId } });
  return household!.inviteCode;
}

export async function joinHousehold(code: string, userId: string) {
  const household = await prisma.household.findUnique({
    where: { inviteCode: code },
  });

  if (!household) throw new NotFoundError('Invalid invite code');

  const existing = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId: household.id, userId } },
  });

  if (existing) throw new ConflictError('Already a member of this household');

  await prisma.householdMember.create({
    data: {
      householdId: household.id,
      userId,
      role: 'MEMBER',
      acceptedAt: new Date(),
    },
  });

  return {
    id: household.id,
    name: household.name,
    defaultCurrency: household.defaultCurrency,
    createdAt: household.createdAt.toISOString(),
  };
}

export async function getMembers(householdId: string): Promise<HouseholdMemberResponse[]> {
  const members = await prisma.householdMember.findMany({
    where: { householdId, acceptedAt: { not: null } },
    include: { user: true },
  });

  return members.map((m) => ({
    userId: m.userId,
    userName: m.user.name,
    userEmail: m.user.email,
    role: m.role,
    joinedAt: (m.acceptedAt ?? m.invitedAt).toISOString(),
  }));
}

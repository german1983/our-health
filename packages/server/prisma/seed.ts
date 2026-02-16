import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Seed currencies
  const currencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
    { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
    { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
    { code: 'COP', name: 'Colombian Peso', symbol: 'COL$' },
  ];

  for (const c of currencies) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
  }
  console.log('Seeded currencies');

  // Create demo user
  const passwordHash = await bcrypt.hash('password123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      passwordHash,
      name: 'Demo User',
    },
  });
  console.log('Seeded demo user:', user.email);

  // Create demo household
  const household = await prisma.household.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      name: 'Demo Household',
      defaultCurrency: 'USD',
      createdById: user.id,
    },
  });

  // Add user as owner
  await prisma.householdMember.upsert({
    where: {
      householdId_userId: {
        householdId: household.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      householdId: household.id,
      userId: user.id,
      role: 'OWNER',
      acceptedAt: new Date(),
    },
  });

  // Create default categories
  const expenseCategories = [
    { name: 'Groceries', icon: 'shopping-cart' },
    { name: 'Housing', icon: 'home' },
    { name: 'Transportation', icon: 'car' },
    { name: 'Utilities', icon: 'zap' },
    { name: 'Entertainment', icon: 'film' },
    { name: 'Health', icon: 'heart' },
    { name: 'Education', icon: 'book' },
    { name: 'Other', icon: 'more-horizontal' },
  ];

  const incomeCategories = [
    { name: 'Salary', icon: 'briefcase' },
    { name: 'Freelance', icon: 'laptop' },
    { name: 'Investments', icon: 'trending-up' },
    { name: 'Other Income', icon: 'plus-circle' },
  ];

  for (const [i, cat] of expenseCategories.entries()) {
    await prisma.category.upsert({
      where: { id: `seed-expense-${i}` },
      update: {},
      create: {
        id: `seed-expense-${i}`,
        householdId: household.id,
        name: cat.name,
        type: 'EXPENSE',
        icon: cat.icon,
        sortOrder: i,
      },
    });
  }

  for (const [i, cat] of incomeCategories.entries()) {
    await prisma.category.upsert({
      where: { id: `seed-income-${i}` },
      update: {},
      create: {
        id: `seed-income-${i}`,
        householdId: household.id,
        name: cat.name,
        type: 'INCOME',
        icon: cat.icon,
        sortOrder: i,
      },
    });
  }
  console.log('Seeded categories');

  // Create default storage spaces
  const spaces = [
    { name: 'Main Fridge', spaceType: 'FRIDGE' as const, sortOrder: 0 },
    { name: 'Freezer', spaceType: 'FREEZER' as const, sortOrder: 1 },
    { name: 'Pantry', spaceType: 'PANTRY' as const, sortOrder: 2 },
    { name: 'Kitchen Cabinet', spaceType: 'CABINET' as const, sortOrder: 3 },
  ];

  for (const [i, space] of spaces.entries()) {
    await prisma.storageSpace.upsert({
      where: { id: `seed-space-${i}` },
      update: {},
      create: {
        id: `seed-space-${i}`,
        householdId: household.id,
        ...space,
      },
    });
  }
  console.log('Seeded storage spaces');

  console.log('Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

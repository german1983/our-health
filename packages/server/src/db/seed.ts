import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import {
  currencies,
  users,
  households,
  householdMembers,
  categories,
  storageSpaces,
} from './schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  // Seed currencies
  await db
    .insert(currencies)
    .values([
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
    ])
    .onConflictDoNothing();
  console.log('Seeded currencies');

  // Demo user (idempotent by email)
  let user = await db.query.users.findFirst({ where: eq(users.email, 'demo@example.com') });
  if (!user) {
    const passwordHash = await bcrypt.hash('password123', 12);
    [user] = await db
      .insert(users)
      .values({ email: 'demo@example.com', passwordHash, name: 'Demo User' })
      .returning();
  }
  console.log('Seeded demo user:', user.email);

  // Demo household (idempotent: one per owner)
  let household = await db.query.households.findFirst({
    where: eq(households.createdById, user.id),
  });
  if (!household) {
    [household] = await db
      .insert(households)
      .values({ name: 'Demo Household', defaultCurrency: 'USD', createdById: user.id })
      .returning();

    await db
      .insert(householdMembers)
      .values({
        householdId: household.id,
        userId: user.id,
        role: 'OWNER',
        acceptedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // Default categories — only seed if this household has none yet
  const existingCats = await db.query.categories.findMany({
    where: eq(categories.householdId, household.id),
    limit: 1,
  });
  if (existingCats.length === 0) {
    const expense = [
      { name: 'Groceries', icon: 'shopping-cart' },
      { name: 'Housing', icon: 'home' },
      { name: 'Transportation', icon: 'car' },
      { name: 'Utilities', icon: 'zap' },
      { name: 'Entertainment', icon: 'film' },
      { name: 'Health', icon: 'heart' },
      { name: 'Education', icon: 'book' },
      { name: 'Other', icon: 'more-horizontal' },
    ];
    const income = [
      { name: 'Salary', icon: 'briefcase' },
      { name: 'Freelance', icon: 'laptop' },
      { name: 'Investments', icon: 'trending-up' },
      { name: 'Other Income', icon: 'plus-circle' },
    ];

    await db.insert(categories).values([
      ...expense.map((c, i) => ({
        householdId: household!.id,
        name: c.name,
        icon: c.icon,
        type: 'EXPENSE' as const,
        sortOrder: i,
      })),
      ...income.map((c, i) => ({
        householdId: household!.id,
        name: c.name,
        icon: c.icon,
        type: 'INCOME' as const,
        sortOrder: i,
      })),
    ]);
    console.log('Seeded categories');
  }

  // Default storage spaces — only if household has none
  const existingSpaces = await db.query.storageSpaces.findMany({
    where: eq(storageSpaces.householdId, household.id),
    limit: 1,
  });
  if (existingSpaces.length === 0) {
    await db.insert(storageSpaces).values([
      { householdId: household.id, name: 'Main Fridge', spaceType: 'FRIDGE', sortOrder: 0 },
      { householdId: household.id, name: 'Freezer', spaceType: 'FREEZER', sortOrder: 1 },
      { householdId: household.id, name: 'Pantry', spaceType: 'PANTRY', sortOrder: 2 },
      { householdId: household.id, name: 'Kitchen Cabinet', spaceType: 'CABINET', sortOrder: 3 },
    ]);
    console.log('Seeded storage spaces');
  }

  console.log('Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

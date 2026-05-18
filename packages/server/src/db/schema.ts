import { relations } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  date,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type { NutritionalFacts } from '@personal-budget/shared';

// ==================== Enums ====================

export const householdRoleEnum = pgEnum('household_role', ['OWNER', 'MEMBER']);
export const spaceTypeEnum = pgEnum('space_type', ['FRIDGE', 'FREEZER', 'PANTRY', 'CABINET', 'OTHER']);
export const recipeSourceEnum = pgEnum('recipe_source', ['USER', 'EXTERNAL']);
export const categoryTypeEnum = pgEnum('category_type', ['INCOME', 'EXPENSE']);
export const transactionTypeEnum = pgEnum('transaction_type', ['INCOME', 'EXPENSE']);
export const mealSlotEnum = pgEnum('meal_slot', [
  'BREAKFAST',
  'MID_MORNING_SNACK',
  'LUNCH',
  'AFTERNOON_SNACK',
  'DINNER',
  'EVENING_SNACK',
]);
export const receiptStatusEnum = pgEnum('receipt_status', ['PENDING', 'PARSED', 'REVIEWED', 'FAILED']);

// ==================== Auth & Household ====================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  defaultCurrency: text('default_currency').notNull().default('USD'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdById: uuid('created_by_id').notNull().references(() => users.id),
  inviteCode: uuid('invite_code').notNull().unique().defaultRandom(),
});

export const householdMembers = pgTable(
  'household_members',
  {
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: householdRoleEnum('role').notNull().default('MEMBER'),
    invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })],
);

// ==================== Grocery ====================

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    barcode: text('barcode').unique(),
    name: text('name').notNull(),
    brand: text('brand'),
    brandId: uuid('brand_id').references(() => brands.id),
    imageUrl: text('image_url'),
    nutritionalFacts: jsonb('nutritional_facts').$type<NutritionalFacts | null>(),
    nutritionBaseGrams: doublePrecision('nutrition_base_grams').notNull().default(100),
    offRawData: jsonb('off_raw_data').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('products_brand_id_idx').on(t.brandId)],
);

export const stores = pgTable(
  'stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    location: text('location'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stores_household_id_idx').on(t.householdId)],
);

export const priceRecords = pgTable(
  'price_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    price: doublePrecision('price').notNull(),
    currencyCode: text('currency_code').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    recordedById: uuid('recorded_by_id').notNull().references(() => users.id),
  },
  (t) => [
    index('price_records_product_store_idx').on(t.productId, t.storeId),
    index('price_records_product_recorded_idx').on(t.productId, t.recordedAt),
  ],
);

// ==================== Storage ====================

export const storageSpaces = pgTable(
  'storage_spaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    spaceType: spaceTypeEnum('space_type').notNull().default('OTHER'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('storage_spaces_household_id_idx').on(t.householdId)],
);

export const storageItems = pgTable(
  'storage_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storageSpaceId: uuid('storage_space_id').notNull().references(() => storageSpaces.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull().references(() => products.id),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull().default('units'),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    expiryDate: timestamp('expiry_date', { withTimezone: true }),
    addedById: uuid('added_by_id').notNull().references(() => users.id),
  },
  (t) => [
    index('storage_items_space_idx').on(t.storageSpaceId),
    index('storage_items_product_idx').on(t.productId),
  ],
);

// ==================== Recipes ====================

export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    servings: integer('servings').notNull().default(1),
    servingUnit: text('serving_unit'),
    servingWeightGrams: doublePrecision('serving_weight_grams'),
    prepTime: integer('prep_time'),
    cookTime: integer('cook_time'),
    imageUrl: text('image_url'),
    source: recipeSourceEnum('source').notNull().default('USER'),
    externalId: text('external_id'),
    createdById: uuid('created_by_id').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('recipes_household_id_idx').on(t.householdId)],
);

export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull().references(() => products.id),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull(),
    notes: text('notes'),
  },
  (t) => [index('recipe_ingredients_recipe_idx').on(t.recipeId)],
);

// ==================== Finance ====================

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
    name: text('name').notNull(),
    type: categoryTypeEnum('type').notNull(),
    level: integer('level').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    icon: text('icon'),
  },
  (t) => [
    index('categories_household_id_idx').on(t.householdId),
    index('categories_parent_id_idx').on(t.parentId),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id),
    amount: doublePrecision('amount').notNull(),
    currencyCode: text('currency_code').notNull(),
    type: transactionTypeEnum('type').notNull(),
    description: text('description'),
    date: timestamp('date', { withTimezone: true }).notNull(),
    createdById: uuid('created_by_id').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('transactions_household_date_idx').on(t.householdId, t.date),
    index('transactions_category_idx').on(t.categoryId),
  ],
);

// ==================== Currency ====================

export const currencies = pgTable('currencies', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
});

export const householdCurrencies = pgTable(
  'household_currencies',
  {
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    currencyCode: text('currency_code').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.currencyCode] })],
);

export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull(),
    rate: doublePrecision('rate').notNull(),
    date: timestamp('date', { withTimezone: true }).notNull(),
    source: text('source').notNull().default('frankfurter'),
  },
  (t) => [
    uniqueIndex('exchange_rates_from_to_date_uq').on(t.fromCurrency, t.toCurrency, t.date),
    index('exchange_rates_from_to_idx').on(t.fromCurrency, t.toCurrency),
  ],
);

// ==================== Daily Intake ====================

export const dailyLogs = pgTable(
  'daily_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'date' }).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('daily_logs_user_date_uq').on(t.userId, t.date),
    index('daily_logs_user_idx').on(t.userId),
  ],
);

export const productServingUnits = pgTable(
  'product_serving_units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    gramsEquivalent: doublePrecision('grams_equivalent').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_serving_units_product_user_name_uq').on(t.productId, t.userId, t.name),
    index('product_serving_units_product_user_idx').on(t.productId, t.userId),
  ],
);

export const intakeEntries = pgTable(
  'intake_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dailyLogId: uuid('daily_log_id').notNull().references(() => dailyLogs.id, { onDelete: 'cascade' }),
    mealSlot: mealSlotEnum('meal_slot').notNull(),
    productId: uuid('product_id').references(() => products.id),
    recipeId: uuid('recipe_id').references(() => recipes.id),
    quantity: doublePrecision('quantity').notNull(),
    servingUnitId: uuid('serving_unit_id').references(() => productServingUnits.id, { onDelete: 'set null' }),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('intake_entries_daily_log_idx').on(t.dailyLogId)],
);

// ==================== Receipts ====================

export const receipts = pgTable(
  'receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').references(() => stores.id),
    uploadedById: uuid('uploaded_by_id').notNull().references(() => users.id),
    store: text('store').notNull(),
    parserVersion: text('parser_version'),
    rawText: text('raw_text').notNull(),
    parsedData: jsonb('parsed_data').$type<unknown>(),
    status: receiptStatusEnum('status').notNull().default('PENDING'),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }),
    subtotal: doublePrecision('subtotal'),
    tax: doublePrecision('tax'),
    total: doublePrecision('total'),
    currencyCode: text('currency_code').notNull().default('CAD'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('receipts_household_purchased_idx').on(t.householdId, t.purchasedAt),
    index('receipts_store_idx').on(t.storeId),
  ],
);

export const receiptItems = pgTable(
  'receipt_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receiptId: uuid('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id),
    rawName: text('raw_name').notNull(),
    rawCode: text('raw_code'),
    taxCode: text('tax_code'),
    taxCategoryId: uuid('tax_category_id').references(() => taxCategories.id, { onDelete: 'set null' }),
    quantity: doublePrecision('quantity').notNull().default(1),
    unitPrice: doublePrecision('unit_price'),
    lineTotal: doublePrecision('line_total').notNull(),
    matched: boolean('matched').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('receipt_items_receipt_idx').on(t.receiptId),
    index('receipt_items_product_idx').on(t.productId),
  ],
);

export const taxCategories = pgTable('tax_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  rate: doublePrecision('rate').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chainTaxCodes = pgTable(
  'chain_tax_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chain: text('chain').notNull(),
    code: text('code').notNull(),
    taxCategoryId: uuid('tax_category_id').notNull().references(() => taxCategories.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('chain_tax_codes_chain_code_uq').on(t.chain, t.code)],
);

export const storeProductCodes = pgTable(
  'store_product_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('store_product_codes_store_code_uq').on(t.storeId, t.code),
    index('store_product_codes_product_idx').on(t.productId),
  ],
);

// ==================== Relations ====================

export const usersRelations = relations(users, ({ many }) => ({
  householdMemberships: many(householdMembers),
  createdHouseholds: many(households),
  priceRecords: many(priceRecords),
  storageItems: many(storageItems),
  recipes: many(recipes),
  transactions: many(transactions),
  dailyLogs: many(dailyLogs),
  productServingUnits: many(productServingUnits),
  uploadedReceipts: many(receipts),
}));

export const householdsRelations = relations(households, ({ one, many }) => ({
  createdBy: one(users, { fields: [households.createdById], references: [users.id] }),
  members: many(householdMembers),
  stores: many(stores),
  storageSpaces: many(storageSpaces),
  recipes: many(recipes),
  categories: many(categories),
  transactions: many(transactions),
  householdCurrencies: many(householdCurrencies),
  receipts: many(receipts),
}));

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
  household: one(households, { fields: [householdMembers.householdId], references: [households.id] }),
  user: one(users, { fields: [householdMembers.userId], references: [users.id] }),
}));

export const brandsRelations = relations(brands, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  brandRef: one(brands, { fields: [products.brandId], references: [brands.id] }),
  priceRecords: many(priceRecords),
  storageItems: many(storageItems),
  recipeIngredients: many(recipeIngredients),
  intakeEntries: many(intakeEntries),
  productServingUnits: many(productServingUnits),
  receiptItems: many(receiptItems),
  storeCodes: many(storeProductCodes),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  household: one(households, { fields: [stores.householdId], references: [households.id] }),
  priceRecords: many(priceRecords),
  receipts: many(receipts),
  productCodes: many(storeProductCodes),
}));

export const priceRecordsRelations = relations(priceRecords, ({ one }) => ({
  product: one(products, { fields: [priceRecords.productId], references: [products.id] }),
  store: one(stores, { fields: [priceRecords.storeId], references: [stores.id] }),
  recordedBy: one(users, { fields: [priceRecords.recordedById], references: [users.id] }),
}));

export const storageSpacesRelations = relations(storageSpaces, ({ one, many }) => ({
  household: one(households, { fields: [storageSpaces.householdId], references: [households.id] }),
  items: many(storageItems),
}));

export const storageItemsRelations = relations(storageItems, ({ one }) => ({
  storageSpace: one(storageSpaces, { fields: [storageItems.storageSpaceId], references: [storageSpaces.id] }),
  product: one(products, { fields: [storageItems.productId], references: [products.id] }),
  addedBy: one(users, { fields: [storageItems.addedById], references: [users.id] }),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  household: one(households, { fields: [recipes.householdId], references: [households.id] }),
  createdBy: one(users, { fields: [recipes.createdById], references: [users.id] }),
  ingredients: many(recipeIngredients),
  intakeEntries: many(intakeEntries),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
  product: one(products, { fields: [recipeIngredients.productId], references: [products.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  household: one(households, { fields: [categories.householdId], references: [households.id] }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_parent',
  }),
  children: many(categories, { relationName: 'category_parent' }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  household: one(households, { fields: [transactions.householdId], references: [households.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  createdBy: one(users, { fields: [transactions.createdById], references: [users.id] }),
}));

export const householdCurrenciesRelations = relations(householdCurrencies, ({ one }) => ({
  household: one(households, { fields: [householdCurrencies.householdId], references: [households.id] }),
}));

export const dailyLogsRelations = relations(dailyLogs, ({ one, many }) => ({
  user: one(users, { fields: [dailyLogs.userId], references: [users.id] }),
  entries: many(intakeEntries),
}));

export const intakeEntriesRelations = relations(intakeEntries, ({ one }) => ({
  dailyLog: one(dailyLogs, { fields: [intakeEntries.dailyLogId], references: [dailyLogs.id] }),
  product: one(products, { fields: [intakeEntries.productId], references: [products.id] }),
  recipe: one(recipes, { fields: [intakeEntries.recipeId], references: [recipes.id] }),
  servingUnit: one(productServingUnits, {
    fields: [intakeEntries.servingUnitId],
    references: [productServingUnits.id],
  }),
}));

export const productServingUnitsRelations = relations(productServingUnits, ({ one, many }) => ({
  product: one(products, { fields: [productServingUnits.productId], references: [products.id] }),
  user: one(users, { fields: [productServingUnits.userId], references: [users.id] }),
  intakeEntries: many(intakeEntries),
}));

export const receiptsRelations = relations(receipts, ({ one, many }) => ({
  household: one(households, { fields: [receipts.householdId], references: [households.id] }),
  matchedStore: one(stores, { fields: [receipts.storeId], references: [stores.id] }),
  uploadedBy: one(users, { fields: [receipts.uploadedById], references: [users.id] }),
  items: many(receiptItems),
}));

export const receiptItemsRelations = relations(receiptItems, ({ one }) => ({
  receipt: one(receipts, { fields: [receiptItems.receiptId], references: [receipts.id] }),
  product: one(products, { fields: [receiptItems.productId], references: [products.id] }),
  taxCategory: one(taxCategories, { fields: [receiptItems.taxCategoryId], references: [taxCategories.id] }),
}));

export const taxCategoriesRelations = relations(taxCategories, ({ many }) => ({
  receiptItems: many(receiptItems),
  chainTaxCodes: many(chainTaxCodes),
}));

export const chainTaxCodesRelations = relations(chainTaxCodes, ({ one }) => ({
  taxCategory: one(taxCategories, { fields: [chainTaxCodes.taxCategoryId], references: [taxCategories.id] }),
}));

export const storeProductCodesRelations = relations(storeProductCodes, ({ one }) => ({
  store: one(stores, { fields: [storeProductCodes.storeId], references: [stores.id] }),
  product: one(products, { fields: [storeProductCodes.productId], references: [products.id] }),
}));

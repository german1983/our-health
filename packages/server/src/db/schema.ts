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
export const paymentMethodTypeEnum = pgEnum('payment_method_type', ['CASH', 'CREDIT', 'DEBIT', 'BANK', 'OTHER']);
export const calendarEntryTypeEnum = pgEnum('calendar_entry_type', ['ANNIVERSARY', 'EVENT']);

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
    name: text('name').notNull(),
    /** Brand FK is the source of truth; `brands.name` is the display value. */
    brandId: uuid('brand_id').references(() => brands.id),
    /** Owning finance category (drives the nutrition display gate). */
    categoryId: uuid('category_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'set null',
    }),
    nutritionalFacts: jsonb('nutritional_facts').$type<NutritionalFacts | null>(),
    nutritionBaseAmount: doublePrecision('nutrition_base_amount').notNull().default(100),
    nutritionBaseUnit: text('nutrition_base_unit').notNull().default('g'),
    offRawData: jsonb('off_raw_data').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('products_brand_id_idx').on(t.brandId),
    index('products_category_id_idx').on(t.categoryId),
  ],
);

export const productImages = pgTable(
  'product_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    /** At most one primary per product (enforced in service). The "default" image. */
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('product_images_product_idx').on(t.productId)],
);

export const productPresentations = pgTable(
  'product_presentations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    /** Human label, e.g. "800 g jar", "1 kg bag", "12-pack". */
    name: text('name').notNull(),
    /** How much of `unit` is in one of this presentation. */
    amount: doublePrecision('amount').notNull(),
    /** Unit code (e.g. 'g', 'ml', 'unit'). */
    unit: text('unit').notNull(),
    /** Consumer-facing barcode/GTIN for this specific size. Unique when set. */
    barcode: text('barcode').unique(),
    /** At most one default per product (enforced in service). */
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('product_presentations_product_idx').on(t.productId)],
);

export const chains = pgTable('chains', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stores = pgTable(
  'stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    chainId: uuid('chain_id').references(() => chains.id, { onDelete: 'set null' }),
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
    receiptItemId: uuid('receipt_item_id').references((): AnyPgColumn => receiptItems.id, { onDelete: 'set null' }),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull().default('units'),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    expiryDate: timestamp('expiry_date', { withTimezone: true }),
    addedById: uuid('added_by_id').notNull().references(() => users.id),
  },
  (t) => [
    index('storage_items_space_idx').on(t.storageSpaceId),
    index('storage_items_product_idx').on(t.productId),
    index('storage_items_receipt_item_idx').on(t.receiptItemId),
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
    /** Free-form multi-paragraph cooking steps. */
    instructions: text('instructions'),
    servings: integer('servings').notNull().default(1),
    servingUnit: text('serving_unit'),
    servingWeightGrams: doublePrecision('serving_weight_grams'),
    prepTime: integer('prep_time'),
    cookTime: integer('cook_time'),
    imageUrl: text('image_url'),
    /** User-provided link to an external recipe page (blog, video, etc.). */
    externalUrl: text('external_url'),
    source: recipeSourceEnum('source').notNull().default('USER'),
    externalId: text('external_id'),
    /**
     * Companion product representing "leftovers of this recipe." Lazily set
     * the first time a user prepares the recipe and chooses to store the
     * result; subsequent preps reuse the same product so storage stacks.
     */
    resultProductId: uuid('result_product_id').references((): AnyPgColumn => products.id, {
      onDelete: 'set null',
    }),
    createdById: uuid('created_by_id').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('recipes_household_id_idx').on(t.householdId)],
);

export const recipePreparations = pgTable(
  'recipe_preparations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    preparedById: uuid('prepared_by_id').notNull().references(() => users.id),
    /** Multiplier applied to every ingredient quantity (1 = recipe as written, 0.5 = half batch, 2 = double, ...). */
    scale: doublePrecision('scale').notNull().default(1),
    /** True when the user OK'd consuming despite a shortfall — record-keeping only. */
    allowedShortage: boolean('allowed_shortage').notNull().default(false),
    notes: text('notes'),
    /** Storage row created for the leftovers (null when the user didn't save any). */
    storedItemId: uuid('stored_item_id').references((): AnyPgColumn => storageItems.id, {
      onDelete: 'set null',
    }),
    preparedAt: timestamp('prepared_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('recipe_preparations_recipe_idx').on(t.recipeId),
    index('recipe_preparations_household_idx').on(t.householdId),
  ],
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
    /** When true, products in this category show their nutritional facts. */
    hasNutritionalFacts: boolean('has_nutritional_facts').notNull().default(false),
  },
  (t) => [
    index('categories_household_id_idx').on(t.householdId),
    index('categories_parent_id_idx').on(t.parentId),
  ],
);

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: paymentMethodTypeEnum('type').notNull().default('OTHER'),
    initialBalance: doublePrecision('initial_balance').notNull().default(0),
    currencyCode: text('currency_code').notNull().default('CAD'),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payment_methods_household_idx').on(t.householdId)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id),
    paymentMethodId: uuid('payment_method_id').references(() => paymentMethods.id, { onDelete: 'set null' }),
    receiptId: uuid('receipt_id').references((): AnyPgColumn => receipts.id, { onDelete: 'set null' }),
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
    index('transactions_payment_method_idx').on(t.paymentMethodId),
    index('transactions_receipt_idx').on(t.receiptId),
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
    name: text('name').notNull(),
    /** How many of `targetUnit` (or the product's base unit when null) one of this row equals. */
    baseUnitEquivalent: doublePrecision('base_unit_equivalent').notNull().default(0),
    /**
     * The unit `baseUnitEquivalent` is expressed in. Null means the product's
     * `nutrition_base_unit` (preserves the original semantics for count-based
     * conversions like "1 slice = 21 g" on a g-base product). Setting it to a
     * different unit lets the same table express cross-family conversions —
     * e.g., name="g", base_unit_equivalent=1, target_unit="ml" is a density
     * row that bridges mass ↔ volume for this product.
     */
    targetUnit: text('target_unit'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_serving_units_product_name_uq').on(t.productId, t.name),
    index('product_serving_units_product_idx').on(t.productId),
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
    /** Standard unit code (from units.ts). Mutually exclusive with servingUnitId. */
    unit: text('unit'),
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
    chainId: uuid('chain_id').references(() => chains.id, { onDelete: 'set null' }),
    paymentMethodId: uuid('payment_method_id').references(() => paymentMethods.id, { onDelete: 'set null' }),
    defaultCategoryId: uuid('default_category_id').references(() => categories.id, { onDelete: 'set null' }),
    defaultStorageSpaceId: uuid('default_storage_space_id').references(() => storageSpaces.id, { onDelete: 'set null' }),
    uploadedById: uuid('uploaded_by_id').notNull().references(() => users.id),
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
    presentationId: uuid('presentation_id').references(() => productPresentations.id, { onDelete: 'set null' }),
    rawName: text('raw_name').notNull(),
    rawCode: text('raw_code'),
    taxCode: text('tax_code'),
    taxCategoryId: uuid('tax_category_id').references(() => taxCategories.id, { onDelete: 'set null' }),
    financeCategoryId: uuid('finance_category_id').references(() => categories.id, { onDelete: 'set null' }),
    storageSpaceId: uuid('storage_space_id').references(() => storageSpaces.id, { onDelete: 'set null' }),
    expiryDate: timestamp('expiry_date', { withTimezone: true }),
    quantity: doublePrecision('quantity').notNull().default(1),
    unitPrice: doublePrecision('unit_price'),
    lineTotal: doublePrecision('line_total').notNull(),
    // Snapshot fields, populated on receipt confirmation. Once written
    // these never change, even if the linked tax_category's rate is
    // adjusted later — the receipt is a ledger entry of what was true
    // at the time it was reviewed.
    taxRate: doublePrecision('tax_rate'),
    taxAmount: doublePrecision('tax_amount'),
    finalLineTotal: doublePrecision('final_line_total'),
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
    chainId: uuid('chain_id').notNull().references(() => chains.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    taxCategoryId: uuid('tax_category_id').notNull().references(() => taxCategories.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('chain_tax_codes_chain_id_code_uq').on(t.chainId, t.code)],
);

export const chainProductCodes = pgTable(
  'chain_product_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chainId: uuid('chain_id').notNull().references(() => chains.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    /** Chain SKU points at a specific presentation (the consumer-facing
        size/SKU); the parent product is reached via the presentation. */
    presentationId: uuid('presentation_id').notNull().references(() => productPresentations.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chain_product_codes_chain_id_code_uq').on(t.chainId, t.code),
    index('chain_product_codes_presentation_idx').on(t.presentationId),
  ],
);

export const receiptAdjustments = pgTable(
  'receipt_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receiptId: uuid('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
    amount: doublePrecision('amount').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('receipt_adjustments_receipt_idx').on(t.receiptId)],
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
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  priceRecords: many(priceRecords),
  storageItems: many(storageItems),
  recipeIngredients: many(recipeIngredients),
  intakeEntries: many(intakeEntries),
  productServingUnits: many(productServingUnits),
  receiptItems: many(receiptItems),
  presentations: many(productPresentations),
  images: many(productImages),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productPresentationsRelations = relations(productPresentations, ({ one, many }) => ({
  product: one(products, { fields: [productPresentations.productId], references: [products.id] }),
  receiptItems: many(receiptItems),
  chainCodes: many(chainProductCodes),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  household: one(households, { fields: [stores.householdId], references: [households.id] }),
  chain: one(chains, { fields: [stores.chainId], references: [chains.id] }),
  priceRecords: many(priceRecords),
  receipts: many(receipts),
}));

export const chainsRelations = relations(chains, ({ many }) => ({
  stores: many(stores),
  receipts: many(receipts),
  taxCodes: many(chainTaxCodes),
  productCodes: many(chainProductCodes),
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
  receiptItem: one(receiptItems, { fields: [storageItems.receiptItemId], references: [receiptItems.id] }),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  household: one(households, { fields: [recipes.householdId], references: [households.id] }),
  createdBy: one(users, { fields: [recipes.createdById], references: [users.id] }),
  resultProduct: one(products, { fields: [recipes.resultProductId], references: [products.id] }),
  ingredients: many(recipeIngredients),
  intakeEntries: many(intakeEntries),
  preparations: many(recipePreparations),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
  product: one(products, { fields: [recipeIngredients.productId], references: [products.id] }),
}));

export const recipePreparationsRelations = relations(recipePreparations, ({ one }) => ({
  recipe: one(recipes, { fields: [recipePreparations.recipeId], references: [recipes.id] }),
  preparedBy: one(users, { fields: [recipePreparations.preparedById], references: [users.id] }),
  storedItem: one(storageItems, { fields: [recipePreparations.storedItemId], references: [storageItems.id] }),
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
  paymentMethod: one(paymentMethods, { fields: [transactions.paymentMethodId], references: [paymentMethods.id] }),
  receipt: one(receipts, { fields: [transactions.receiptId], references: [receipts.id] }),
  createdBy: one(users, { fields: [transactions.createdById], references: [users.id] }),
}));

export const paymentMethodsRelations = relations(paymentMethods, ({ one, many }) => ({
  household: one(households, { fields: [paymentMethods.householdId], references: [households.id] }),
  transactions: many(transactions),
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
  intakeEntries: many(intakeEntries),
}));

export const receiptsRelations = relations(receipts, ({ one, many }) => ({
  household: one(households, { fields: [receipts.householdId], references: [households.id] }),
  matchedStore: one(stores, { fields: [receipts.storeId], references: [stores.id] }),
  chain: one(chains, { fields: [receipts.chainId], references: [chains.id] }),
  paymentMethod: one(paymentMethods, { fields: [receipts.paymentMethodId], references: [paymentMethods.id] }),
  defaultCategory: one(categories, { fields: [receipts.defaultCategoryId], references: [categories.id] }),
  defaultStorageSpace: one(storageSpaces, { fields: [receipts.defaultStorageSpaceId], references: [storageSpaces.id] }),
  uploadedBy: one(users, { fields: [receipts.uploadedById], references: [users.id] }),
  items: many(receiptItems),
  transactions: many(transactions),
  adjustments: many(receiptAdjustments),
}));

export const receiptItemsRelations = relations(receiptItems, ({ one, many }) => ({
  receipt: one(receipts, { fields: [receiptItems.receiptId], references: [receipts.id] }),
  product: one(products, { fields: [receiptItems.productId], references: [products.id] }),
  presentation: one(productPresentations, {
    fields: [receiptItems.presentationId],
    references: [productPresentations.id],
  }),
  taxCategory: one(taxCategories, { fields: [receiptItems.taxCategoryId], references: [taxCategories.id] }),
  financeCategory: one(categories, { fields: [receiptItems.financeCategoryId], references: [categories.id] }),
  storageSpace: one(storageSpaces, { fields: [receiptItems.storageSpaceId], references: [storageSpaces.id] }),
  storageItems: many(storageItems),
}));

export const taxCategoriesRelations = relations(taxCategories, ({ many }) => ({
  receiptItems: many(receiptItems),
  chainTaxCodes: many(chainTaxCodes),
}));

export const chainTaxCodesRelations = relations(chainTaxCodes, ({ one }) => ({
  chain: one(chains, { fields: [chainTaxCodes.chainId], references: [chains.id] }),
  taxCategory: one(taxCategories, { fields: [chainTaxCodes.taxCategoryId], references: [taxCategories.id] }),
}));

export const chainProductCodesRelations = relations(chainProductCodes, ({ one }) => ({
  chain: one(chains, { fields: [chainProductCodes.chainId], references: [chains.id] }),
  presentation: one(productPresentations, {
    fields: [chainProductCodes.presentationId],
    references: [productPresentations.id],
  }),
}));

export const receiptAdjustmentsRelations = relations(receiptAdjustments, ({ one }) => ({
  receipt: one(receipts, { fields: [receiptAdjustments.receiptId], references: [receipts.id] }),
  category: one(categories, { fields: [receiptAdjustments.categoryId], references: [categories.id] }),
}));

// ==================== Calendar ====================

export const calendarEntries = pgTable(
  'calendar_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    type: calendarEntryTypeEnum('type').notNull(),
    title: text('title').notNull(),
    notes: text('notes'),
    /**
     * The entry's date. For EVENT it's the single occurrence. For ANNIVERSARY
     * it's the original date — only month/day matter for recurrence, but we
     * keep the full date so "since YYYY" can be shown. Stored as a calendar
     * date (no time component); see migration for the `date` column type.
     */
    date: timestamp('date', { withTimezone: true }).notNull(),
    /** True for all-day entries; false → the date carries a time-of-day (events). */
    allDay: boolean('all_day').notNull().default(true),
    /**
     * Anniversaries only: when false the original year is "don't care" — the
     * UI hides the year input and occurrences omit the years-since count.
     * Always true for events.
     */
    trackYears: boolean('track_years').notNull().default(true),
    createdById: uuid('created_by_id').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('calendar_entries_household_idx').on(t.householdId),
    index('calendar_entries_date_idx').on(t.date),
  ],
);

export const calendarEntriesRelations = relations(calendarEntries, ({ one }) => ({
  household: one(households, { fields: [calendarEntries.householdId], references: [households.id] }),
  createdBy: one(users, { fields: [calendarEntries.createdById], references: [users.id] }),
}));

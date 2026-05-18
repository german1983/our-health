// Units
export {
  UNITS,
  UNIT_CODES,
  UNIT_FAMILIES,
  unitCodeSchema,
  getUnitsByFamily,
  areUnitsCompatible,
  convertUnit,
  getCompatibleUnits,
  getOtherFamilyUnits,
  type UnitFamily,
  type UnitDefinition,
  type UnitCode,
} from './units.js';

// Auth
export {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  type RegisterInput,
  type LoginInput,
  type RefreshTokenInput,
  type AuthTokens,
  type UserResponse,
  type AuthResponse,
} from './schemas/auth.js';

// Household
export {
  createHouseholdSchema,
  inviteMemberSchema,
  joinHouseholdSchema,
  type CreateHouseholdInput,
  type InviteMemberInput,
  type JoinHouseholdInput,
  type HouseholdRole,
  type HouseholdResponse,
  type HouseholdMemberResponse,
  type HouseholdDetailResponse,
} from './schemas/household.js';

// Grocery
export {
  nutritionalFactsSchema,
  createProductSchema,
  createStoreSchema,
  updateStoreSchema,
  createPriceRecordSchema,
  productSearchSchema,
  priceHistoryQuerySchema,
  type NutritionalFacts,
  type CreateProductInput,
  type CreateStoreInput,
  type UpdateStoreInput,
  type CreatePriceRecordInput,
  type ProductSearchInput,
  type BrandResponse,
  type ProductResponse,
  type StoreResponse,
  type PriceRecordResponse,
} from './schemas/grocery.js';

// Storage
export {
  spaceTypeEnum,
  createStorageSpaceSchema,
  updateStorageSpaceSchema,
  createStorageItemSchema,
  updateStorageItemSchema,
  type SpaceType,
  type CreateStorageSpaceInput,
  type UpdateStorageSpaceInput,
  type CreateStorageItemInput,
  type UpdateStorageItemInput,
  type StorageSpaceResponse,
  type StorageItemResponse,
} from './schemas/storage.js';

// Recipes
export {
  recipeIngredientSchema,
  createRecipeSchema,
  updateRecipeSchema,
  type RecipeIngredientInput,
  type CreateRecipeInput,
  type UpdateRecipeInput,
  type RecipeIngredientResponse,
  type RecipeResponse,
  type RecipeDetailResponse,
  type RecipeSuggestionResponse,
} from './schemas/recipes.js';

// Finance
export {
  categoryTypeEnum,
  transactionTypeEnum,
  createCategorySchema,
  updateCategorySchema,
  createTransactionSchema,
  updateTransactionSchema,
  transactionQuerySchema,
  financeSummaryQuerySchema,
  type CategoryType,
  type TransactionType,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type CreateTransactionInput,
  type UpdateTransactionInput,
  type TransactionQueryInput,
  type FinanceSummaryQueryInput,
  type CategoryResponse,
  type TransactionResponse,
  type FinanceSummaryResponse,
} from './schemas/finance.js';

// Currency
export {
  convertCurrencySchema,
  type ConvertCurrencyInput,
  type CurrencyResponse,
  type ExchangeRateResponse,
  type ConvertCurrencyResponse,
} from './schemas/currency.js';

// Intake
export {
  mealSlotEnum,
  createServingUnitSchema,
  updateServingUnitSchema,
  createIntakeEntrySchema,
  updateIntakeEntrySchema,
  dailyLogQuerySchema,
  intakeSummaryQuerySchema,
  type MealSlot,
  type CreateServingUnitInput,
  type UpdateServingUnitInput,
  type CreateIntakeEntryInput,
  type UpdateIntakeEntryInput,
  type DailyLogQueryInput,
  type IntakeSummaryQueryInput,
  type ServingUnitResponse,
  type IntakeEntryResponse,
  type MealGroup,
  type DailyLogResponse,
  type IntakeSummaryResponse,
} from './schemas/intake.js';

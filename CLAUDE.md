# PersonalBudget - Project Guide

## Project Overview

Full-stack **Personal Budget & Grocery Management** app for households. Tracks groceries (with barcode scanning), home storage/inventory, recipes, and personal finances — all scoped to multi-user households with multi-currency support.

## Architecture

**Monorepo** with npm workspaces: `packages/shared` → `packages/server` → `packages/client`

```
packages/
  shared/    Zod schemas & TypeScript types (must build first)
  server/    Express 4 REST API + Prisma 6 + PostgreSQL
  client/    React 18 + Vite 6 + Tailwind CSS 4
```

### Server Pattern
`routes.ts` → `service.ts` → Prisma ORM. Each feature module lives in `packages/server/src/modules/<feature>/`.

### Client Pattern
Feature pages in `src/features/<feature>/`, shared UI components in `src/components/ui/`, auth via React Context, server state via TanStack Query.

## Commands

```bash
# Development
npm run dev              # All dev servers in parallel
npm run dev:server       # Express (tsx watch, port 3001)
npm run dev:client       # Vite (port 5173, proxies /api → 3001)
npm run build:shared     # Build shared types (MUST run first)

# Database
npx -w packages/server prisma generate   # Generate Prisma client
npx -w packages/server prisma db push    # Push schema to DB
npx -w packages/server prisma migrate dev # Create migration
npm run db:seed                           # Seed database
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Client | React 18, Vite 6, React Router 6, TanStack Query 5, Tailwind CSS 4, Recharts, html5-qrcode |
| Server | Express 4, Prisma 6, PostgreSQL (Neon), JWT, bcryptjs |
| Shared | Zod 3, TypeScript 5.5 |

## Key Patterns & Conventions

### Authentication
- JWT access token (15m) + refresh token (7d) with bcryptjs password hashing
- Axios interceptor auto-refreshes on 401
- Auth state managed via React Context (`useAuth` hook)

### Household Multi-Tenancy
- All data except `Product` and `Currency` is household-scoped
- `requireHousehold` middleware sets `req.householdId` for every protected route
- Users create or join households via invite codes

### Validation
- All input validated with Zod schemas defined in `packages/shared`
- Server uses `validate()` middleware; client reuses the same schemas

### Error Handling
- Custom error classes in `packages/server/src/lib/errors.ts`: `AppError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `ValidationError`
- Global error handler catches `AppError` and `ZodError`

### Database Design
- Products are **global** (shared by barcode across households)
- Categories use **adjacency list** (self-referencing `parentId`)
- Nutritional facts stored as **JSONB** (per 100g, matching Open Food Facts)
- Exchange rates cached in DB (source: Frankfurter.app)

## API Modules

| Module | Base Path | Purpose |
|--------|-----------|---------|
| Auth | `/api/auth` | Register, login, refresh tokens, profile |
| Household | `/api/households` | Create/join households, members, invite codes |
| Grocery | `/api/products`, `/api/stores`, `/api/prices` | Products (barcode lookup via Open Food Facts), stores, price tracking |
| Storage | `/api/storage` | Storage spaces (fridge/freezer/pantry), inventory items with expiry |
| Recipes | `/api/recipes` | CRUD + ingredient-based suggestions from inventory |
| Finance | `/api/finance` | Hierarchical categories, transactions, summaries |
| Currency | `/api/currencies` | Currency list, exchange rates, conversion |

## Environment Variables

See `.env.example` for the full list. Key variables:
- `DATABASE_URL` — PostgreSQL connection string (Neon)
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — Token signing secrets
- `PORT` — Server port (default 3001)

## Important Technical Notes

- **Express types**: Using `@types/express@4` (v5 changes `req.params` types)
- **JWT types**: `expiresIn` needs casting as `jwt.SignOptions['expiresIn']`
- **Prisma relations**: Both sides of every relation must be defined
- **Tailwind CSS v4**: Uses `@import "tailwindcss"` and `@theme {}` blocks (no tailwind.config.js)
- **Shared package**: Must be built (`npm run build:shared`) before server/client can import from it
- **Client path alias**: `@/*` maps to `./src/*`

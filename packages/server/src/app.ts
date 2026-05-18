import './lib/env.js';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/error-handler.js';

import authRoutes from './modules/auth/routes.js';
import householdRoutes from './modules/household/routes.js';
import groceryRoutes from './modules/grocery/routes.js';
import storageRoutes from './modules/storage/routes.js';
import recipeRoutes from './modules/recipes/routes.js';
import financeRoutes from './modules/finance/routes.js';
import currencyRoutes from './modules/currency/routes.js';
import intakeRoutes from './modules/intake/routes.js';
import receiptRoutes from './modules/receipt/routes.js';
import chainRoutes from './modules/chain/routes.js';

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
// Receipt images arrive as base64 data URLs after client-side compression,
// typically ~1 MB. Cap at 5 MB which is just under Vercel's 4.5 MB body
// limit on the Hobby tier.
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/households', householdRoutes);
app.use('/api', groceryRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/currencies', currencyRoutes);
app.use('/api/intake', intakeRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/chains', chainRoutes);

app.use(errorHandler);

export default app;

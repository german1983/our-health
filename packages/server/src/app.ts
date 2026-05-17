import 'dotenv/config';
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

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
// Raw OCR text can be a few KB per line; allow up to 1 MB to be safe.
app.use(express.json({ limit: '1mb' }));

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

app.use(errorHandler);

export default app;

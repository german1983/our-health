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

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/households', householdRoutes);
app.use('/api', groceryRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/currencies', currencyRoutes);

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;

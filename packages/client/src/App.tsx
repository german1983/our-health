import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/use-auth';
import { Layout } from '@/components/layout';
import { LoginPage } from '@/features/auth/login-page';
import { RegisterPage } from '@/features/auth/register-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { HouseholdPage } from '@/features/household/household-page';
import { GroceryPage } from '@/features/grocery/grocery-page';
import { StoragePage } from '@/features/storage/storage-page';
import { RecipesPage } from '@/features/recipes/recipes-page';
import { FinancePage } from '@/features/finance/finance-page';
import { IntakePage } from '@/features/intake/intake-page';
import { ReceiptsPage } from '@/features/receipts/receipts-page';
import { ReceiptDetailPage } from '@/features/receipts/receipt-detail-page';
import { ChainsPage } from '@/features/chains/chains-page';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/household" element={<HouseholdPage />} />
              <Route path="/grocery" element={<GroceryPage />} />
              <Route path="/storage" element={<StoragePage />} />
              <Route path="/recipes" element={<RecipesPage />} />
              <Route path="/finance" element={<FinancePage />} />
              <Route path="/intake" element={<IntakePage />} />
              <Route path="/receipts" element={<ReceiptsPage />} />
              <Route path="/receipts/:id" element={<ReceiptDetailPage />} />
              <Route path="/chains" element={<ChainsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

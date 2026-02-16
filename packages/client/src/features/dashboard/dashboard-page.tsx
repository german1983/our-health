import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { StorageItemResponse, RecipeSuggestionResponse, TransactionResponse } from '@personal-budget/shared';

export function DashboardPage() {
  const { user } = useAuth();

  const { data: inventory } = useQuery({
    queryKey: ['storage', 'inventory'],
    queryFn: () => api.get<StorageItemResponse[]>('/storage/inventory').then((r) => r.data),
  });

  const { data: suggestions } = useQuery({
    queryKey: ['recipes', 'suggestions'],
    queryFn: () => api.get<RecipeSuggestionResponse[]>('/recipes/suggestions').then((r) => r.data),
  });

  const { data: transactions } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () =>
      api
        .get<{ items: TransactionResponse[] }>('/finance/transactions', { params: { limit: 5 } })
        .then((r) => r.data.items),
  });

  const expiringItems = inventory?.filter((item) => {
    if (!item.expiryDate) return false;
    const daysUntilExpiry = Math.ceil(
      (new Date(item.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    return daysUntilExpiry <= 7 && daysUntilExpiry >= 0;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome, {user?.name}</h1>
        <p className="text-muted-foreground">Here's an overview of your household.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Inventory Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{inventory?.length ?? 0}</div>
            <p className="text-sm text-muted-foreground">items in storage</p>
          </CardContent>
        </Card>

        {/* Expiring Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expiring Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">{expiringItems?.length ?? 0}</div>
            <p className="text-sm text-muted-foreground">items expire within 7 days</p>
          </CardContent>
        </Card>

        {/* Recipes Available */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recipes Ready</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">
              {suggestions?.filter((s) => s.matchScore === 1).length ?? 0}
            </div>
            <p className="text-sm text-muted-foreground">recipes you can make now</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Expiring Items Detail */}
        {expiringItems && expiringItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expiring Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {expiringItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-1">
                    <span className="text-sm">{item.productName}</span>
                    <Badge variant="warning">{formatDate(item.expiryDate!)}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recipe Suggestions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recipe Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            {suggestions && suggestions.length > 0 ? (
              <div className="space-y-2">
                {suggestions.slice(0, 5).map((recipe) => (
                  <div key={recipe.id} className="flex items-center justify-between py-1">
                    <span className="text-sm">{recipe.name}</span>
                    <Badge variant={recipe.matchScore === 1 ? 'success' : 'secondary'}>
                      {recipe.availableIngredients}/{recipe.totalIngredients}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Add recipes and inventory items to get suggestions.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions && transactions.length > 0 ? (
              <div className="space-y-2">
                {transactions.map((txn) => (
                  <div key={txn.id} className="flex items-center justify-between py-1">
                    <div>
                      <span className="text-sm">{txn.description || txn.categoryName}</span>
                      <span className="text-xs text-muted-foreground ml-2">{formatDate(txn.date)}</span>
                    </div>
                    <span
                      className={`text-sm font-medium ${txn.type === 'INCOME' ? 'text-success' : 'text-destructive'}`}
                    >
                      {txn.type === 'INCOME' ? '+' : '-'}
                      {formatCurrency(txn.amount, txn.currencyCode)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

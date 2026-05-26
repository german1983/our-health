import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, ChefHat, Package } from 'lucide-react';
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
      <div className="rounded-2xl bg-gradient-to-br from-fitness-soft via-background to-finance-soft p-5 sm:p-6 border border-border">
        <h1 className="text-2xl sm:text-3xl font-bold">Hi, {user?.name?.split(' ')[0] ?? 'there'} 👋</h1>
        <p className="text-muted-foreground mt-1">A quick look at your kitchen and your wallet.</p>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<Package className="h-5 w-5" />}
          tint="fitness"
          value={inventory?.length ?? 0}
          label="items in storage"
          title="Inventory"
        />
        <StatCard
          icon={<CalendarClock className="h-5 w-5" />}
          tint="warning"
          value={expiringItems?.length ?? 0}
          label="expire within 7 days"
          title="Expiring soon"
        />
        <StatCard
          icon={<ChefHat className="h-5 w-5" />}
          tint="fitness"
          value={suggestions?.filter((s) => s.matchScore === 1).length ?? 0}
          label="recipes you can make"
          title="Ready to cook"
        />
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

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: number | string;
  label: string;
  tint: 'fitness' | 'finance' | 'warning';
}

/** Tinted summary tile for the dashboard hero strip. */
function StatCard({ icon, title, value, label, tint }: StatCardProps) {
  // Two tones per tint: a soft background for the icon chip, and a saturated
  // accent for the number. Lets the eye scan the three stats at a glance.
  const chip =
    tint === 'fitness'
      ? 'bg-fitness-soft text-fitness'
      : tint === 'finance'
        ? 'bg-finance-soft text-finance'
        : 'bg-[oklch(0.95_0.05_75)] text-warning dark:bg-[oklch(0.30_0.07_75)]';
  const number =
    tint === 'fitness'
      ? 'text-fitness'
      : tint === 'finance'
        ? 'text-finance'
        : 'text-warning';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${chip}`}>
            {icon}
          </span>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
            <div className={`text-2xl sm:text-3xl font-bold ${number}`}>{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

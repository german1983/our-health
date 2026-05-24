import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type {
  CategoryResponse,
  TransactionResponse,
  FinanceSummaryResponse,
  CategoryType,
} from '@personal-budget/shared';

export function FinancePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'transactions' | 'categories' | 'summary'>('transactions');
  const [showAddTxn, setShowAddTxn] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);

  // Transaction form
  const [txnType, setTxnType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [txnCategoryId, setTxnCategoryId] = useState('');
  const [txnAmount, setTxnAmount] = useState('');
  const [txnCurrency, setTxnCurrency] = useState('USD');
  const [txnDesc, setTxnDesc] = useState('');
  const [txnDate, setTxnDate] = useState(new Date().toISOString().split('T')[0]);

  // Category form
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<CategoryType>('EXPENSE');
  const [catParentId, setCatParentId] = useState('');
  const [catHasNutrition, setCatHasNutrition] = useState(false);
  // Whether the user has explicitly toggled the flag in this dialog session.
  // Until they do, parent selection drives the value.
  const [catNutritionTouched, setCatNutritionTouched] = useState(false);

  // Edit-category dialog state. `editingCategory` holds the row being edited;
  // `editOriginalNutrition` is the value at dialog-open time, so we can decide
  // whether the user has actually changed the flag (and thus whether to surface
  // the "apply to children" toggle).
  const [editingCategory, setEditingCategory] = useState<CategoryResponse | null>(null);
  const [editName, setEditName] = useState('');
  const [editParentId, setEditParentId] = useState('');
  const [editHasNutrition, setEditHasNutrition] = useState(false);
  const [editOriginalNutrition, setEditOriginalNutrition] = useState(false);
  const [editCascade, setEditCascade] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<CategoryResponse[]>('/finance/categories').then((r) => r.data),
  });

  const { data: transactions } = useQuery({
    queryKey: ['transactions', filterType, filterFrom, filterTo],
    queryFn: () =>
      api
        .get<{ items: TransactionResponse[]; total: number }>('/finance/transactions', {
          params: {
            type: filterType || undefined,
            from: filterFrom || undefined,
            to: filterTo || undefined,
            limit: 50,
          },
        })
        .then((r) => r.data),
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

  const { data: summary } = useQuery({
    queryKey: ['finance', 'summary'],
    queryFn: () =>
      api
        .get<FinanceSummaryResponse[]>('/finance/summary', {
          params: { from: monthStart, to: monthEnd, groupBy: 'month' },
        })
        .then((r) => r.data),
    enabled: tab === 'summary',
  });

  const addTxnMutation = useMutation({
    mutationFn: (data: {
      categoryId: string;
      amount: number;
      currencyCode: string;
      type: 'INCOME' | 'EXPENSE';
      description?: string;
      date: string;
    }) => api.post('/finance/transactions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'summary'] });
      setShowAddTxn(false);
      setTxnAmount('');
      setTxnDesc('');
    },
  });

  const deleteTxnMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/finance/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'summary'] });
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: (data: {
      name: string;
      type: CategoryType;
      parentId?: string;
      hasNutritionalFacts?: boolean;
    }) => api.post('/finance/categories', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['finance-categories'] });
      setShowAddCategory(false);
      setCatName('');
      setCatParentId('');
      setCatHasNutrition(false);
      setCatNutritionTouched(false);
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      data: {
        name?: string;
        parentId?: string | null;
        hasNutritionalFacts?: boolean;
        cascadeHasNutritionalFacts?: boolean;
      };
    }) => api.patch(`/finance/categories/${vars.id}`, vars.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['finance-categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditingCategory(null);
    },
  });

  function openEditCategory(cat: CategoryResponse) {
    setEditingCategory(cat);
    setEditName(cat.name);
    setEditParentId(cat.parentId ?? '');
    setEditHasNutrition(cat.hasNutritionalFacts);
    setEditOriginalNutrition(cat.hasNutritionalFacts);
    setEditCascade(false);
  }

  /** Walk the category tree to find a node by id (for parent-flag lookup). */
  function findCategoryById(
    tree: CategoryResponse[] | undefined,
    id: string,
  ): CategoryResponse | null {
    if (!tree) return null;
    for (const cat of tree) {
      if (cat.id === id) return cat;
      if (cat.children) {
        const hit = findCategoryById(cat.children, id);
        if (hit) return hit;
      }
    }
    return null;
  }

  // Auto-fill the flag from the chosen parent until the user overrides it.
  useEffect(() => {
    if (catNutritionTouched) return;
    if (!catParentId) {
      setCatHasNutrition(false);
      return;
    }
    const parent = findCategoryById(categories, catParentId);
    setCatHasNutrition(parent?.hasNutritionalFacts ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catParentId, categories, catNutritionTouched]);

  function flattenCategories(cats: CategoryResponse[], depth = 0): { id: string; name: string; type: CategoryType; depth: number }[] {
    const result: { id: string; name: string; type: CategoryType; depth: number }[] = [];
    for (const cat of cats) {
      result.push({ id: cat.id, name: cat.name, type: cat.type, depth });
      if (cat.children) result.push(...flattenCategories(cat.children, depth + 1));
    }
    return result;
  }

  const flatCategories = categories ? flattenCategories(categories) : [];

  function handleAddTxn(e: FormEvent) {
    e.preventDefault();
    addTxnMutation.mutate({
      categoryId: txnCategoryId,
      amount: parseFloat(txnAmount),
      currencyCode: txnCurrency,
      type: txnType,
      description: txnDesc || undefined,
      date: new Date(txnDate).toISOString(),
    });
  }

  function renderCategoryTree(cats: CategoryResponse[], depth = 0) {
    return cats.map((cat) => (
      <div key={cat.id}>
        <div
          className="flex items-center justify-between py-1.5 group"
          style={{ paddingLeft: depth * 20 }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm truncate">{cat.name}</span>
            <Badge variant={cat.type === 'INCOME' ? 'success' : 'secondary'} className="text-xs">
              {cat.type}
            </Badge>
            {cat.hasNutritionalFacts && (
              <Badge variant="outline" className="text-xs" title="Products in this category track nutritional facts">
                🍎 Nutrition
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="opacity-60 hover:opacity-100"
            onClick={() => openEditCategory(cat)}
          >
            Edit
          </Button>
        </div>
        {cat.children && renderCategoryTree(cat.children, depth + 1)}
      </div>
    ));
  }

  /** Whether `candidate` is `target` or a descendant of `target`. Used so the
      edit dialog won't offer `target`'s own subtree as a new parent. */
  function isSelfOrDescendant(
    candidate: CategoryResponse,
    targetId: string,
    treeIdx: Map<string, CategoryResponse>,
  ): boolean {
    let cur: CategoryResponse | null = candidate;
    while (cur) {
      if (cur.id === targetId) return true;
      cur = cur.parentId ? treeIdx.get(cur.parentId) ?? null : null;
    }
    return false;
  }
  const categoryIndex = (() => {
    const m = new Map<string, CategoryResponse>();
    function walk(nodes: CategoryResponse[] | undefined) {
      if (!nodes) return;
      for (const n of nodes) {
        m.set(n.id, n);
        walk(n.children);
      }
    }
    walk(categories);
    return m;
  })();

  /** Does the category (looked up in the loaded tree) have any children? */
  function hasChildren(catId: string): boolean {
    const cat = categoryIndex.get(catId);
    return !!(cat?.children && cat.children.length > 0);
  }

  const currentSummary = summary?.[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Finance</h1>
        <Button onClick={() => setShowAddTxn(true)}>Add Transaction</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['transactions', 'categories', 'summary'] as const).map((t) => (
          <Button key={t} size="sm" variant={tab === t ? 'default' : 'outline'} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>

      {/* Summary Tab */}
      {tab === 'summary' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Income</div>
                <div className="text-2xl font-bold text-success">
                  {formatCurrency(currentSummary?.totalIncome ?? 0, currentSummary?.currencyCode)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Expenses</div>
                <div className="text-2xl font-bold text-destructive">
                  {formatCurrency(currentSummary?.totalExpenses ?? 0, currentSummary?.currencyCode)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Net</div>
                <div className={`text-2xl font-bold ${(currentSummary?.net ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(currentSummary?.net ?? 0, currentSummary?.currencyCode)}
                </div>
              </CardContent>
            </Card>
          </div>

          {currentSummary?.byCategory && currentSummary.byCategory.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">By Category</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {currentSummary.byCategory.map((bc) => (
                    <div key={bc.categoryId} className="flex items-center justify-between py-1">
                      <span className="text-sm">{bc.categoryName}</span>
                      <span className={`text-sm font-medium ${bc.type === 'INCOME' ? 'text-success' : 'text-destructive'}`}>
                        {formatCurrency(bc.total, currentSummary.currencyCode)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Transactions Tab */}
      {tab === 'transactions' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Select className="w-auto" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All types</option>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
            </Select>
            <Input type="date" className="w-auto" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
            <Input type="date" className="w-auto" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          </div>

          <Card>
            <CardContent className="p-4">
              {transactions?.items && transactions.items.length > 0 ? (
                <div className="space-y-2">
                  {transactions.items.map((txn) => (
                    <div key={txn.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <div className="text-sm font-medium">{txn.description || txn.categoryName}</div>
                        <div className="text-xs text-muted-foreground">
                          {txn.categoryName} · {formatDate(txn.date)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${txn.type === 'INCOME' ? 'text-success' : 'text-destructive'}`}>
                          {txn.type === 'INCOME' ? '+' : '-'}{formatCurrency(txn.amount, txn.currencyCode)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => deleteTxnMutation.mutate(txn.id)}
                        >
                          X
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No transactions found.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Categories Tab */}
      {tab === 'categories' && (
        <div className="space-y-4">
          <Button size="sm" variant="outline" onClick={() => setShowAddCategory(true)}>Add Category</Button>
          <Card>
            <CardContent className="p-4">
              {categories && categories.length > 0 ? (
                renderCategoryTree(categories)
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No categories yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Transaction Dialog */}
      <Dialog open={showAddTxn} onClose={() => setShowAddTxn(false)}>
        <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
        <form onSubmit={handleAddTxn}>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={txnType === 'EXPENSE' ? 'default' : 'outline'}
                onClick={() => setTxnType('EXPENSE')}
              >
                Expense
              </Button>
              <Button
                type="button"
                size="sm"
                variant={txnType === 'INCOME' ? 'default' : 'outline'}
                onClick={() => setTxnType('INCOME')}
              >
                Income
              </Button>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select value={txnCategoryId} onChange={(e) => setTxnCategoryId(e.target.value)} required>
                <option value="">Select category</option>
                {flatCategories
                  .filter((c) => c.type === txnType)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {'  '.repeat(c.depth)}{c.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input type="number" step="0.01" value={txnAmount} onChange={(e) => setTxnAmount(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Currency</label>
                <Input value={txnCurrency} onChange={(e) => setTxnCurrency(e.target.value)} maxLength={3} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input value={txnDesc} onChange={(e) => setTxnDesc(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} required />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setShowAddTxn(false)}>Cancel</Button>
            <Button type="submit" disabled={addTxnMutation.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={showAddCategory} onClose={() => setShowAddCategory(false)}>
        <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          addCategoryMutation.mutate({
            name: catName,
            type: catType,
            parentId: catParentId || undefined,
            hasNutritionalFacts: catHasNutrition,
          });
        }}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={catName} onChange={(e) => setCatName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={catType} onChange={(e) => setCatType(e.target.value as CategoryType)}>
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Parent (optional)</label>
              <Select value={catParentId} onChange={(e) => setCatParentId(e.target.value)}>
                <option value="">None (top-level)</option>
                {flatCategories
                  .filter((c) => c.type === catType)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{'  '.repeat(c.depth)}{c.name}</option>
                  ))}
              </Select>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={catHasNutrition}
                onChange={(e) => {
                  setCatNutritionTouched(true);
                  setCatHasNutrition(e.target.checked);
                }}
              />
              <span>
                <span className="font-medium">Products track nutritional facts</span>
                <span className="block text-xs text-muted-foreground">
                  Check this for food categories (Groceries, etc.) so the app collects and
                  displays calorie/macro info on each product. Leave unchecked for non-food
                  categories like cleaning supplies or rent. Defaults to the parent's value.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setShowAddCategory(false)}>Cancel</Button>
            <Button type="submit" disabled={addCategoryMutation.isPending}>Create</Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog open={editingCategory !== null} onClose={() => setEditingCategory(null)}>
        <DialogHeader>
          <DialogTitle>Edit {editingCategory?.name}</DialogTitle>
        </DialogHeader>
        {editingCategory && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              const flagChanged = editHasNutrition !== editOriginalNutrition;
              const parentChanged = (editParentId || null) !== (editingCategory.parentId ?? null);
              updateCategoryMutation.mutate({
                id: editingCategory.id,
                data: {
                  name: editName !== editingCategory.name ? editName : undefined,
                  parentId: parentChanged ? (editParentId || null) : undefined,
                  hasNutritionalFacts: flagChanged ? editHasNutrition : undefined,
                  cascadeHasNutritionalFacts:
                    editCascade && hasChildren(editingCategory.id) ? true : undefined,
                },
              });
            }}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Parent (optional)</label>
                <Select
                  value={editParentId}
                  onChange={(e) => setEditParentId(e.target.value)}
                >
                  <option value="">None (top-level)</option>
                  {flatCategories
                    .filter((c) => c.type === editingCategory.type)
                    .filter((c) => {
                      // Block selecting self or any descendant — would cycle the tree.
                      const candidate = categoryIndex.get(c.id);
                      if (!candidate) return false;
                      return !isSelfOrDescendant(candidate, editingCategory.id, categoryIndex);
                    })
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {'  '.repeat(c.depth)}{c.name}
                      </option>
                    ))}
                </Select>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={editHasNutrition}
                  onChange={(e) => setEditHasNutrition(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Products track nutritional facts</span>
                  <span className="block text-xs text-muted-foreground">
                    Check for food categories so products under it show calories/macros. Leave
                    unchecked for things like cleaning supplies.
                  </span>
                </span>
              </label>
              {/* "Apply to children" is only meaningful when the flag actually
                  changed AND this category has descendants to cascade to. */}
              {hasChildren(editingCategory.id) && editHasNutrition !== editOriginalNutrition && (
                <label className="flex items-start gap-2 text-sm pl-6 border-l-2 border-muted-foreground/30">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={editCascade}
                    onChange={(e) => setEditCascade(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Apply this choice to all child categories</span>
                    <span className="block text-xs text-muted-foreground">
                      Recursively sets the same value on every descendant of {editingCategory.name}.
                      One-shot — not stored.
                    </span>
                  </span>
                </label>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditingCategory(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateCategoryMutation.isPending}>
                {updateCategoryMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </Dialog>
    </div>
  );
}

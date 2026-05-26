import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type {
  CreatePaymentMethodInput,
  PaymentMethodResponse,
  PaymentMethodType,
} from '@personal-budget/shared';

const TYPES: PaymentMethodType[] = ['CASH', 'CREDIT', 'DEBIT', 'BANK', 'OTHER'];

export function PaymentMethodsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PaymentMethodType>('CREDIT');
  const [initialBalance, setInitialBalance] = useState('0');
  const [currencyCode, setCurrencyCode] = useState('CAD');

  const { data: methods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => api.get<PaymentMethodResponse[]>('/payment-methods').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreatePaymentMethodInput) =>
      api.post<PaymentMethodResponse>('/payment-methods', input).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      setOpen(false);
      setName('');
      setInitialBalance('0');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; patch: Partial<PaymentMethodResponse> }) =>
      api.patch<PaymentMethodResponse>(`/payment-methods/${input.id}`, input.patch).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-methods'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/payment-methods/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-methods'] }),
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      name: name.trim(),
      type,
      initialBalance: parseFloat(initialBalance) || 0,
      currencyCode,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6 sm:h-7 sm:w-7 text-finance" />
          Payment methods
        </h1>
        <Button onClick={() => setOpen(true)}>Add method</Button>
      </div>
      <p className="text-muted-foreground">
        Used on receipts to record where the money came from. Current balance is computed from the
        initial balance plus every transaction linked to this method.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your methods</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!methods || methods.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No payment methods yet. Add one to start recording transactions from receipts.
            </p>
          ) : (
            <div className="table-scroll -mx-2 sm:mx-0">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="border-b border-border">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Initial</th>
                  <th className="px-4 py-2 text-right">Current</th>
                  <th className="px-4 py-2">Currency</th>
                  <th className="px-4 py-2 text-center w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <Input
                        defaultValue={m.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== m.name) updateMutation.mutate({ id: m.id, patch: { name: v } });
                        }}
                        className="h-8 text-sm"
                      />
                      {m.archived && <Badge variant="secondary" className="ml-2">Archived</Badge>}
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        defaultValue={m.type}
                        onChange={(e) =>
                          updateMutation.mutate({ id: m.id, patch: { type: e.target.value as PaymentMethodType } })
                        }
                        className="h-8 text-xs"
                      >
                        {TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        defaultValue={m.initialBalance}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isNaN(v) && v !== m.initialBalance) {
                            updateMutation.mutate({ id: m.id, patch: { initialBalance: v } });
                          }
                        }}
                        className="h-8 w-28 ml-auto text-right font-mono text-sm"
                      />
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatCurrency(m.currentBalance, m.currencyCode)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{m.currencyCode}</td>
                    <td className="px-4 py-2 text-center space-x-2">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => updateMutation.mutate({ id: m.id, patch: { archived: !m.archived } })}
                      >
                        {m.archived ? 'Unarchive' : 'Archive'}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline"
                        onClick={() => {
                          if (confirm(`Delete "${m.name}"? Linked transactions will have their payment method unset.`)) {
                            deleteMutation.mutate(m.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle>Add payment method</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Name</span>
            <Input
              placeholder="e.g. Mastercard •••1234"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Type</span>
            <Select value={type} onChange={(e) => setType(e.target.value as PaymentMethodType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Initial balance</span>
              <Input
                type="number"
                step="0.01"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="font-mono"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Currency</span>
              <Input
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                maxLength={3}
                className="font-mono"
              />
            </label>
          </div>
          {createMutation.error && (
            <p className="text-sm text-destructive">
              {(createMutation.error as { response?: { data?: { error?: string } } })
                .response?.data?.error || 'Could not create payment method'}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || !name.trim()}>
              {createMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}

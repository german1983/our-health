import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { ChainResponse, CreateChainInput } from '@personal-budget/shared';

export function ChainsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [nameInput, setNameInput] = useState('');

  const { data: chains } = useQuery({
    queryKey: ['chains'],
    queryFn: () => api.get<ChainResponse[]>('/chains').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateChainInput) => api.post<ChainResponse>('/chains', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] });
      setOpen(false);
      setKeyInput('');
      setNameInput('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      api.patch<ChainResponse>(`/chains/${input.id}`, { name: input.name }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] });
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    const key = keyInput.trim().toUpperCase().replace(/\s+/g, '_');
    createMutation.mutate({ key, name: nameInput.trim() });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Store className="h-6 w-6 sm:h-7 sm:w-7 text-finance" />
          Chains
        </h1>
        <Button onClick={() => setOpen(true)}>Add chain</Button>
      </div>
      <p className="text-muted-foreground">
        Store chains are shared across households. The receipt parser uses the chain key (e.g.{' '}
        <span className="font-mono">WALMART</span>) to map tax-code letters to the right category.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All chains</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!chains || chains.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No chains yet.</p>
          ) : (
            <div className="table-scroll -mx-2 sm:mx-0">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="border-b border-border">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2">Key</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Added</th>
                </tr>
              </thead>
              <tbody>
                {chains.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{c.key}</td>
                    <td className="px-4 py-2">
                      <Input
                        defaultValue={c.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== c.name) updateMutation.mutate({ id: c.id, name: v });
                        }}
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {formatDate(c.createdAt)}
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
          <DialogTitle>Add chain</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">
              Key — short uppercase identifier the parser uses
            </span>
            <Input
              placeholder="e.g. METRO"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
              maxLength={32}
              required
              className="font-mono"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Display name</span>
            <Input
              placeholder="e.g. Metro"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={100}
              required
            />
          </label>
          {createMutation.error && (
            <p className="text-sm text-destructive">
              {(createMutation.error as { response?: { data?: { error?: string } } })
                .response?.data?.error || 'Could not create chain'}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}

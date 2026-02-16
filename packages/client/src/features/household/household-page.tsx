import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import type { HouseholdDetailResponse } from '@personal-budget/shared';

export function HouseholdPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const { data: household, isLoading, error } = useQuery({
    queryKey: ['household', 'current'],
    queryFn: () => api.get<HouseholdDetailResponse>('/households/current').then((r) => r.data),
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post('/households', { name, defaultCurrency: 'USD' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['household'] });
      setShowCreate(false);
      setCreateName('');
    },
  });

  const joinMutation = useMutation({
    mutationFn: (code: string) => api.post('/households/join', { code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['household'] });
      setShowJoin(false);
      setJoinCode('');
    },
  });

  const { data: inviteCode, refetch: fetchInviteCode } = useQuery({
    queryKey: ['household', 'inviteCode'],
    queryFn: () => api.get<{ code: string }>(`/households/${household!.id}/invite-code`).then((r) => r.data.code),
    enabled: false,
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  if (error || !household) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Household</h1>
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <p className="text-muted-foreground">You don't belong to a household yet.</p>
            <div className="flex gap-4 justify-center">
              <Button onClick={() => setShowCreate(true)}>Create Household</Button>
              <Button variant="outline" onClick={() => setShowJoin(true)}>Join Household</Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={showCreate} onClose={() => setShowCreate(false)}>
          <DialogHeader><DialogTitle>Create Household</DialogTitle></DialogHeader>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); createMutation.mutate(createName); }}>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Household Name</label>
                <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="My Family" required />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>Create</Button>
            </DialogFooter>
          </form>
        </Dialog>

        <Dialog open={showJoin} onClose={() => setShowJoin(false)}>
          <DialogHeader><DialogTitle>Join Household</DialogTitle></DialogHeader>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); joinMutation.mutate(joinCode); }}>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Invite Code</label>
                <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Paste invite code" required />
              </div>
              {joinMutation.error && (
                <p className="text-sm text-destructive">
                  {(joinMutation.error as any).response?.data?.error || 'Failed to join'}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowJoin(false)}>Cancel</Button>
              <Button type="submit" disabled={joinMutation.isPending}>Join</Button>
            </DialogFooter>
          </form>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{household.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {household.members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{m.userName}</div>
                  <div className="text-sm text-muted-foreground">{m.userEmail}</div>
                </div>
                <Badge variant={m.role === 'OWNER' ? 'default' : 'secondary'}>{m.role}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={() => fetchInviteCode()}>
            Generate Invite Code
          </Button>
          {inviteCode && (
            <div className="flex items-center gap-2">
              <Input value={inviteCode} readOnly className="font-mono text-sm" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(inviteCode)}
              >
                Copy
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api';
import type { CategoryResponse, SpaceType, StorageSpaceResponse } from '@personal-budget/shared';

const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  FRIDGE: 'Fridge',
  FREEZER: 'Freezer',
  PANTRY: 'Pantry',
  CABINET: 'Cabinet',
  OTHER: 'Other',
};

interface Option {
  id: string;
  name: string;
}

/** Shared layout: a Select that shrinks to make room for a trailing + button. */
function SelectWithAddButton({
  value,
  onChange,
  disabled,
  className,
  children,
  onAdd,
  addTitle,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  onAdd: () => void;
  addTitle: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        {children}
      </Select>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        title={addTitle}
        className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

// ==================== Category ====================

interface CategorySelectProps {
  value: string;
  onChange: (id: string) => void;
  /** Expense categories already flattened with depth-prefixed names. */
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Expense-category dropdown with an inline "+" that opens a create dialog.
 * On create, the new category is selected automatically and the cached
 * category tree is refreshed so every other combo sees it too.
 */
export function CategorySelect({
  value,
  onChange,
  options,
  placeholder = '— Unassigned —',
  disabled,
  className,
}: CategorySelectProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [tracksNutrition, setTracksNutrition] = useState(false);

  const createMutation = useMutation({
    mutationFn: (body: {
      name: string;
      type: 'EXPENSE';
      parentId?: string;
      hasNutritionalFacts?: boolean;
    }) => api.post<CategoryResponse>('/finance/categories', body).then((r) => r.data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['finance-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      onChange(created.id);
      setOpen(false);
      setName('');
      setParentId('');
      setTracksNutrition(false);
    },
  });

  function handleCreate() {
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      type: 'EXPENSE',
      parentId: parentId || undefined,
      hasNutritionalFacts: tracksNutrition,
    });
  }

  return (
    <>
      <SelectWithAddButton
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={className}
        onAdd={() => setOpen(true)}
        addTitle="New expense category"
      >
        <option value="">{placeholder}</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectWithAddButton>

      {open && (
      <Dialog open onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle>New expense category</DialogTitle>
        </DialogHeader>
        {/* Form keeps Enter-to-submit + HTML5 validation, but the action
            buttons use onClick — so a parent <form> further up the tree
            can't intercept the submit (the receipt detail's "Add an item"
            card wraps these in its own form). */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Parent (optional)</label>
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">None (top-level)</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={tracksNutrition}
              onChange={(e) => setTracksNutrition(e.target.checked)}
            />
            <span>
              <span className="font-medium">Products track nutritional facts</span>
              <span className="block text-xs text-muted-foreground">
                Check for food categories so products show calories/macros.
              </span>
            </span>
          </label>
          {createMutation.error && (
            <p className="text-sm text-destructive">
              {(createMutation.error as { response?: { data?: { error?: string } } }).response?.data
                ?.error || 'Could not create category'}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={createMutation.isPending || !name.trim()}
            >
              {createMutation.isPending ? 'Creating…' : 'Create & select'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
      )}
    </>
  );
}

// ==================== Storage space ====================

interface StorageSelectProps {
  value: string;
  onChange: (id: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Storage-space dropdown with an inline "+" that opens a create dialog. New
 * spaces are selected automatically and the cached space list refreshed.
 */
export function StorageSelect({
  value,
  onChange,
  options,
  placeholder = '— None —',
  disabled,
  className,
}: StorageSelectProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [spaceType, setSpaceType] = useState<SpaceType>('OTHER');

  const createMutation = useMutation({
    mutationFn: (body: { name: string; spaceType: SpaceType }) =>
      api.post<StorageSpaceResponse>('/storage/spaces', body).then((r) => r.data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['storage'] });
      onChange(created.id);
      setOpen(false);
      setName('');
      setSpaceType('OTHER');
    },
  });

  function handleCreate() {
    if (!name.trim()) return;
    createMutation.mutate({ name: name.trim(), spaceType });
  }

  return (
    <>
      <SelectWithAddButton
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={className}
        onAdd={() => setOpen(true)}
        addTitle="New storage space"
      >
        <option value="">{placeholder}</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </SelectWithAddButton>

      {open && (
      <Dialog open onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle>New storage space</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Kitchen Fridge"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <Select value={spaceType} onChange={(e) => setSpaceType(e.target.value as SpaceType)}>
              {Object.entries(SPACE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          {createMutation.error && (
            <p className="text-sm text-destructive">
              {(createMutation.error as { response?: { data?: { error?: string } } }).response?.data
                ?.error || 'Could not create storage space'}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={createMutation.isPending || !name.trim()}
            >
              {createMutation.isPending ? 'Creating…' : 'Create & select'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
      )}
    </>
  );
}

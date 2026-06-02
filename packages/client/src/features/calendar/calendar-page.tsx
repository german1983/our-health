import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Cake, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import type {
  CalendarEntryResponse,
  CalendarEntryType,
  CalendarOccurrence,
  CreateCalendarEntryInput,
} from '@personal-budget/shared';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** YYYY-MM-DD for a Date, in local terms (the grid is a local-calendar view). */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The 6×7 grid of dates covering the month `cursor` falls in (Sun-first). */
function buildGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay()); // back up to Sunday
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function CalendarPage() {
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEntryResponse | null>(null);

  const grid = useMemo(() => buildGrid(cursor), [cursor]);
  const rangeFrom = ymd(grid[0]);
  const rangeTo = ymd(grid[grid.length - 1]);
  const todayStr = ymd(new Date());

  const { data: occurrences } = useQuery({
    queryKey: ['calendar', 'occurrences', rangeFrom, rangeTo],
    queryFn: () =>
      api
        .get<CalendarOccurrence[]>('/calendar/occurrences', { params: { from: rangeFrom, to: rangeTo } })
        .then((r) => r.data),
  });

  // Raw entries — needed to seed the edit dialog from an occurrence.
  const { data: entries } = useQuery({
    queryKey: ['calendar', 'entries'],
    queryFn: () => api.get<CalendarEntryResponse[]>('/calendar').then((r) => r.data),
  });
  const entryById = useMemo(() => {
    const m = new Map<string, CalendarEntryResponse>();
    for (const e of entries ?? []) m.set(e.id, e);
    return m;
  }, [entries]);

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarOccurrence[]>();
    for (const o of occurrences ?? []) {
      const list = m.get(o.occurrenceDate);
      if (list) list.push(o);
      else m.set(o.occurrenceDate, [o]);
    }
    return m;
  }, [occurrences]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(entryId: string) {
    const entry = entryById.get(entryId);
    if (entry) {
      setEditing(entry);
      setDialogOpen(true);
    }
  }

  const monthOccurrences = (occurrences ?? []).filter((o) => {
    const m = Number(o.occurrenceDate.slice(5, 7)) - 1;
    return m === cursor.getMonth();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
          Calendar
        </h1>
        <Button onClick={openCreate}>New entry</Button>
      </div>

      {/* Month switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>
            Today
          </Button>
        </div>
        <div className="text-lg font-semibold">
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
        </div>
      </div>

      {/* Month grid */}
      <Card>
        <CardContent className="p-2 sm:p-3">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground py-1">
                {w}
              </div>
            ))}
            {grid.map((d) => {
              const ds = ymd(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = ds === todayStr;
              const dayOccs = byDate.get(ds) ?? [];
              return (
                <div
                  key={ds}
                  className={cn(
                    'min-h-[64px] sm:min-h-[88px] rounded-md border p-1 text-left align-top',
                    inMonth ? 'border-border bg-card' : 'border-transparent bg-muted/30 text-muted-foreground',
                  )}
                >
                  <div
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                      isToday && 'bg-primary text-primary-foreground font-semibold',
                    )}
                  >
                    {d.getDate()}
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {dayOccs.map((o) => (
                      <button
                        key={`${o.entryId}-${o.occurrenceDate}`}
                        type="button"
                        onClick={() => openEdit(o.entryId)}
                        className={cn(
                          'flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] sm:text-xs',
                          o.type === 'ANNIVERSARY'
                            ? 'bg-accent/40 text-accent-foreground hover:bg-accent/60'
                            : 'bg-primary/15 text-foreground hover:bg-primary/25',
                        )}
                        title={o.title}
                      >
                        {o.type === 'ANNIVERSARY' ? (
                          <Cake className="h-3 w-3 flex-shrink-0" />
                        ) : (
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                        )}
                        <span className="truncate">
                          {o.title}
                          {o.type === 'ANNIVERSARY' && o.yearsSince != null && o.yearsSince > 0 && (
                            <span className="opacity-70"> ({o.yearsSince})</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Agenda for the month (easier to scan on mobile) */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-medium mb-3">This month</h2>
          {monthOccurrences.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled this month.</p>
          ) : (
            <div className="space-y-1">
              {monthOccurrences.map((o) => (
                <button
                  key={`${o.entryId}-${o.occurrenceDate}`}
                  type="button"
                  onClick={() => openEdit(o.entryId)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {o.type === 'ANNIVERSARY' ? (
                      <Heart className="h-4 w-4 flex-shrink-0 text-accent-foreground" />
                    ) : (
                      <CalendarDays className="h-4 w-4 flex-shrink-0 text-primary" />
                    )}
                    <span className="truncate text-sm font-medium">{o.title}</span>
                    {o.type === 'ANNIVERSARY' && o.yearsSince != null && o.yearsSince > 0 && (
                      <Badge variant="secondary" className="text-[10px]">{o.yearsSince} yr</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(o.occurrenceDate + 'T12:00:00').toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <EntryDialog
          editing={editing}
          defaultDate={cursor}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['calendar'] });
            setDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface EntryDialogProps {
  editing: CalendarEntryResponse | null;
  defaultDate: Date;
  onClose: () => void;
  onSaved: () => void;
}

function EntryDialog({ editing, defaultDate, onClose, onSaved }: EntryDialogProps) {
  const [type, setType] = useState<CalendarEntryType>(editing?.type ?? 'EVENT');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [date, setDate] = useState(
    editing ? editing.date.slice(0, 10) : ymd(defaultDate),
  );
  const [notes, setNotes] = useState(editing?.notes ?? '');

  const saveMutation = useMutation({
    mutationFn: (body: CreateCalendarEntryInput) =>
      editing
        ? api.patch(`/calendar/${editing.id}`, body)
        : api.post('/calendar', body),
    onSuccess: onSaved,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/calendar/${editing!.id}`),
    onSuccess: onSaved,
  });

  function handleSave() {
    if (!title.trim() || !date) return;
    saveMutation.mutate({
      type,
      title: title.trim(),
      notes: notes.trim() || undefined,
      // Noon UTC keeps the calendar date stable regardless of timezone.
      date: new Date(date + 'T12:00:00Z').toISOString(),
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit entry' : 'New calendar entry'}</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          handleSave();
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('EVENT')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm',
                type === 'EVENT' ? 'border-primary bg-primary/10 font-medium' : 'border-border',
              )}
            >
              <CalendarDays className="h-4 w-4" /> Event
            </button>
            <button
              type="button"
              onClick={() => setType('ANNIVERSARY')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm',
                type === 'ANNIVERSARY' ? 'border-primary bg-primary/10 font-medium' : 'border-border',
              )}
            >
              <Cake className="h-4 w-4" /> Anniversary
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {type === 'ANNIVERSARY'
              ? 'Repeats every year on this date.'
              : 'Happens once on this date.'}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Notes (optional)</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {(saveMutation.error || deleteMutation.error) && (
          <p className="text-sm text-destructive">Could not save the entry.</p>
        )}

        <DialogFooter>
          {editing && (
            <Button
              type="button"
              variant="destructive"
              className="mr-auto"
              onClick={() => {
                if (confirm(`Delete "${editing.title}"?`)) deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saveMutation.isPending || !title.trim() || !date}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

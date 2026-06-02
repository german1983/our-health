import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { calendarEntries } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import type {
  CalendarEntryResponse,
  CalendarOccurrence,
  CreateCalendarEntryInput,
  UpdateCalendarEntryInput,
} from '@personal-budget/shared';

type EntryRow = typeof calendarEntries.$inferSelect & {
  createdBy?: { name: string } | null;
};

function format(row: EntryRow): CalendarEntryResponse {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    notes: row.notes,
    date: row.date.toISOString(),
    allDay: row.allDay,
    trackYears: row.trackYears,
    createdById: row.createdById,
    createdByName: row.createdBy?.name ?? '',
    createdAt: row.createdAt.toISOString(),
  };
}

/** UTC YYYY-MM-DD from a Date. We treat calendar dates as date-only in UTC. */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "HH:MM" (UTC) — the wall-clock time as the user entered it (we store local-as-UTC). */
function hm(d: Date): string {
  return d.toISOString().slice(11, 16);
}

export async function listEntries(householdId: string): Promise<CalendarEntryResponse[]> {
  const rows = await db.query.calendarEntries.findMany({
    where: eq(calendarEntries.householdId, householdId),
    orderBy: asc(calendarEntries.date),
    with: { createdBy: { columns: { name: true } } },
  });
  return rows.map((r) => format(r as EntryRow));
}

/**
 * Expand entries into concrete dated occurrences within [from, to] (inclusive,
 * YYYY-MM-DD). Events contribute at most one; anniversaries one per year the
 * window spans. Feb-29 anniversaries fall back to Feb-28 in non-leap years.
 */
export async function getOccurrences(
  householdId: string,
  from: string,
  to: string,
): Promise<CalendarOccurrence[]> {
  const rows = await db.query.calendarEntries.findMany({
    where: eq(calendarEntries.householdId, householdId),
  });

  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const out: CalendarOccurrence[] = [];

  for (const row of rows) {
    const base = row.date; // Date (UTC)
    const month = base.getUTCMonth(); // 0-11
    const day = base.getUTCDate();
    const originalYear = base.getUTCFullYear();

    if (row.type === 'EVENT') {
      const occ = ymd(base);
      if (occ >= from && occ <= to) {
        out.push({
          entryId: row.id,
          type: row.type,
          title: row.title,
          notes: row.notes,
          occurrenceDate: occ,
          allDay: row.allDay,
          time: row.allDay ? null : hm(base),
          yearsSince: null,
        });
      }
      continue;
    }

    // ANNIVERSARY: one occurrence per year the window touches.
    for (let year = fromYear; year <= toYear; year++) {
      // Feb 29 in a non-leap year → Feb 28.
      let d = day;
      if (month === 1 && day === 29) {
        const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        if (!isLeap) d = 28;
      }
      const occDate = new Date(Date.UTC(year, month, d));
      const occ = ymd(occDate);
      if (occ >= from && occ <= to) {
        out.push({
          entryId: row.id,
          type: row.type,
          title: row.title,
          notes: row.notes,
          occurrenceDate: occ,
          allDay: true,
          time: null,
          // Suppress the count when the user opted out of year tracking.
          yearsSince: row.trackYears ? year - originalYear : null,
        });
      }
    }
  }

  out.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
  return out;
}

export async function createEntry(
  householdId: string,
  userId: string,
  input: CreateCalendarEntryInput,
): Promise<CalendarEntryResponse> {
  const [created] = await db
    .insert(calendarEntries)
    .values({
      householdId,
      type: input.type,
      title: input.title,
      notes: input.notes,
      date: new Date(input.date),
      allDay: input.allDay ?? true,
      trackYears: input.trackYears ?? true,
      createdById: userId,
    })
    .returning({ id: calendarEntries.id });

  const row = await db.query.calendarEntries.findFirst({
    where: eq(calendarEntries.id, created.id),
    with: { createdBy: { columns: { name: true } } },
  });
  return format(row as EntryRow);
}

export async function updateEntry(
  id: string,
  householdId: string,
  input: UpdateCalendarEntryInput,
): Promise<CalendarEntryResponse> {
  const existing = await db.query.calendarEntries.findFirst({
    where: and(eq(calendarEntries.id, id), eq(calendarEntries.householdId, householdId)),
  });
  if (!existing) throw new NotFoundError('Calendar entry');

  const updates: Partial<typeof calendarEntries.$inferInsert> = {};
  if (input.type !== undefined) updates.type = input.type;
  if (input.title !== undefined) updates.title = input.title;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.date !== undefined) updates.date = new Date(input.date);
  if (input.allDay !== undefined) updates.allDay = input.allDay;
  if (input.trackYears !== undefined) updates.trackYears = input.trackYears;

  if (Object.keys(updates).length > 0) {
    await db.update(calendarEntries).set(updates).where(eq(calendarEntries.id, id));
  }

  const row = await db.query.calendarEntries.findFirst({
    where: eq(calendarEntries.id, id),
    with: { createdBy: { columns: { name: true } } },
  });
  return format(row as EntryRow);
}

export async function deleteEntry(id: string, householdId: string): Promise<void> {
  const existing = await db.query.calendarEntries.findFirst({
    where: and(eq(calendarEntries.id, id), eq(calendarEntries.householdId, householdId)),
  });
  if (!existing) throw new NotFoundError('Calendar entry');
  await db.delete(calendarEntries).where(eq(calendarEntries.id, id));
}

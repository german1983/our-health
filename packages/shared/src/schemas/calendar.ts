import { z } from 'zod';

export const calendarEntryTypeEnum = z.enum(['ANNIVERSARY', 'EVENT']);
export type CalendarEntryType = z.infer<typeof calendarEntryTypeEnum>;

export const createCalendarEntrySchema = z.object({
  type: calendarEntryTypeEnum,
  title: z.string().min(1, 'Title is required').max(200),
  notes: z.string().max(2000).optional(),
  /** ISO datetime. For ANNIVERSARY only month/day recur; the year is the "since". */
  date: z.string().datetime(),
  /** false → the date carries a time-of-day (timed event). Default all-day. */
  allDay: z.boolean().optional(),
  /** Anniversaries: false hides/ignores the original year. Default true. */
  trackYears: z.boolean().optional(),
});
export type CreateCalendarEntryInput = z.infer<typeof createCalendarEntrySchema>;

export const updateCalendarEntrySchema = z.object({
  type: calendarEntryTypeEnum.optional(),
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).nullable().optional(),
  date: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  trackYears: z.boolean().optional(),
});
export type UpdateCalendarEntryInput = z.infer<typeof updateCalendarEntrySchema>;

/** Query a window of the calendar. Both bounds inclusive, ISO date (YYYY-MM-DD). */
export const calendarRangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
});
export type CalendarRangeQueryInput = z.infer<typeof calendarRangeQuerySchema>;

/** The stored entry as-is (the source row). */
export interface CalendarEntryResponse {
  id: string;
  type: CalendarEntryType;
  title: string;
  notes: string | null;
  /** Original ISO datetime of the entry. */
  date: string;
  allDay: boolean;
  trackYears: boolean;
  createdById: string;
  createdByName: string;
  createdAt: string;
}

/**
 * A single dated occurrence within a queried range. Anniversaries expand to
 * one occurrence per year in range; events map to exactly one. `occurrenceDate`
 * is the YYYY-MM-DD this instance falls on; `yearsSince` is set for
 * anniversaries (0 in the original year, 1 the next, …).
 */
export interface CalendarOccurrence {
  entryId: string;
  type: CalendarEntryType;
  title: string;
  notes: string | null;
  occurrenceDate: string;
  allDay: boolean;
  /** "HH:MM" (24h) for timed events; null for all-day. */
  time: string | null;
  /** Years elapsed since the original date — tracked anniversaries only, else null. */
  yearsSince: number | null;
}

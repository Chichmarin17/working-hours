import { entryEndMs } from './entries';
import { addDays, overlapMs, toMs } from './time';
import type { Entry } from './types';

export type WeekRow = { projectId: string; perDay: number[]; total: number };
export type WeekGrid = { days: number[]; rows: WeekRow[]; dayTotals: number[]; total: number };

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function entriesInRange(entries: Entry[], from: number, to: number, now: number): Entry[] {
  return entries
    .filter((e) => {
      const start = toMs(e.start);
      return start < to && (entryEndMs(e, now) > from || start >= from);
    })
    .sort((a, b) => toMs(b.start) - toMs(a.start));
}

export function totalsByProject(entries: Entry[], from: number, to: number, now: number): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of entries) {
    const ms = overlapMs(toMs(e.start), entryEndMs(e, now), from, to);
    if (ms > 0) totals[e.projectId] = (totals[e.projectId] ?? 0) + ms;
  }
  return totals;
}

export function totalMs(entries: Entry[], from: number, to: number, now: number): number {
  return sum(Object.values(totalsByProject(entries, from, to, now)));
}

export function weekGrid(entries: Entry[], weekStart: number, now: number): WeekGrid {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const perProject = new Map<string, number[]>();
  for (const e of entries) {
    const start = toMs(e.start);
    const end = entryEndMs(e, now);
    days.forEach((day, i) => {
      const ms = overlapMs(start, end, day, addDays(day, 1));
      if (ms <= 0) return;
      const row = perProject.get(e.projectId) ?? new Array<number>(7).fill(0);
      row[i] += ms;
      perProject.set(e.projectId, row);
    });
  }
  const rows = [...perProject]
    .map(([projectId, perDay]) => ({ projectId, perDay, total: sum(perDay) }))
    .sort((a, b) => b.total - a.total);
  const dayTotals = days.map((_, i) => sum(rows.map((r) => r.perDay[i])));
  return { days, rows, dayTotals, total: sum(dayTotals) };
}

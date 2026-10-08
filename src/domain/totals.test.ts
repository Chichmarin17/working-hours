import { describe, expect, it } from 'vitest';
import { addDays, HOUR, toIso } from './time';
import { entriesInRange, totalMs, totalsByProject, weekGrid } from './totals';
import type { Entry } from './types';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const entry = (id: string, projectId: string, start: number, end: number | null): Entry => ({
  id,
  projectId,
  start: toIso(start),
  end: end === null ? null : toIso(end),
  source: 'manual',
});
const now = at(2026, 10, 8, 15);
const day = at(2026, 10, 8);

describe('entriesInRange', () => {
  it('returns entries touching the day, newest first, including a just-started timer', () => {
    const entries = [
      entry('old', 'p1', at(2026, 10, 7, 9), at(2026, 10, 7, 10)),
      entry('a', 'p1', at(2026, 10, 8, 9), at(2026, 10, 8, 10)),
      entry('night', 'p1', at(2026, 10, 7, 23), at(2026, 10, 8, 1)),
      entry('run', 'p2', now, null),
    ];
    expect(entriesInRange(entries, day, addDays(day, 1), now).map((e) => e.id)).toEqual(['run', 'a', 'night']);
  });
});

describe('totals', () => {
  it('clips entries to the range and counts the running entry until now', () => {
    const entries = [
      entry('night', 'p1', at(2026, 10, 7, 23), at(2026, 10, 8, 1)),
      entry('run', 'p2', at(2026, 10, 8, 14), null),
    ];
    expect(totalMs(entries, day, addDays(day, 1), now)).toBe(2 * HOUR);
    expect(totalsByProject(entries, day, addDays(day, 1), now)).toEqual({ p1: HOUR, p2: HOUR });
  });
});

describe('weekGrid', () => {
  it('builds rows per project with day and grand totals', () => {
    const entries = [
      entry('mon', 'p1', at(2026, 10, 5, 9), at(2026, 10, 5, 11)),
      entry('sun-night', 'p2', at(2026, 10, 11, 23), at(2026, 10, 12, 2)),
      entry('next-week', 'p1', at(2026, 10, 12, 9), at(2026, 10, 12, 10)),
    ];
    const grid = weekGrid(entries, at(2026, 10, 5), at(2026, 10, 13));
    expect(grid.days).toEqual([5, 6, 7, 8, 9, 10, 11].map((d) => at(2026, 10, d)));
    expect(grid.rows).toEqual([
      { projectId: 'p1', perDay: [2 * HOUR, 0, 0, 0, 0, 0, 0], total: 2 * HOUR },
      { projectId: 'p2', perDay: [0, 0, 0, 0, 0, 0, HOUR], total: HOUR },
    ]);
    expect(grid.dayTotals).toEqual([2 * HOUR, 0, 0, 0, 0, 0, HOUR]);
    expect(grid.total).toBe(3 * HOUR);
  });

  it('counts the whole 25-hour DST day', () => {
    const entries = [
      entry('morning', 'p1', at(2026, 10, 25), at(2026, 10, 25, 12)),
      entry('rest', 'p1', at(2026, 10, 25, 12), at(2026, 10, 26)),
    ];
    const grid = weekGrid(entries, at(2026, 10, 19), at(2026, 10, 27));
    expect(grid.days[6]).toBe(at(2026, 10, 25));
    expect(grid.dayTotals[6]).toBe(25 * HOUR);
  });
});

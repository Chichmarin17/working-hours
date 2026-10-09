import { describe, expect, it } from 'vitest';
import { deleteEntry, runningEntry, saveEntry, setNote, startTimer, stopTimer } from './entries';
import { HOUR, MINUTE, toIso } from './time';
import type { Entry, Project } from './types';

const T0 = new Date(2026, 9, 8, 9, 0).getTime();
const projects: Project[] = [
  { id: 'p1', name: 'job1', color: '#4f7cff', archived: false },
  { id: 'p2', name: 'job2', color: '#22a06b', archived: false },
];
const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const done = (id: string, projectId: string, start: number, end: number, source: Entry['source'] = 'manual'): Entry => ({
  id,
  projectId,
  start: toIso(start),
  end: toIso(end),
  source,
});

describe('timer', () => {
  it('starts a running entry', () => {
    expect(startTimer([], 'p1', T0, ids())).toEqual([
      { id: 'id1', projectId: 'p1', start: toIso(T0), end: null, source: 'timer' },
    ]);
  });

  it('does nothing when the same project is already running', () => {
    const entries = startTimer([], 'p1', T0, ids());
    expect(startTimer(entries, 'p1', T0 + HOUR, ids())).toBe(entries);
  });

  it('switching project stops the current entry and starts a new one', () => {
    const newId = ids();
    const entries = startTimer(startTimer([], 'p1', T0, newId), 'p2', T0 + HOUR, newId);
    expect(entries).toEqual([
      { id: 'id1', projectId: 'p1', start: toIso(T0), end: toIso(T0 + HOUR), source: 'timer' },
      { id: 'id2', projectId: 'p2', start: toIso(T0 + HOUR), end: null, source: 'timer' },
    ]);
  });

  it('stop sets the end', () => {
    const entries = stopTimer(startTimer([], 'p1', T0, ids()), T0 + 10 * MINUTE);
    expect(entries[0].end).toBe(toIso(T0 + 10 * MINUTE));
    expect(runningEntry(entries)).toBeUndefined();
  });

  it('stop without a running timer changes nothing', () => {
    const entries = [done('a', 'p1', T0, T0 + HOUR)];
    expect(stopTimer(entries, T0 + 2 * HOUR)).toBe(entries);
  });

  it('keeps timer entries shorter than a minute', () => {
    expect(stopTimer(startTimer([], 'p1', T0, ids()), T0 + 5_000)).toEqual([
      { id: 'id1', projectId: 'p1', start: toIso(T0), end: toIso(T0 + 5_000), source: 'timer' },
    ]);
  });

  it('keeps a short entry when switching projects quickly', () => {
    const newId = ids();
    const entries = startTimer(startTimer([], 'p1', T0, newId), 'p2', T0 + 10_000, newId);
    expect(entries.map((e) => [e.projectId, e.end])).toEqual([
      ['p1', toIso(T0 + 10_000)],
      ['p2', null],
    ]);
  });

  it('drops only a zero-length entry, which has nothing to record', () => {
    expect(stopTimer(startTimer([], 'p1', T0, ids()), T0)).toEqual([]);
  });

  it('setNote stores the note as typed and removes an empty one', () => {
    const entries = startTimer([], 'p1', T0, ids());
    const noted = setNote(entries, 'id1', 'fix bug ');
    expect(noted[0].note).toBe('fix bug ');
    expect('note' in setNote(noted, 'id1', '  ')[0]).toBe(false);
  });
});

describe('saveEntry', () => {
  const now = T0 + 10 * HOUR;
  const draft = (start: number, end: number, projectId = 'p1', note = '') => ({ projectId, start, end, note });

  it('adds a manual entry with a trimmed note', () => {
    expect(saveEntry([], projects, draft(T0, T0 + HOUR, 'p1', '  call  '), now, ids())).toEqual({
      ok: true,
      value: [{ id: 'id1', projectId: 'p1', start: toIso(T0), end: toIso(T0 + HOUR), note: 'call', source: 'manual' }],
    });
  });

  it('rejects an unknown project', () => {
    expect(saveEntry([], projects, draft(T0, T0 + HOUR, 'nope'), now, ids())).toEqual({
      ok: false,
      error: 'Choose a project.',
    });
  });

  it('rejects an end before or equal to the start', () => {
    expect(saveEntry([], projects, draft(T0, T0), now, ids())).toEqual({ ok: false, error: 'End must be after start.' });
  });

  it('rejects an end in the future', () => {
    expect(saveEntry([], projects, draft(T0, now + MINUTE), now, ids())).toEqual({
      ok: false,
      error: "End can't be in the future.",
    });
  });

  it('rejects entries longer than 24 hours and accepts exactly 24', () => {
    expect(saveEntry([], projects, draft(now - 26 * HOUR, now - HOUR), now, ids())).toEqual({
      ok: false,
      error: "An entry can't be longer than 24 hours.",
    });
    expect(saveEntry([], projects, draft(now - 25 * HOUR, now - HOUR), now, ids()).ok).toBe(true);
  });

  it('rejects an overlap and names the clashing entry', () => {
    const existing = [done('a', 'p2', T0, T0 + HOUR)];
    expect(saveEntry(existing, projects, draft(T0 + 30 * MINUTE, T0 + 2 * HOUR), now, ids())).toEqual({
      ok: false,
      error: 'Overlaps with job2, 2026-10-08 09:00–10:00.',
    });
  });

  it('allows touching boundaries', () => {
    const existing = [done('a', 'p2', T0, T0 + HOUR)];
    expect(saveEntry(existing, projects, draft(T0 + HOUR, T0 + 2 * HOUR), now, ids()).ok).toBe(true);
  });

  it('treats the running entry as lasting until now', () => {
    const running: Entry = { id: 'r', projectId: 'p2', start: toIso(T0), end: null, source: 'timer' };
    expect(saveEntry([running], projects, draft(now - HOUR, now - 30 * MINUTE), now, ids())).toEqual({
      ok: false,
      error: 'Overlaps with job2, 2026-10-08 09:00–now.',
    });
  });

  it('editing an entry does not clash with itself and keeps its source', () => {
    const existing = [done('a', 'p1', T0, T0 + HOUR, 'timer')];
    expect(saveEntry(existing, projects, draft(T0 + 15 * MINUTE, T0 + HOUR, 'p2', 'x'), now, ids(), 'a')).toEqual({
      ok: true,
      value: [
        { id: 'a', projectId: 'p2', start: toIso(T0 + 15 * MINUTE), end: toIso(T0 + HOUR), note: 'x', source: 'timer' },
      ],
    });
  });

  it('refuses to edit the running entry or a missing one', () => {
    const running: Entry = { id: 'r', projectId: 'p1', start: toIso(T0), end: null, source: 'timer' };
    expect(saveEntry([running], projects, draft(T0, T0 + HOUR), now, ids(), 'r')).toEqual({
      ok: false,
      error: 'Stop the timer before editing this entry.',
    });
    expect(saveEntry([], projects, draft(T0, T0 + HOUR), now, ids(), 'gone')).toEqual({
      ok: false,
      error: 'This entry no longer exists.',
    });
  });
});

describe('saveEntry with an untimed (duration-only) draft', () => {
  const day = new Date(2026, 9, 8).getTime(); // local midnight; T0 is 09:00 that day
  const untimed = (hours: number, projectId = 'p1') => ({ projectId, start: day, end: day + hours * HOUR, note: '', untimed: true });

  it('stores the untimed flag', () => {
    expect(saveEntry([], projects, untimed(1.5), T0, ids())).toEqual({
      ok: true,
      value: [{ id: 'id1', projectId: 'p1', start: toIso(day), end: toIso(day + 1.5 * HOUR), untimed: true, source: 'manual' }],
    });
  });

  it('never clashes with timed entries, in either direction', () => {
    const early = [done('a', 'p2', day, day + HOUR)];
    expect(saveEntry(early, projects, untimed(3), T0 + 10 * HOUR, ids()).ok).toBe(true);
    const withUntimed: Entry[] = [{ ...done('u', 'p1', day, day + 3 * HOUR), untimed: true }];
    expect(saveEntry(withUntimed, projects, { projectId: 'p2', start: day + HOUR, end: day + 2 * HOUR, note: '' }, T0, ids()).ok).toBe(true);
  });

  it('accepts today even when the duration reaches past now, but not a future date', () => {
    expect(saveEntry([], projects, untimed(12), T0, ids()).ok).toBe(true); // 12 h today, at 09:00
    expect(saveEntry([], projects, { ...untimed(1), start: day + 24 * HOUR, end: day + 25 * HOUR }, T0, ids())).toEqual({
      ok: false,
      error: "The date can't be in the future.",
    });
  });

  it('rejects more than 24 hours', () => {
    expect(saveEntry([], projects, untimed(25), T0, ids())).toEqual({
      ok: false,
      error: "An entry can't be longer than 24 hours.",
    });
  });

  it('editing switches between timed and untimed', () => {
    const timed = [done('a', 'p1', T0 - HOUR, T0 - 30 * MINUTE)];
    const toUntimed = saveEntry(timed, projects, untimed(2), T0, ids(), 'a');
    expect(toUntimed.ok && toUntimed.value[0].untimed).toBe(true);
    if (!toUntimed.ok) return;
    const back = saveEntry(toUntimed.value, projects, { projectId: 'p1', start: T0 - HOUR, end: T0, note: '' }, T0, ids(), 'a');
    expect(back.ok && 'untimed' in back.value[0]).toBe(false);
  });
});

describe('deleteEntry', () => {
  it('removes a finished entry but never the running one', () => {
    const running: Entry = { id: 'r', projectId: 'p1', start: toIso(T0 + 2 * HOUR), end: null, source: 'timer' };
    const entries = [done('a', 'p1', T0, T0 + HOUR), running];
    expect(deleteEntry(entries, 'a')).toEqual([running]);
    expect(deleteEntry(entries, 'r')).toEqual(entries);
  });
});

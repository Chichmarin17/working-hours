import { describe, expect, it } from 'vitest';
import { cleanPending, detectGap, mergeAway, resolveAway } from './away';
import { HOUR, MINUTE, toIso } from './time';
import type { Entry, PendingAway } from './types';

const T0 = new Date(2026, 9, 8, 9, 0).getTime();
const TH = 5 * MINUTE;
const running: Entry = { id: 'r', projectId: 'p1', start: toIso(T0), end: null, note: 'focus', source: 'timer' };
const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

describe('detectGap', () => {
  it('returns null without lastSeen or below the minimum gap', () => {
    expect(detectGap(null, T0, TH)).toBeNull();
    expect(detectGap(toIso(T0), T0 + TH - 1, TH)).toBeNull();
  });

  it('returns the period from lastSeen to now at or above the minimum gap', () => {
    expect(detectGap(toIso(T0), T0 + TH, TH)).toEqual({ from: T0, to: T0 + TH });
  });
});

describe('mergeAway', () => {
  it('creates a pending period for the running entry', () => {
    expect(mergeAway(null, [running], { from: T0 + HOUR, to: T0 + HOUR + 10 * MINUTE }, TH)).toEqual({
      entryId: 'r',
      from: toIso(T0 + HOUR),
      to: toIso(T0 + HOUR + 10 * MINUTE),
    });
  });

  it('ignores periods shorter than the threshold', () => {
    expect(mergeAway(null, [running], { from: T0 + HOUR, to: T0 + HOUR + 4 * MINUTE }, TH)).toBeNull();
  });

  it('ignores periods when no timer is running', () => {
    const stopped = { ...running, end: toIso(T0 + HOUR) };
    expect(mergeAway(null, [stopped], { from: T0, to: T0 + HOUR }, TH)).toBeNull();
  });

  it('never starts the away period before the timer started', () => {
    expect(mergeAway(null, [running], { from: T0 - HOUR, to: T0 + 10 * MINUTE }, TH)).toEqual({
      entryId: 'r',
      from: toIso(T0),
      to: toIso(T0 + 10 * MINUTE),
    });
    expect(mergeAway(null, [running], { from: T0 - HOUR, to: T0 + 2 * MINUTE }, TH)).toBeNull();
  });

  it('extends an existing pending period', () => {
    const pending: PendingAway = { entryId: 'r', from: toIso(T0 + HOUR), to: toIso(T0 + HOUR + 10 * MINUTE) };
    expect(mergeAway(pending, [running], { from: T0 + 2 * HOUR, to: T0 + 2 * HOUR + 6 * MINUTE }, TH)).toEqual({
      entryId: 'r',
      from: toIso(T0 + HOUR),
      to: toIso(T0 + 2 * HOUR + 6 * MINUTE),
    });
  });

  it('keeps the pending period when the new one is too short', () => {
    const pending: PendingAway = { entryId: 'r', from: toIso(T0 + HOUR), to: toIso(T0 + 2 * HOUR) };
    expect(mergeAway(pending, [running], { from: T0 + 3 * HOUR, to: T0 + 3 * HOUR + MINUTE }, TH)).toBe(pending);
  });
});

describe('cleanPending', () => {
  it('drops a pending period whose entry is no longer running', () => {
    const pending: PendingAway = { entryId: 'r', from: toIso(T0 + HOUR), to: toIso(T0 + 2 * HOUR) };
    expect(cleanPending(pending, [running])).toBe(pending);
    expect(cleanPending(pending, [{ ...running, end: toIso(T0 + 3 * HOUR) }])).toBeNull();
    expect(cleanPending(pending, [])).toBeNull();
  });
});

describe('resolveAway', () => {
  const pending: PendingAway = { entryId: 'r', from: toIso(T0 + HOUR), to: toIso(T0 + 2 * HOUR) };

  it('keep leaves the entries unchanged', () => {
    const entries = [running];
    expect(resolveAway(entries, pending, 'keep', ids())).toBe(entries);
  });

  it('stop ends the entry when I left', () => {
    expect(resolveAway([running], pending, 'stop', ids())).toEqual([{ ...running, end: toIso(T0 + HOUR) }]);
  });

  it('discard cuts the entry and continues from when I came back', () => {
    expect(resolveAway([running], pending, 'discard', ids())).toEqual([
      { ...running, end: toIso(T0 + HOUR) },
      { id: 'id1', projectId: 'p1', start: toIso(T0 + 2 * HOUR), end: null, note: 'focus', source: 'timer' },
    ]);
  });

  it('discard drops a cut entry shorter than a minute', () => {
    const early: PendingAway = { entryId: 'r', from: toIso(T0 + 30_000), to: toIso(T0 + HOUR) };
    expect(resolveAway([running], early, 'discard', ids())).toEqual([
      { id: 'id1', projectId: 'p1', start: toIso(T0 + HOUR), end: null, note: 'focus', source: 'timer' },
    ]);
  });
});

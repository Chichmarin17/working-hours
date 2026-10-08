import { describe, expect, it } from 'vitest';
import {
  awayAction,
  heartbeatAction,
  resolveAwayAction,
  saveEntryAction,
  setArchivedAction,
  startAction,
  stopAction,
  updateSettingsAction,
} from './appActions';
import { runningEntry } from './entries';
import { HOUR, MINUTE, toIso } from './time';
import type { AppData } from './types';
import { emptyData } from './types';

const T0 = new Date(2026, 9, 8, 9, 0).getTime();
const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const base = (): AppData => ({
  ...emptyData(),
  projects: [
    { id: 'p1', name: 'job1', color: '#4f7cff', archived: false },
    { id: 'p2', name: 'job2', color: '#22a06b', archived: false },
  ],
});
const withThreshold = (data: AppData, minutes: number) => ({
  ...data,
  settings: { ...data.settings, awayThresholdMinutes: minutes },
});

describe('timer actions', () => {
  it('start resets lastSeen so time before the start is never away', () => {
    const stale = { ...base(), lastSeen: toIso(T0 - 5 * HOUR) };
    const started = startAction(stale, 'p1', T0, ids());
    expect(started.lastSeen).toBe(toIso(T0));
    expect(heartbeatAction(started, T0 + 30_000).pendingAway).toBeNull();
  });

  it('stop clears lastSeen and any pending away period', () => {
    const started = startAction(base(), 'p1', T0, ids());
    const pending = { ...started, pendingAway: { entryId: 'id1', from: toIso(T0 + HOUR), to: toIso(T0 + 2 * HOUR) } };
    const stopped = stopAction(pending, T0 + 3 * HOUR);
    expect(stopped.lastSeen).toBeNull();
    expect(stopped.pendingAway).toBeNull();
    expect(runningEntry(stopped.entries)).toBeUndefined();
  });

  it('archiving the running project stops the timer', () => {
    const started = startAction(base(), 'p1', T0, ids());
    const result = setArchivedAction(started, 'p1', true, T0 + HOUR);
    if (!result.ok) throw new Error(result.error);
    expect(runningEntry(result.value.entries)).toBeUndefined();
    expect(result.value.entries[0].end).toBe(toIso(T0 + HOUR));
  });

  it('saveEntryAction passes validation errors through', () => {
    const draft = { projectId: 'p1', start: T0, end: T0, note: '' };
    expect(saveEntryAction(base(), draft, T0 + HOUR, ids())).toEqual({ ok: false, error: 'End must be after start.' });
  });
});

describe('updateSettingsAction', () => {
  it('clamps and rounds the threshold', () => {
    const threshold = (minutes: number) =>
      updateSettingsAction(base(), { awayThresholdMinutes: minutes }).settings.awayThresholdMinutes;
    expect(threshold(0)).toBe(1);
    expect(threshold(500)).toBe(120);
    expect(threshold(7.6)).toBe(8);
    expect(threshold(Number.NaN)).toBe(5);
  });
});

describe('heartbeatAction', () => {
  it('returns the same object when no timer runs and nothing is stored', () => {
    const data = base();
    expect(heartbeatAction(data, T0)).toBe(data);
  });

  it('records an away period after a long gap and updates lastSeen', () => {
    const started = startAction(base(), 'p1', T0, ids());
    const next = heartbeatAction(started, T0 + 10 * MINUTE);
    expect(next.pendingAway).toEqual({ entryId: 'id1', from: toIso(T0), to: toIso(T0 + 10 * MINUTE) });
    expect(next.lastSeen).toBe(toIso(T0 + 10 * MINUTE));
  });

  it('ignores a 70-second gap from background-tab throttling even with a 1-minute threshold', () => {
    const started = withThreshold(startAction(base(), 'p1', T0, ids()), 1);
    expect(heartbeatAction(started, T0 + 70_000).pendingAway).toBeNull();
  });

  it('still detects a 3-minute gap with a 1-minute threshold', () => {
    const started = withThreshold(startAction(base(), 'p1', T0, ids()), 1);
    expect(heartbeatAction(started, T0 + 3 * MINUTE).pendingAway).not.toBeNull();
  });
});

describe('away actions', () => {
  it('idle periods use the plain threshold', () => {
    const started = withThreshold(startAction(base(), 'p1', T0, ids()), 1);
    expect(awayAction(started, { from: T0 + HOUR, to: T0 + HOUR + 70_000 }).pendingAway).toEqual({
      entryId: 'id1',
      from: toIso(T0 + HOUR),
      to: toIso(T0 + HOUR + 70_000),
    });
  });

  const pendingData = () => {
    const started = startAction(base(), 'p1', T0, ids());
    return { ...started, pendingAway: { entryId: 'id1', from: toIso(T0 + HOUR), to: toIso(T0 + 2 * HOUR) } };
  };

  it('stop ends the timer when I left and clears lastSeen', () => {
    const next = resolveAwayAction(pendingData(), 'stop', T0 + 2 * HOUR, ids());
    expect(runningEntry(next.entries)).toBeUndefined();
    expect(next.entries[0].end).toBe(toIso(T0 + HOUR));
    expect(next.pendingAway).toBeNull();
    expect(next.lastSeen).toBeNull();
  });

  it('discard continues the timer from when I came back', () => {
    const next = resolveAwayAction(pendingData(), 'discard', T0 + 2 * HOUR + MINUTE, () => 'new');
    expect(runningEntry(next.entries)).toMatchObject({ id: 'new', projectId: 'p1', start: toIso(T0 + 2 * HOUR) });
    expect(next.pendingAway).toBeNull();
    expect(next.lastSeen).toBe(toIso(T0 + 2 * HOUR + MINUTE));
  });

  it('keep only clears the pending period', () => {
    const data = pendingData();
    const next = resolveAwayAction(data, 'keep', T0 + 2 * HOUR, ids());
    expect(next.entries).toBe(data.entries);
    expect(next.pendingAway).toBeNull();
  });
});

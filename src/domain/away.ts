import { closeEntry, runningEntry } from './entries';
import { toIso, toMs } from './time';
import type { Entry, PendingAway } from './types';

export type Period = { from: number; to: number };
export type AwayChoice = 'keep' | 'discard' | 'stop';

export function detectGap(lastSeen: string | null, now: number, minGapMs: number): Period | null {
  if (lastSeen === null) return null;
  const from = toMs(lastSeen);
  return now - from >= minGapMs ? { from, to: now } : null;
}

export function cleanPending(pending: PendingAway | null, entries: Entry[]): PendingAway | null {
  if (!pending) return null;
  return runningEntry(entries)?.id === pending.entryId ? pending : null;
}

/** Records an away period for the running entry, extending one that is already pending. */
export function mergeAway(
  pending: PendingAway | null,
  entries: Entry[],
  period: Period,
  thresholdMs: number,
): PendingAway | null {
  const current = cleanPending(pending, entries);
  const running = runningEntry(entries);
  if (!running) return null;
  const from = Math.max(period.from, toMs(running.start));
  if (period.to - from < thresholdMs) return current;
  if (current) {
    return {
      entryId: current.entryId,
      from: toIso(Math.min(from, toMs(current.from))),
      to: toIso(Math.max(period.to, toMs(current.to))),
    };
  }
  return { entryId: running.id, from: toIso(from), to: toIso(period.to) };
}

export function resolveAway(entries: Entry[], pending: PendingAway, choice: AwayChoice, newId: () => string): Entry[] {
  const entry = entries.find((e) => e.id === pending.entryId && e.end === null);
  if (!entry || choice === 'keep') return entries;
  const closed = closeEntry(entries, entry.id, toMs(pending.from));
  if (choice === 'stop') return closed;
  return [
    ...closed,
    {
      id: newId(),
      projectId: entry.projectId,
      start: pending.to,
      end: null,
      ...(entry.note ? { note: entry.note } : {}),
      source: 'timer',
    },
  ];
}

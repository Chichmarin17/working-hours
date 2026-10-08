import { dayKey, HOUR, MINUTE, overlapMs, timeOfDay, toIso, toMs } from './time';
import type { Entry, Project, Result } from './types';
import { err, ok } from './types';

export const TINY_MS = MINUTE;
export const MAX_ENTRY_MS = 24 * HOUR;

export type EntryDraft = { projectId: string; start: number; end: number; note: string };

export function runningEntry(entries: Entry[]): Entry | undefined {
  return entries.find((e) => e.end === null);
}

export function entryEndMs(entry: Entry, now: number): number {
  return entry.end === null ? now : toMs(entry.end);
}

/** Sets an entry's end; timer entries shorter than TINY_MS are removed instead. */
export function closeEntry(entries: Entry[], entryId: string, endMs: number): Entry[] {
  return entries.flatMap((e) => {
    if (e.id !== entryId) return [e];
    if (e.source === 'timer' && endMs - toMs(e.start) < TINY_MS) return [];
    return [{ ...e, end: toIso(endMs) }];
  });
}

export function startTimer(entries: Entry[], projectId: string, now: number, newId: () => string): Entry[] {
  const running = runningEntry(entries);
  if (running?.projectId === projectId) return entries;
  const base = running ? closeEntry(entries, running.id, now) : entries;
  return [...base, { id: newId(), projectId, start: toIso(now), end: null, source: 'timer' }];
}

export function stopTimer(entries: Entry[], now: number): Entry[] {
  const running = runningEntry(entries);
  return running ? closeEntry(entries, running.id, now) : entries;
}

function withNote(entry: Entry, note: string): Entry {
  const copy: Entry = { ...entry };
  if (note.trim()) copy.note = note;
  else delete copy.note;
  return copy;
}

export function setNote(entries: Entry[], entryId: string, note: string): Entry[] {
  return entries.map((e) => (e.id === entryId ? withNote(e, note) : e));
}

export function describeEntry(entry: Entry, projects: Project[]): string {
  const name = projects.find((p) => p.id === entry.projectId)?.name ?? 'Unknown project';
  const start = toMs(entry.start);
  const end = entry.end === null ? 'now' : timeOfDay(toMs(entry.end));
  return `${name}, ${dayKey(start)} ${timeOfDay(start)}–${end}`;
}

function findOverlap(entries: Entry[], start: number, end: number, now: number, ignoreId?: string): Entry | undefined {
  return entries.find((e) => e.id !== ignoreId && overlapMs(start, end, toMs(e.start), entryEndMs(e, now)) > 0);
}

/** Adds a manual entry, or updates `editingId`, after validating the draft. */
export function saveEntry(
  entries: Entry[],
  projects: Project[],
  draft: EntryDraft,
  now: number,
  newId: () => string,
  editingId?: string,
): Result<Entry[]> {
  if (!projects.some((p) => p.id === draft.projectId)) return err('Choose a project.');
  const existing = editingId === undefined ? undefined : entries.find((e) => e.id === editingId);
  if (editingId !== undefined && !existing) return err('This entry no longer exists.');
  if (existing?.end === null) return err('Stop the timer before editing this entry.');
  if (!(draft.end > draft.start)) return err('End must be after start.');
  if (draft.end > now) return err("End can't be in the future.");
  if (draft.end - draft.start > MAX_ENTRY_MS) return err("An entry can't be longer than 24 hours.");
  const clash = findOverlap(entries, draft.start, draft.end, now, editingId);
  if (clash) return err(`Overlaps with ${describeEntry(clash, projects)}.`);

  const fields = { projectId: draft.projectId, start: toIso(draft.start), end: toIso(draft.end) };
  const note = draft.note.trim();
  if (existing) {
    const updated = withNote({ ...existing, ...fields }, note);
    return ok(entries.map((e) => (e.id === existing.id ? updated : e)));
  }
  return ok([...entries, withNote({ id: newId(), ...fields, source: 'manual' }, note)]);
}

export function deleteEntry(entries: Entry[], entryId: string): Entry[] {
  return entries.filter((e) => e.id !== entryId || e.end === null);
}

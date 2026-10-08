import { type AwayChoice, cleanPending, detectGap, mergeAway, type Period, resolveAway } from './away';
import { deleteEntry, type EntryDraft, runningEntry, saveEntry, setNote, startTimer, stopTimer } from './entries';
import { addProject, renameProject, setArchived, setProjectColor } from './projects';
import { MINUTE, toIso } from './time';
import type { AppData, Entry, Result, Settings } from './types';
import { DEFAULT_SETTINGS, ok } from './types';

type NewId = () => string;

/** Chrome ticks background tabs about once a minute; shorter gaps are not absences. */
export const HEARTBEAT_MIN_GAP_MS = 2 * MINUTE;

const thresholdMs = (settings: Settings) => settings.awayThresholdMinutes * MINUTE;

/** Replaces entries and drops away state that no longer applies. */
function withEntries(data: AppData, entries: Entry[]): AppData {
  const running = runningEntry(entries);
  return {
    ...data,
    entries,
    pendingAway: cleanPending(data.pendingAway, entries),
    lastSeen: running ? data.lastSeen : null,
  };
}

export function startAction(data: AppData, projectId: string, now: number, newId: NewId): AppData {
  const entries = startTimer(data.entries, projectId, now, newId);
  if (entries === data.entries) return data;
  return { ...withEntries(data, entries), lastSeen: toIso(now) };
}

export function stopAction(data: AppData, now: number): AppData {
  const entries = stopTimer(data.entries, now);
  return entries === data.entries ? data : withEntries(data, entries);
}

export function setNoteAction(data: AppData, note: string): AppData {
  const running = runningEntry(data.entries);
  return running ? { ...data, entries: setNote(data.entries, running.id, note) } : data;
}

export function saveEntryAction(
  data: AppData,
  draft: EntryDraft,
  now: number,
  newId: NewId,
  editingId?: string,
): Result<AppData> {
  const result = saveEntry(data.entries, data.projects, draft, now, newId, editingId);
  return result.ok ? ok(withEntries(data, result.value)) : result;
}

export function deleteEntryAction(data: AppData, entryId: string): AppData {
  return withEntries(data, deleteEntry(data.entries, entryId));
}

export function addProjectAction(data: AppData, name: string, newId: NewId): Result<AppData> {
  const result = addProject(data.projects, name, newId);
  return result.ok ? ok({ ...data, projects: result.value }) : result;
}

export function renameProjectAction(data: AppData, id: string, name: string): Result<AppData> {
  const result = renameProject(data.projects, id, name);
  return result.ok ? ok({ ...data, projects: result.value }) : result;
}

export function setProjectColorAction(data: AppData, id: string, color: string): AppData {
  return { ...data, projects: setProjectColor(data.projects, id, color) };
}

export function setArchivedAction(data: AppData, id: string, archived: boolean, now: number): Result<AppData> {
  const result = setArchived(data.projects, id, archived);
  if (!result.ok) return result;
  const next = { ...data, projects: result.value };
  return ok(archived && runningEntry(data.entries)?.projectId === id ? stopAction(next, now) : next);
}

export function updateSettingsAction(data: AppData, patch: Partial<Settings>): AppData {
  const merged = { ...data.settings, ...patch };
  const minutes = Number.isFinite(merged.awayThresholdMinutes)
    ? Math.min(120, Math.max(1, Math.round(merged.awayThresholdMinutes)))
    : DEFAULT_SETTINGS.awayThresholdMinutes;
  return { ...data, settings: { ...merged, awayThresholdMinutes: minutes } };
}

export function heartbeatAction(data: AppData, now: number): AppData {
  if (!runningEntry(data.entries)) {
    return data.lastSeen === null && data.pendingAway === null ? data : { ...data, lastSeen: null, pendingAway: null };
  }
  const threshold = thresholdMs(data.settings);
  const gap = detectGap(data.lastSeen, now, Math.max(threshold, HEARTBEAT_MIN_GAP_MS));
  const pendingAway = gap
    ? mergeAway(data.pendingAway, data.entries, gap, threshold)
    : cleanPending(data.pendingAway, data.entries);
  return { ...data, pendingAway, lastSeen: toIso(now) };
}

export function awayAction(data: AppData, period: Period): AppData {
  const pendingAway = mergeAway(data.pendingAway, data.entries, period, thresholdMs(data.settings));
  return pendingAway === data.pendingAway ? data : { ...data, pendingAway };
}

export function resolveAwayAction(data: AppData, choice: AwayChoice, now: number, newId: NewId): AppData {
  if (!data.pendingAway) return data;
  const entries = resolveAway(data.entries, data.pendingAway, choice, newId);
  const next = withEntries({ ...data, pendingAway: null }, entries);
  return runningEntry(entries) ? { ...next, lastSeen: toIso(now) } : next;
}

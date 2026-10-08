import { parseAppData } from '../domain/backup';
import type { AppData } from '../domain/types';
import { emptyData } from '../domain/types';

export const STORAGE_KEY = 'working-hours:v1';

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type LoadResult = { data: AppData; warning: string | null };

export function loadData(storage: KeyValueStorage, now: number): LoadResult {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return { data: emptyData(), warning: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return keepCorrupt(storage, raw, now, 'not valid JSON');
  }
  const result = parseAppData(parsed);
  return result.ok ? { data: result.value, warning: null } : keepCorrupt(storage, raw, now, result.error);
}

/** Never lose unreadable data: copy it aside before the app starts empty. */
function keepCorrupt(storage: KeyValueStorage, raw: string, now: number, reason: string): LoadResult {
  const backupKey = `${STORAGE_KEY}:corrupt-${now}`;
  storage.setItem(backupKey, raw);
  return {
    data: emptyData(),
    warning: `Saved data could not be read (${reason}). A copy was kept in localStorage under "${backupKey}". Starting empty.`,
  };
}

export function saveData(storage: KeyValueStorage, data: AppData): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

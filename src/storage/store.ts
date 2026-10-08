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

/** Writes the data and returns the exact string stored. */
export function saveData(storage: KeyValueStorage, data: AppData): string {
  const raw = JSON.stringify(data);
  storage.setItem(STORAGE_KEY, raw);
  return raw;
}

export type SyncedStore = {
  data(): AppData;
  /** Adopts data written by another tab or by hand since this store last read or wrote it. */
  refresh(now: number): { changed: boolean; warning: string | null };
  /** Saves; may throw (e.g. quota exceeded) after `data()` already returns `next`. */
  save(next: AppData): void;
};

/** A store that never writes an older in-memory copy over newer stored data, as long as callers refresh first. */
export function openStore(storage: KeyValueStorage, now: number): { store: SyncedStore; warning: string | null } {
  const loaded = loadData(storage, now);
  let data = loaded.data;
  let lastRaw = storage.getItem(STORAGE_KEY);
  const store: SyncedStore = {
    data: () => data,
    refresh(at) {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null || raw === lastRaw) return { changed: false, warning: null };
      lastRaw = raw;
      const fresh = loadData(storage, at);
      if (fresh.warning) return { changed: false, warning: fresh.warning };
      data = fresh.data;
      return { changed: true, warning: null };
    },
    save(next) {
      data = next;
      lastRaw = saveData(storage, next);
    },
  };
  return { store, warning: loaded.warning };
}

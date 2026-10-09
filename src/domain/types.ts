export type Project = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
};

export type EntrySource = 'timer' | 'manual';

export type Entry = {
  id: string;
  projectId: string;
  start: string; // ISO 8601 (UTC)
  end: string | null; // null = running timer
  note?: string;
  /** Duration-only entry: no real times; stored from local midnight of its date. */
  untimed?: true;
  source: EntrySource;
};

export type Settings = {
  awayThresholdMinutes: number;
  idleDetectionEnabled: boolean;
};

export type PendingAway = {
  entryId: string;
  from: string;
  to: string;
};

export type AppData = {
  version: 1;
  projects: Project[];
  entries: Entry[];
  settings: Settings;
  pendingAway: PendingAway | null;
  lastSeen: string | null;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const err = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const DEFAULT_SETTINGS: Settings = {
  awayThresholdMinutes: 5,
  idleDetectionEnabled: false,
};

export function emptyData(): AppData {
  return {
    version: 1,
    projects: [],
    entries: [],
    settings: { ...DEFAULT_SETTINGS },
    pendingAway: null,
    lastSeen: null,
  };
}

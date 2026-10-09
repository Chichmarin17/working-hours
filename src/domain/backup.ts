import { cleanPending } from './away';
import { dayKey, MINUTE, timeOfDay, toMs } from './time';
import type { AppData, Entry, EntrySource, PendingAway, Project, Result, Settings } from './types';
import { DEFAULT_SETTINGS, err, ok } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

function parseProject(p: unknown): Project | null {
  if (!isObj(p)) return null;
  const { id, name, color, archived } = p;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof color !== 'string' || typeof archived !== 'boolean') {
    return null;
  }
  return { id, name, color, archived };
}

function parseEntry(e: unknown): Entry | null {
  if (!isObj(e)) return null;
  const { id, projectId, start, end, note, source, untimed } = e;
  if (typeof id !== 'string' || typeof projectId !== 'string' || !isIso(start)) return null;
  if (!(end === null || isIso(end))) return null;
  if (source !== 'timer' && source !== 'manual') return null;
  if (note !== undefined && typeof note !== 'string') return null;
  if (untimed !== undefined && typeof untimed !== 'boolean') return null;
  return {
    id,
    projectId,
    start,
    end,
    source: source as EntrySource,
    ...(note ? { note } : {}),
    ...(untimed ? { untimed: true as const } : {}),
  };
}

function parseSettings(s: unknown): Settings | null {
  if (s === undefined) return { ...DEFAULT_SETTINGS };
  if (!isObj(s)) return null;
  const { awayThresholdMinutes: minutes, idleDetectionEnabled: idle } = s;
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > 120) return null;
  if (typeof idle !== 'boolean') return null;
  return { awayThresholdMinutes: minutes, idleDetectionEnabled: idle };
}

function parsePending(p: unknown): PendingAway | null {
  if (!isObj(p)) return null;
  const { entryId, from, to } = p;
  return typeof entryId === 'string' && isIso(from) && isIso(to) ? { entryId, from, to } : null;
}

export function parseAppData(raw: unknown): Result<AppData> {
  if (!isObj(raw)) return err('Not a Working Hours backup (expected a JSON object).');
  if (raw.version !== 1) return err(`Unsupported backup version: ${String(raw.version)}.`);
  if (!Array.isArray(raw.projects)) return err('"projects" must be a list.');
  if (!Array.isArray(raw.entries)) return err('"entries" must be a list.');

  const projects: Project[] = [];
  for (const [i, p] of raw.projects.entries()) {
    const project = parseProject(p);
    if (!project) return err(`projects[${i}] is invalid.`);
    projects.push(project);
  }
  const projectIds = new Set(projects.map((p) => p.id));
  if (projectIds.size !== projects.length) return err('Project ids must be unique.');

  const entries: Entry[] = [];
  for (const [i, e] of raw.entries.entries()) {
    const entry = parseEntry(e);
    if (!entry) return err(`entries[${i}] is invalid.`);
    if (!projectIds.has(entry.projectId)) return err(`entries[${i}] refers to an unknown project.`);
    if (entry.end !== null && toMs(entry.end) <= toMs(entry.start)) return err(`entries[${i}] ends before it starts.`);
    entries.push(entry);
  }
  if (new Set(entries.map((e) => e.id)).size !== entries.length) return err('Entry ids must be unique.');
  if (entries.filter((e) => e.end === null).length > 1) return err('More than one running timer.');

  const settings = parseSettings(raw.settings);
  if (!settings) return err('settings are invalid.');

  const lastSeen = raw.lastSeen ?? null;
  if (lastSeen !== null && !isIso(lastSeen)) return err('lastSeen is invalid.');

  const pendingAway = cleanPending(parsePending(raw.pendingAway), entries);
  return ok({ version: 1, projects, entries, settings, pendingAway, lastSeen });
}

export function toJson(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

const CSV_HEADER = ['date', 'project', 'start', 'end', 'duration_minutes', 'note', 'source'];
const csvField = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const localStamp = (ms: number) => `${dayKey(ms)} ${timeOfDay(ms)}`;

export function toCsv(data: AppData): string {
  const names = new Map(data.projects.map((p) => [p.id, p.name]));
  const rows = data.entries
    .filter((e): e is Entry & { end: string } => e.end !== null)
    .sort((a, b) => toMs(a.start) - toMs(b.start))
    .map((e) => {
      const start = toMs(e.start);
      const end = toMs(e.end);
      return [
        dayKey(start),
        names.get(e.projectId) ?? '',
        e.untimed ? '' : localStamp(start),
        e.untimed ? '' : localStamp(end),
        String(Math.round((end - start) / MINUTE)),
        e.note ?? '',
        e.source,
      ];
    });
  // The BOM makes Excel read the file as UTF-8, so non-Latin notes stay readable.
  return '﻿' + [CSV_HEADER, ...rows].map((row) => row.map(csvField).join(',')).join('\n') + '\n';
}

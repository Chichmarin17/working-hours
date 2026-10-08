import { describe, expect, it } from 'vitest';
import { parseAppData, toCsv, toJson } from './backup';
import type { AppData } from './types';
import { DEFAULT_SETTINGS } from './types';

const valid = (): AppData => ({
  version: 1,
  projects: [{ id: 'p1', name: 'job1', color: '#4f7cff', archived: false }],
  entries: [
    {
      id: 'e1',
      projectId: 'p1',
      start: '2026-10-08T07:00:00.000Z',
      end: '2026-10-08T08:00:00.000Z',
      note: 'a, "quoted"\nnote',
      source: 'manual',
    },
    { id: 'e2', projectId: 'p1', start: '2026-10-08T09:00:00.000Z', end: null, source: 'timer' },
  ],
  settings: { awayThresholdMinutes: 5, idleDetectionEnabled: false },
  pendingAway: null,
  lastSeen: '2026-10-08T09:30:00.000Z',
});

describe('parseAppData', () => {
  it('accepts a valid backup after a JSON round trip', () => {
    const data = valid();
    expect(parseAppData(JSON.parse(toJson(data)))).toEqual({ ok: true, value: data });
  });

  it('fills defaults for missing settings, pendingAway and lastSeen', () => {
    const { settings: _settings, pendingAway: _pending, lastSeen: _seen, ...rest } = valid();
    const result = parseAppData(rest);
    expect(result.ok && result.value.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.ok && result.value.lastSeen).toBeNull();
  });

  it('drops a pending away period that does not belong to the running entry', () => {
    const raw = { ...valid(), pendingAway: { entryId: 'e1', from: '2026-10-08T07:10:00.000Z', to: '2026-10-08T07:30:00.000Z' } };
    const result = parseAppData(raw);
    expect(result.ok && result.value.pendingAway).toBeNull();
  });

  const e1 = valid().entries[0];
  const e2 = valid().entries[1];
  it.each([
    ['a non-object', [], 'Not a Working Hours backup (expected a JSON object).'],
    ['another version', { ...valid(), version: 2 }, 'Unsupported backup version: 2.'],
    ['a broken project', { ...valid(), projects: [{ id: 'p1' }] }, 'projects[0] is invalid.'],
    ['a bad date', { ...valid(), entries: [{ ...e1, start: 'yesterday' }] }, 'entries[0] is invalid.'],
    ['an unknown project', { ...valid(), entries: [{ ...e1, projectId: 'zz' }] }, 'entries[0] refers to an unknown project.'],
    ['an entry ending before it starts', { ...valid(), entries: [{ ...e1, end: e1.start }] }, 'entries[0] ends before it starts.'],
    ['duplicate entry ids', { ...valid(), entries: [e1, e1] }, 'Entry ids must be unique.'],
    ['two running timers', { ...valid(), entries: [e2, { ...e2, id: 'e3' }] }, 'More than one running timer.'],
    ['a bad threshold', { ...valid(), settings: { awayThresholdMinutes: 0, idleDetectionEnabled: false } }, 'settings are invalid.'],
    ['a bad lastSeen', { ...valid(), lastSeen: 'soon' }, 'lastSeen is invalid.'],
  ])('rejects %s', (_label, raw, error) => {
    expect(parseAppData(raw)).toEqual({ ok: false, error });
  });
});

describe('toCsv', () => {
  it('exports finished entries in local time and escapes notes', () => {
    expect(toCsv(valid())).toBe(
      '﻿' + // BOM so Excel reads non-Latin text (e.g. Cyrillic) as UTF-8
        'date,project,start,end,duration_minutes,note,source\n' +
        '2026-10-08,job1,2026-10-08 09:00,2026-10-08 10:00,60,"a, ""quoted""\nnote",manual\n',
    );
  });

  it('escapes project names too', () => {
    const data = valid();
    data.projects[0].name = 'Acme, Inc';
    expect(toCsv(data).split('\n')[1]).toContain(',"Acme, Inc",');
  });
});

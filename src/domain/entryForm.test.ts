import { describe, expect, it } from 'vitest';
import { draftFromForm, emptyForm, type EntryFormValues, formFromEntry } from './entryForm';
import { toIso } from './time';
import type { Entry } from './types';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const base: EntryFormValues = {
  projectId: 'p1',
  date: '2026-10-08',
  startTime: '09:00',
  endTime: '',
  duration: '',
  note: 'n',
};

describe('draftFromForm', () => {
  it('uses the end time', () => {
    expect(draftFromForm({ ...base, endTime: '10:30' })).toEqual({
      ok: true,
      value: { projectId: 'p1', start: at(2026, 10, 8, 9), end: at(2026, 10, 8, 10, 30), note: 'n' },
    });
  });

  it('reads an end time earlier than the start as the next day', () => {
    const result = draftFromForm({ ...base, startTime: '23:00', endTime: '01:00' });
    expect(result.ok && result.value.end).toBe(at(2026, 10, 9, 1));
  });

  it('does not move an end time equal to the start to the next day', () => {
    const result = draftFromForm({ ...base, endTime: '09:00' });
    expect(result.ok && result.value.end).toBe(at(2026, 10, 8, 9));
  });

  it('uses the duration when no end time is given', () => {
    const result = draftFromForm({ ...base, duration: '75' });
    expect(result.ok && result.value.end).toBe(at(2026, 10, 8, 10, 15));
  });

  it('prefers the end time over the duration', () => {
    const result = draftFromForm({ ...base, endTime: '10:00', duration: '300' });
    expect(result.ok && result.value.end).toBe(at(2026, 10, 8, 10));
  });

  it('a duration without times gives an untimed entry starting at local midnight', () => {
    expect(draftFromForm({ ...base, startTime: '', duration: '90' })).toEqual({
      ok: true,
      value: { projectId: 'p1', start: at(2026, 10, 8), end: at(2026, 10, 8, 1, 30), note: 'n', untimed: true },
    });
  });

  it('rejects an end time without a start time', () => {
    expect(draftFromForm({ ...base, startTime: '', endTime: '10:00', duration: '60' })).toEqual({
      ok: false,
      error: 'Enter a start time too, or leave both times empty.',
    });
  });

  it('reports missing or invalid values', () => {
    expect(draftFromForm({ ...base, startTime: '' })).toEqual({ ok: false, error: 'Enter the duration in minutes.' });
    expect(draftFromForm({ ...base, date: '', duration: '60' })).toEqual({ ok: false, error: 'Enter a valid date.' });
    expect(draftFromForm(base)).toEqual({ ok: false, error: 'Enter an end time or a duration.' });
    expect(draftFromForm({ ...base, duration: '1:30' })).toEqual({
      ok: false,
      error: 'Enter the duration in minutes, e.g. 15.',
    });
    expect(draftFromForm({ ...base, duration: '0' })).toEqual({
      ok: false,
      error: 'Enter the duration in minutes, e.g. 15.',
    });
  });
});

describe('formFromEntry', () => {
  it('round-trips an entry that crosses midnight', () => {
    const entry: Entry = {
      id: 'a',
      projectId: 'p1',
      start: toIso(at(2026, 10, 8, 23)),
      end: toIso(at(2026, 10, 9, 1)),
      note: 'late',
      source: 'manual',
    };
    const values = formFromEntry(entry);
    expect(values).toEqual({
      projectId: 'p1',
      date: '2026-10-08',
      startTime: '23:00',
      endTime: '01:00',
      duration: '',
      note: 'late',
    });
    expect(draftFromForm(values)).toEqual({
      ok: true,
      value: { projectId: 'p1', start: at(2026, 10, 8, 23), end: at(2026, 10, 9, 1), note: 'late' },
    });
  });
});

describe('formFromEntry for an untimed entry', () => {
  it('fills the duration and leaves the times empty', () => {
    const entry: Entry = {
      id: 'u',
      projectId: 'p1',
      start: toIso(at(2026, 10, 8)),
      end: toIso(at(2026, 10, 8, 2, 15)),
      untimed: true,
      source: 'manual',
    };
    const values = formFromEntry(entry);
    expect(values).toEqual({ projectId: 'p1', date: '2026-10-08', startTime: '', endTime: '', duration: '135', note: '' });
    expect(draftFromForm(values)).toEqual({
      ok: true,
      value: { projectId: 'p1', start: at(2026, 10, 8), end: at(2026, 10, 8, 2, 15), note: '', untimed: true },
    });
  });
});

describe('emptyForm', () => {
  it('starts on the given day with the given project', () => {
    expect(emptyForm('p2', at(2026, 10, 8, 14))).toEqual({
      projectId: 'p2',
      date: '2026-10-08',
      startTime: '',
      endTime: '',
      duration: '',
      note: '',
    });
  });
});

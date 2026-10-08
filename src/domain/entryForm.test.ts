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
    const result = draftFromForm({ ...base, duration: '1:15' });
    expect(result.ok && result.value.end).toBe(at(2026, 10, 8, 10, 15));
  });

  it('prefers the end time over the duration', () => {
    const result = draftFromForm({ ...base, endTime: '10:00', duration: '5:00' });
    expect(result.ok && result.value.end).toBe(at(2026, 10, 8, 10));
  });

  it('reports missing or invalid values', () => {
    expect(draftFromForm({ ...base, startTime: '' })).toEqual({ ok: false, error: 'Enter a valid date and start time.' });
    expect(draftFromForm(base)).toEqual({ ok: false, error: 'Enter an end time or a duration.' });
    expect(draftFromForm({ ...base, duration: '90' })).toEqual({
      ok: false,
      error: 'Enter the duration as h:mm, e.g. 1:30.',
    });
    expect(draftFromForm({ ...base, duration: '0:00' })).toEqual({
      ok: false,
      error: 'Enter the duration as h:mm, e.g. 1:30.',
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

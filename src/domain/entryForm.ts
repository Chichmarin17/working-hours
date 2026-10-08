import type { EntryDraft } from './entries';
import { addDays, dayKey, localDateTime, parseHM, timeOfDay, toMs } from './time';
import type { Entry, Result } from './types';
import { err, ok } from './types';

export type EntryFormValues = {
  projectId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM, wins over duration when set
  duration: string; // h:mm
  note: string;
};

export function draftFromForm(values: EntryFormValues): Result<EntryDraft> {
  const start = localDateTime(values.date, values.startTime);
  if (start === null) return err('Enter a valid date and start time.');

  let end: number;
  if (values.endTime.trim()) {
    const sameDay = localDateTime(values.date, values.endTime);
    if (sameDay === null) return err('Enter a valid end time (HH:MM).');
    end = sameDay < start ? addDays(sameDay, 1) : sameDay;
  } else if (values.duration.trim()) {
    const duration = parseHM(values.duration);
    if (!duration) return err('Enter the duration as h:mm, e.g. 1:30.');
    end = start + duration;
  } else {
    return err('Enter an end time or a duration.');
  }

  return ok({ projectId: values.projectId, start, end, note: values.note });
}

export function formFromEntry(entry: Entry): EntryFormValues {
  const start = toMs(entry.start);
  return {
    projectId: entry.projectId,
    date: dayKey(start),
    startTime: timeOfDay(start),
    endTime: entry.end === null ? '' : timeOfDay(toMs(entry.end)),
    duration: '',
    note: entry.note ?? '',
  };
}

export function emptyForm(projectId: string, day: number): EntryFormValues {
  return { projectId, date: dayKey(day), startTime: '', endTime: '', duration: '', note: '' };
}

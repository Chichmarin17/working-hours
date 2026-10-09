import type { EntryDraft } from './entries';
import { addDays, dayKey, formatHM, localDateTime, parseHM, timeOfDay, toMs } from './time';
import type { Entry, Result } from './types';
import { err, ok } from './types';

export type EntryFormValues = {
  projectId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM, optional: empty means a duration-only entry
  endTime: string; // HH:MM, optional; with a start time it wins over duration
  duration: string; // h:mm
  note: string;
};

export function draftFromForm(values: EntryFormValues): Result<EntryDraft> {
  if (localDateTime(values.date, '00:00') === null) return err('Enter a valid date.');
  if (!values.startTime.trim()) {
    if (values.endTime.trim()) return err('Enter a start time too, or leave both times empty.');
    if (!values.duration.trim()) return err('Enter a duration (h:mm).');
    const duration = parseHM(values.duration);
    if (!duration) return err('Enter the duration as h:mm, e.g. 1:30.');
    const midnight = localDateTime(values.date, '00:00')!;
    return ok({ projectId: values.projectId, start: midnight, end: midnight + duration, note: values.note, untimed: true });
  }

  const start = localDateTime(values.date, values.startTime);
  if (start === null) return err('Enter a valid start time (HH:MM).');

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
  if (entry.untimed && entry.end !== null) {
    const duration = formatHM(toMs(entry.end) - start);
    return { projectId: entry.projectId, date: dayKey(start), startTime: '', endTime: '', duration, note: entry.note ?? '' };
  }
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

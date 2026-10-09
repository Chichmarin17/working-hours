export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

const pad = (n: number) => String(n).padStart(2, '0');

export const toMs = (iso: string): number => Date.parse(iso);
export const toIso = (ms: number): string => new Date(ms).toISOString();

export function formatHM(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / MINUTE);
  return `${Math.floor(totalMinutes / 60)}:${pad(totalMinutes % 60)}`;
}

/** Like formatHM, but shows entries under a minute in seconds ("42s") so they don't look empty. */
export function formatEntryDuration(ms: number): string {
  return ms < MINUTE ? `${Math.floor(Math.max(0, ms) / SECOND)}s` : formatHM(ms);
}

export function formatHMS(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / SECOND);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}:${pad(m)}:${pad(totalSeconds % 60)}`;
}

/** Parses a whole number of minutes ("15", "120") into milliseconds; anything else returns null. */
export function parseMinutes(text: string): number | null {
  const match = /^\d{1,4}$/.exec(text.trim());
  if (!match) return null;
  const minutes = Number(match[0]);
  return minutes > 0 ? minutes * MINUTE : null;
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Adds calendar days in local time (a DST day is 23 or 25 hours long). */
export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  ).getTime();
}

/** Local midnight of the Monday of the week containing `ms`. */
export function startOfWeek(ms: number): number {
  const day = startOfDay(ms);
  const daysSinceMonday = (new Date(day).getDay() + 6) % 7;
  return addDays(day, -daysSinceMonday);
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeOfDay(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Combines "YYYY-MM-DD" and "HH:MM" into a local timestamp, or null if invalid. */
export function localDateTime(date: string, time: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [year, month, day, hours, minutes] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  if (hours > 23 || minutes > 59) return null;
  const result = new Date(year, month - 1, day, hours, minutes);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) return null;
  return result.getTime();
}

export function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

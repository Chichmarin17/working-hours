import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKey,
  formatEntryDuration,
  formatHM,
  formatHMS,
  HOUR,
  localDateTime,
  MINUTE,
  overlapMs,
  parseHM,
  startOfDay,
  startOfWeek,
  timeOfDay,
} from './time';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('formatHM', () => {
  it('formats hours and two-digit minutes', () => {
    expect(formatHM(7 * MINUTE)).toBe('0:07');
    expect(formatHM(12 * HOUR + 30 * MINUTE)).toBe('12:30');
  });

  it('rounds partial minutes down and never goes negative', () => {
    expect(formatHM(59_999)).toBe('0:00');
    expect(formatHM(-5 * MINUTE)).toBe('0:00');
  });
});

describe('formatHMS', () => {
  it('formats hours, minutes and seconds', () => {
    expect(formatHMS(HOUR + 24 * MINUTE + 5_000)).toBe('1:24:05');
    expect(formatHMS(-1)).toBe('0:00:00');
  });
});

describe('formatEntryDuration', () => {
  it('shows seconds under a minute and h:mm from a minute on', () => {
    expect(formatEntryDuration(42_000)).toBe('42s');
    expect(formatEntryDuration(999)).toBe('0s');
    expect(formatEntryDuration(MINUTE)).toBe('0:01');
    expect(formatEntryDuration(HOUR + 5 * MINUTE)).toBe('1:05');
  });
});

describe('parseHM', () => {
  it('parses h:mm', () => {
    expect(parseHM('1:30')).toBe(90 * MINUTE);
    expect(parseHM(' 0:45 ')).toBe(45 * MINUTE);
  });

  it('rejects other formats', () => {
    for (const text of ['', '90', '1:5', '1:60', 'a:bc', '-1:00']) {
      expect(parseHM(text)).toBeNull();
    }
  });
});

describe('day and week helpers', () => {
  it('startOfDay returns local midnight', () => {
    expect(startOfDay(at(2026, 10, 8, 14, 30))).toBe(at(2026, 10, 8));
  });

  it('startOfWeek returns Monday of the same week', () => {
    expect(startOfWeek(at(2026, 10, 8, 14))).toBe(at(2026, 10, 5)); // Thursday
    expect(startOfWeek(at(2026, 10, 11, 23))).toBe(at(2026, 10, 5)); // Sunday
    expect(startOfWeek(at(2026, 10, 5))).toBe(at(2026, 10, 5)); // Monday
  });

  it('addDays keeps local midnight across the DST change', () => {
    const day = at(2026, 10, 25); // Europe/Berlin leaves DST: a 25-hour day
    expect(addDays(day, 1)).toBe(at(2026, 10, 26));
    expect(addDays(day, 1) - day).toBe(25 * HOUR);
    expect(addDays(day, -1)).toBe(at(2026, 10, 24));
  });

  it('dayKey and timeOfDay use local time', () => {
    expect(dayKey(at(2026, 1, 2, 3, 4))).toBe('2026-01-02');
    expect(timeOfDay(at(2026, 1, 2, 3, 4))).toBe('03:04');
  });
});

describe('localDateTime', () => {
  it('combines a date and a time in local time', () => {
    expect(localDateTime('2026-10-08', '09:15')).toBe(at(2026, 10, 8, 9, 15));
  });

  it('rejects invalid input', () => {
    expect(localDateTime('2026-02-30', '09:00')).toBeNull();
    expect(localDateTime('2026-10-08', '25:00')).toBeNull();
    expect(localDateTime('', '09:00')).toBeNull();
    expect(localDateTime('2026-10-08', '')).toBeNull();
  });
});

describe('overlapMs', () => {
  it('returns the shared length', () => {
    expect(overlapMs(0, 10, 5, 20)).toBe(5);
  });

  it('is zero for touching or separate ranges', () => {
    expect(overlapMs(0, 10, 10, 20)).toBe(0);
    expect(overlapMs(0, 10, 15, 20)).toBe(0);
  });
});

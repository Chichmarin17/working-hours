# Working Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-only time tracker with a start/stop timer per project, manual entries, daily/weekly totals, JSON/CSV export/import, and an "away while the timer was running" prompt.

**Architecture:** All rules live in pure TypeScript modules under `src/domain/` that take the current time as a parameter and never touch the DOM or storage; `src/domain/appActions.ts` exposes every user action as `AppData → AppData`. `src/storage/store.ts` loads/saves one localStorage key. React components in `src/ui/` call actions through a small `useAppData` hook that persists every change.

**Tech Stack:** Vite 5, React 18, TypeScript 5 (strict), Vitest 2. Node 22 is installed.

**Spec:** `docs/superpowers/specs/2026-10-08-working-hours-design.md`

## Global Constraints

- No backend; all data in `localStorage` under the key `working-hours:v1`, written on every change.
- `vite.config.ts` uses `base: './'` so `dist/` works on any static host.
- Away threshold: default 5 minutes, allowed range 1–120 (integer minutes).
- Heartbeat interval 30 s; heartbeat gap detection uses `max(threshold, 2 min)`.
- Idle Detection threshold 60 s (Chrome/Edge only, opt-in).
- Timer entries shorter than 60 s are deleted when stopped or cut.
- A manual/edited entry: `end > start`, `end ≤ now`, duration ≤ 24 h, no overlap (touching boundaries allowed).
- Durations display as `h:mm` (`0:07`, `12:30`); the live timer as `h:mm:ss`.
- Document title while running: `"<h:mm> · <project name>"`, otherwise `"Working Hours"`.
- Weeks run Monday–Sunday in local time; day totals clip entries at local midnight.
- Export file names: `working-hours-backup-YYYY-MM-DD.json`, `working-hours-YYYY-MM-DD.csv`.
- CSV columns: `date,project,start,end,duration_minutes,note,source` (local time, finished entries only).
- Project palette (8 colors): `#4f7cff #22a06b #e5484d #f5a524 #8e4ec6 #12a5b8 #e54d9a #6b7280`.
- Tests run in time zone `Europe/Berlin` (set in `vite.config.ts`), so local-time assertions are deterministic.
- Commit messages end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Chrome background-tab throttling** (ticks about once per minute) with a 1-minute threshold must not raise a false away prompt → heartbeat uses a 2-minute floor; test in Task 9.
2. **Stale `lastSeen` when starting a timer** (e.g. last timer ran yesterday) must not produce an away period before the start → `startAction` resets `lastSeen`, `mergeAway` clamps to the entry start; tests in Tasks 6 and 9.
3. **Corrupt or hand-edited localStorage** must never be silently lost → a copy is kept and a warning shown; tests in Task 8.
4. **Notes or project names with commas, quotes, newlines** must produce valid CSV → escaping; test in Task 7.
5. **The DST week** (Europe/Berlin, 25 Oct 2026 has 25 hours) must give correct day boundaries and totals; tests in Tasks 1 and 5.

---

## File map

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore` | Tooling |
| `src/main.tsx` | React entry |
| `src/domain/types.ts` | `Project`, `Entry`, `Settings`, `PendingAway`, `AppData`, `Result`, defaults |
| `src/domain/time.ts` | Time constants, ISO⇄ms, formatting, local day/week helpers, overlap |
| `src/domain/entries.ts` | Timer start/stop/switch, notes, manual save/edit validation, delete |
| `src/domain/entryForm.ts` | Form values ⇄ `EntryDraft` |
| `src/domain/projects.ts` | Palette, add/rename/recolor/archive |
| `src/domain/totals.ts` | Entries in a range, totals, week grid |
| `src/domain/away.ts` | Gap detection, pending-away merge, resolve choices |
| `src/domain/backup.ts` | Import validation, JSON and CSV export |
| `src/domain/appActions.ts` | All user actions on `AppData` |
| `src/storage/store.ts` | localStorage load/save, corrupt data handling |
| `src/ui/*` | React hooks, views, dialogs, styles |

---

### Task 1: Project scaffold, domain types and time helpers

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/ui/App.tsx`
- Create: `src/domain/types.ts`, `src/domain/time.ts`
- Test: `src/domain/time.test.ts`

**Interfaces:**
- Produces (`types.ts`): `Project`, `EntrySource`, `Entry`, `Settings`, `PendingAway`, `AppData`, `Result<T>`, `ok(value)`, `err(error)`, `DEFAULT_SETTINGS`, `emptyData()`.
- Produces (`time.ts`): `SECOND`, `MINUTE`, `HOUR`, `toMs(iso): number`, `toIso(ms): string`, `formatHM(ms): string`, `formatHMS(ms): string`, `parseHM(text): number | null`, `startOfDay(ms): number`, `addDays(ms, days): number`, `startOfWeek(ms): number`, `dayKey(ms): string` (`YYYY-MM-DD`), `timeOfDay(ms): string` (`HH:MM`), `localDateTime(date, time): number | null`, `overlapMs(aStart, aEnd, bStart, bEnd): number`.

- [ ] **Step 1: Create tooling files**

`package.json`:
```json
{
  "name": "working-hours",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Local-time assertions (midnight, DST) depend on a fixed zone.
    env: { TZ: 'Europe/Berlin' },
  },
});
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Working Hours</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules
dist
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/ui/App.tsx` (placeholder, replaced in Task 10):
```tsx
export function App() {
  return <h1>Working Hours</h1>;
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install -E react@18.3.1 react-dom@18.3.1
npm install -E -D vite@5.4.10 @vitejs/plugin-react@4.3.3 typescript@5.6.3 vitest@2.1.4 @types/react@18.3.12 @types/react-dom@18.3.1 @types/node@22.9.0
```
Expected: installs without peer-dependency errors; `package-lock.json` created.

- [ ] **Step 3: Write `src/domain/types.ts`**

```ts
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
```

- [ ] **Step 4: Write the failing test `src/domain/time.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKey,
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
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run src/domain/time.test.ts`
Expected: FAIL — cannot resolve `./time`.

- [ ] **Step 6: Implement `src/domain/time.ts`**

```ts
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

export function formatHMS(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / SECOND);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}:${pad(m)}:${pad(totalSeconds % 60)}`;
}

/** Parses "h:mm" into milliseconds; anything else returns null. */
export function parseHM(text: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * HOUR + Number(match[2]) * MINUTE;
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
```

- [ ] **Step 7: Run tests, typecheck and build**

Run: `npm test && npm run build`
Expected: all `time.test.ts` tests PASS; build writes `dist/index.html` with relative asset paths (`./assets/...`).

If only the DST/local-time assertions fail, the `test.env.TZ` setting did not reach the workers: change the script to `"test": "TZ=Europe/Berlin vitest run"`, remove `env` from `vite.config.ts`, and rerun.

- [ ] **Step 8: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vite.config.ts index.html src
git commit -m "feat: scaffold Vite React app with domain types and time helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Entries — timer and manual entry rules

**Files:**
- Create: `src/domain/entries.ts`
- Test: `src/domain/entries.test.ts`

**Interfaces:**
- Consumes: `Entry`, `Project`, `Result`, `ok`, `err` from `types.ts`; `dayKey`, `HOUR`, `MINUTE`, `overlapMs`, `timeOfDay`, `toIso`, `toMs` from `time.ts`.
- Produces:
  - `TINY_MS = MINUTE`, `MAX_ENTRY_MS = 24 * HOUR`
  - `type EntryDraft = { projectId: string; start: number; end: number; note: string }`
  - `runningEntry(entries: Entry[]): Entry | undefined`
  - `entryEndMs(entry: Entry, now: number): number`
  - `closeEntry(entries: Entry[], entryId: string, endMs: number): Entry[]`
  - `startTimer(entries: Entry[], projectId: string, now: number, newId: () => string): Entry[]`
  - `stopTimer(entries: Entry[], now: number): Entry[]`
  - `setNote(entries: Entry[], entryId: string, note: string): Entry[]`
  - `describeEntry(entry: Entry, projects: Project[]): string`
  - `saveEntry(entries: Entry[], projects: Project[], draft: EntryDraft, now: number, newId: () => string, editingId?: string): Result<Entry[]>`
  - `deleteEntry(entries: Entry[], entryId: string): Entry[]`

- [ ] **Step 1: Write the failing test `src/domain/entries.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { deleteEntry, runningEntry, saveEntry, setNote, startTimer, stopTimer } from './entries';
import { HOUR, MINUTE, toIso } from './time';
import type { Entry, Project } from './types';

const T0 = new Date(2026, 9, 8, 9, 0).getTime();
const projects: Project[] = [
  { id: 'p1', name: 'job1', color: '#4f7cff', archived: false },
  { id: 'p2', name: 'job2', color: '#22a06b', archived: false },
];
const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const done = (id: string, projectId: string, start: number, end: number, source: Entry['source'] = 'manual'): Entry => ({
  id,
  projectId,
  start: toIso(start),
  end: toIso(end),
  source,
});

describe('timer', () => {
  it('starts a running entry', () => {
    expect(startTimer([], 'p1', T0, ids())).toEqual([
      { id: 'id1', projectId: 'p1', start: toIso(T0), end: null, source: 'timer' },
    ]);
  });

  it('does nothing when the same project is already running', () => {
    const entries = startTimer([], 'p1', T0, ids());
    expect(startTimer(entries, 'p1', T0 + HOUR, ids())).toBe(entries);
  });

  it('switching project stops the current entry and starts a new one', () => {
    const newId = ids();
    const entries = startTimer(startTimer([], 'p1', T0, newId), 'p2', T0 + HOUR, newId);
    expect(entries).toEqual([
      { id: 'id1', projectId: 'p1', start: toIso(T0), end: toIso(T0 + HOUR), source: 'timer' },
      { id: 'id2', projectId: 'p2', start: toIso(T0 + HOUR), end: null, source: 'timer' },
    ]);
  });

  it('stop sets the end', () => {
    const entries = stopTimer(startTimer([], 'p1', T0, ids()), T0 + 10 * MINUTE);
    expect(entries[0].end).toBe(toIso(T0 + 10 * MINUTE));
    expect(runningEntry(entries)).toBeUndefined();
  });

  it('stop without a running timer changes nothing', () => {
    const entries = [done('a', 'p1', T0, T0 + HOUR)];
    expect(stopTimer(entries, T0 + 2 * HOUR)).toBe(entries);
  });

  it('drops timer entries shorter than one minute and keeps one of exactly a minute', () => {
    expect(stopTimer(startTimer([], 'p1', T0, ids()), T0 + 59_000)).toEqual([]);
    expect(stopTimer(startTimer([], 'p1', T0, ids()), T0 + MINUTE)).toHaveLength(1);
  });

  it('setNote stores the note as typed and removes an empty one', () => {
    const entries = startTimer([], 'p1', T0, ids());
    const noted = setNote(entries, 'id1', 'fix bug ');
    expect(noted[0].note).toBe('fix bug ');
    expect('note' in setNote(noted, 'id1', '  ')[0]).toBe(false);
  });
});

describe('saveEntry', () => {
  const now = T0 + 10 * HOUR;
  const draft = (start: number, end: number, projectId = 'p1', note = '') => ({ projectId, start, end, note });

  it('adds a manual entry with a trimmed note', () => {
    expect(saveEntry([], projects, draft(T0, T0 + HOUR, 'p1', '  call  '), now, ids())).toEqual({
      ok: true,
      value: [{ id: 'id1', projectId: 'p1', start: toIso(T0), end: toIso(T0 + HOUR), note: 'call', source: 'manual' }],
    });
  });

  it('rejects an unknown project', () => {
    expect(saveEntry([], projects, draft(T0, T0 + HOUR, 'nope'), now, ids())).toEqual({
      ok: false,
      error: 'Choose a project.',
    });
  });

  it('rejects an end before or equal to the start', () => {
    expect(saveEntry([], projects, draft(T0, T0), now, ids())).toEqual({ ok: false, error: 'End must be after start.' });
  });

  it('rejects an end in the future', () => {
    expect(saveEntry([], projects, draft(T0, now + MINUTE), now, ids())).toEqual({
      ok: false,
      error: "End can't be in the future.",
    });
  });

  it('rejects entries longer than 24 hours and accepts exactly 24', () => {
    expect(saveEntry([], projects, draft(now - 26 * HOUR, now - HOUR), now, ids())).toEqual({
      ok: false,
      error: "An entry can't be longer than 24 hours.",
    });
    expect(saveEntry([], projects, draft(now - 25 * HOUR, now - HOUR), now, ids()).ok).toBe(true);
  });

  it('rejects an overlap and names the clashing entry', () => {
    const existing = [done('a', 'p2', T0, T0 + HOUR)];
    expect(saveEntry(existing, projects, draft(T0 + 30 * MINUTE, T0 + 2 * HOUR), now, ids())).toEqual({
      ok: false,
      error: 'Overlaps with job2, 2026-10-08 09:00–10:00.',
    });
  });

  it('allows touching boundaries', () => {
    const existing = [done('a', 'p2', T0, T0 + HOUR)];
    expect(saveEntry(existing, projects, draft(T0 + HOUR, T0 + 2 * HOUR), now, ids()).ok).toBe(true);
  });

  it('treats the running entry as lasting until now', () => {
    const running: Entry = { id: 'r', projectId: 'p2', start: toIso(T0), end: null, source: 'timer' };
    expect(saveEntry([running], projects, draft(now - HOUR, now - 30 * MINUTE), now, ids())).toEqual({
      ok: false,
      error: 'Overlaps with job2, 2026-10-08 09:00–now.',
    });
  });

  it('editing an entry does not clash with itself and keeps its source', () => {
    const existing = [done('a', 'p1', T0, T0 + HOUR, 'timer')];
    expect(saveEntry(existing, projects, draft(T0 + 15 * MINUTE, T0 + HOUR, 'p2', 'x'), now, ids(), 'a')).toEqual({
      ok: true,
      value: [
        { id: 'a', projectId: 'p2', start: toIso(T0 + 15 * MINUTE), end: toIso(T0 + HOUR), note: 'x', source: 'timer' },
      ],
    });
  });

  it('refuses to edit the running entry or a missing one', () => {
    const running: Entry = { id: 'r', projectId: 'p1', start: toIso(T0), end: null, source: 'timer' };
    expect(saveEntry([running], projects, draft(T0, T0 + HOUR), now, ids(), 'r')).toEqual({
      ok: false,
      error: 'Stop the timer before editing this entry.',
    });
    expect(saveEntry([], projects, draft(T0, T0 + HOUR), now, ids(), 'gone')).toEqual({
      ok: false,
      error: 'This entry no longer exists.',
    });
  });
});

describe('deleteEntry', () => {
  it('removes a finished entry but never the running one', () => {
    const running: Entry = { id: 'r', projectId: 'p1', start: toIso(T0 + 2 * HOUR), end: null, source: 'timer' };
    const entries = [done('a', 'p1', T0, T0 + HOUR), running];
    expect(deleteEntry(entries, 'a')).toEqual([running]);
    expect(deleteEntry(entries, 'r')).toEqual(entries);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/entries.test.ts`
Expected: FAIL — cannot resolve `./entries`.

- [ ] **Step 3: Implement `src/domain/entries.ts`**

```ts
import { dayKey, HOUR, MINUTE, overlapMs, timeOfDay, toIso, toMs } from './time';
import type { Entry, Project, Result } from './types';
import { err, ok } from './types';

export const TINY_MS = MINUTE;
export const MAX_ENTRY_MS = 24 * HOUR;

export type EntryDraft = { projectId: string; start: number; end: number; note: string };

export function runningEntry(entries: Entry[]): Entry | undefined {
  return entries.find((e) => e.end === null);
}

export function entryEndMs(entry: Entry, now: number): number {
  return entry.end === null ? now : toMs(entry.end);
}

/** Sets an entry's end; timer entries shorter than TINY_MS are removed instead. */
export function closeEntry(entries: Entry[], entryId: string, endMs: number): Entry[] {
  return entries.flatMap((e) => {
    if (e.id !== entryId) return [e];
    if (e.source === 'timer' && endMs - toMs(e.start) < TINY_MS) return [];
    return [{ ...e, end: toIso(endMs) }];
  });
}

export function startTimer(entries: Entry[], projectId: string, now: number, newId: () => string): Entry[] {
  const running = runningEntry(entries);
  if (running?.projectId === projectId) return entries;
  const base = running ? closeEntry(entries, running.id, now) : entries;
  return [...base, { id: newId(), projectId, start: toIso(now), end: null, source: 'timer' }];
}

export function stopTimer(entries: Entry[], now: number): Entry[] {
  const running = runningEntry(entries);
  return running ? closeEntry(entries, running.id, now) : entries;
}

function withNote(entry: Entry, note: string): Entry {
  const copy: Entry = { ...entry };
  if (note.trim()) copy.note = note;
  else delete copy.note;
  return copy;
}

export function setNote(entries: Entry[], entryId: string, note: string): Entry[] {
  return entries.map((e) => (e.id === entryId ? withNote(e, note) : e));
}

export function describeEntry(entry: Entry, projects: Project[]): string {
  const name = projects.find((p) => p.id === entry.projectId)?.name ?? 'Unknown project';
  const start = toMs(entry.start);
  const end = entry.end === null ? 'now' : timeOfDay(toMs(entry.end));
  return `${name}, ${dayKey(start)} ${timeOfDay(start)}–${end}`;
}

function findOverlap(entries: Entry[], start: number, end: number, now: number, ignoreId?: string): Entry | undefined {
  return entries.find((e) => e.id !== ignoreId && overlapMs(start, end, toMs(e.start), entryEndMs(e, now)) > 0);
}

/** Adds a manual entry, or updates `editingId`, after validating the draft. */
export function saveEntry(
  entries: Entry[],
  projects: Project[],
  draft: EntryDraft,
  now: number,
  newId: () => string,
  editingId?: string,
): Result<Entry[]> {
  if (!projects.some((p) => p.id === draft.projectId)) return err('Choose a project.');
  const existing = editingId === undefined ? undefined : entries.find((e) => e.id === editingId);
  if (editingId !== undefined && !existing) return err('This entry no longer exists.');
  if (existing?.end === null) return err('Stop the timer before editing this entry.');
  if (!(draft.end > draft.start)) return err('End must be after start.');
  if (draft.end > now) return err("End can't be in the future.");
  if (draft.end - draft.start > MAX_ENTRY_MS) return err("An entry can't be longer than 24 hours.");
  const clash = findOverlap(entries, draft.start, draft.end, now, editingId);
  if (clash) return err(`Overlaps with ${describeEntry(clash, projects)}.`);

  const fields = { projectId: draft.projectId, start: toIso(draft.start), end: toIso(draft.end) };
  const note = draft.note.trim();
  if (existing) {
    const updated = withNote({ ...existing, ...fields }, note);
    return ok(entries.map((e) => (e.id === existing.id ? updated : e)));
  }
  return ok([...entries, withNote({ id: newId(), ...fields, source: 'manual' }, note)]);
}

export function deleteEntry(entries: Entry[], entryId: string): Entry[] {
  return entries.filter((e) => e.id !== entryId || e.end === null);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/entries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/entries.ts src/domain/entries.test.ts
git commit -m "feat: timer and manual entry rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Entry form conversion

**Files:**
- Create: `src/domain/entryForm.ts`
- Test: `src/domain/entryForm.test.ts`

**Interfaces:**
- Consumes: `EntryDraft` from `entries.ts`; `addDays`, `dayKey`, `localDateTime`, `parseHM`, `timeOfDay`, `toMs` from `time.ts`; `Entry`, `Result`, `ok`, `err` from `types.ts`.
- Produces:
  - `type EntryFormValues = { projectId: string; date: string; startTime: string; endTime: string; duration: string; note: string }` (`date` is `YYYY-MM-DD`, times `HH:MM`, duration `h:mm`)
  - `draftFromForm(values: EntryFormValues): Result<EntryDraft>`
  - `formFromEntry(entry: Entry): EntryFormValues`
  - `emptyForm(projectId: string, day: number): EntryFormValues`

- [ ] **Step 1: Write the failing test `src/domain/entryForm.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/entryForm.test.ts`
Expected: FAIL — cannot resolve `./entryForm`.

- [ ] **Step 3: Implement `src/domain/entryForm.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/entryForm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/entryForm.ts src/domain/entryForm.test.ts
git commit -m "feat: convert entry form values to drafts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Projects

**Files:**
- Create: `src/domain/projects.ts`
- Test: `src/domain/projects.test.ts`

**Interfaces:**
- Consumes: `Project`, `Result`, `ok`, `err` from `types.ts`.
- Produces:
  - `PALETTE: string[]` (8 colors, see Global Constraints)
  - `activeProjects(projects: Project[]): Project[]`
  - `addProject(projects: Project[], name: string, newId: () => string): Result<Project[]>`
  - `renameProject(projects: Project[], id: string, name: string): Result<Project[]>`
  - `setProjectColor(projects: Project[], id: string, color: string): Project[]`
  - `setArchived(projects: Project[], id: string, archived: boolean): Result<Project[]>`

- [ ] **Step 1: Write the failing test `src/domain/projects.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { activeProjects, addProject, PALETTE, renameProject, setArchived, setProjectColor } from './projects';
import type { Project } from './types';

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const job1: Project = { id: 'a', name: 'Job1', color: PALETTE[0], archived: false };
const old: Project = { id: 'b', name: 'old', color: PALETTE[1], archived: true };

describe('addProject', () => {
  it('adds a trimmed project with the next palette color', () => {
    expect(addProject([job1], '  job2 ', ids())).toEqual({
      ok: true,
      value: [job1, { id: 'id1', name: 'job2', color: PALETTE[1], archived: false }],
    });
  });

  it('rejects empty, too long and duplicate names (case-insensitive)', () => {
    expect(addProject([job1], '  ', ids())).toEqual({ ok: false, error: "Project name can't be empty." });
    expect(addProject([job1], 'x'.repeat(41), ids())).toEqual({
      ok: false,
      error: 'Project name is too long (max 40 characters).',
    });
    expect(addProject([job1], 'job1', ids())).toEqual({ ok: false, error: 'A project named "job1" already exists.' });
  });

  it('allows reusing the name of an archived project', () => {
    expect(addProject([old], 'old', ids()).ok).toBe(true);
  });
});

describe('renameProject', () => {
  it('renames, and keeping its own name in another case is fine', () => {
    expect(renameProject([job1], 'a', 'JOB1')).toEqual({ ok: true, value: [{ ...job1, name: 'JOB1' }] });
  });

  it('rejects a name used by another active project', () => {
    const job2: Project = { ...job1, id: 'c', name: 'job2' };
    expect(renameProject([job1, job2], 'c', 'job1').ok).toBe(false);
  });
});

describe('archiving', () => {
  it('archives and unarchives', () => {
    expect(setArchived([job1], 'a', true)).toEqual({ ok: true, value: [{ ...job1, archived: true }] });
    expect(setArchived([old], 'b', false)).toEqual({ ok: true, value: [{ ...old, archived: false }] });
  });

  it('refuses to unarchive when an active project has the same name', () => {
    const active: Project = { ...job1, id: 'c', name: 'old' };
    expect(setArchived([old, active], 'b', false)).toEqual({
      ok: false,
      error: 'A project named "old" already exists.',
    });
  });

  it('activeProjects hides archived ones', () => {
    expect(activeProjects([job1, old])).toEqual([job1]);
  });
});

describe('setProjectColor', () => {
  it('changes the color', () => {
    expect(setProjectColor([job1], 'a', PALETTE[3])).toEqual([{ ...job1, color: PALETTE[3] }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/projects.test.ts`
Expected: FAIL — cannot resolve `./projects`.

- [ ] **Step 3: Implement `src/domain/projects.ts`**

```ts
import type { Project, Result } from './types';
import { err, ok } from './types';

export const PALETTE = ['#4f7cff', '#22a06b', '#e5484d', '#f5a524', '#8e4ec6', '#12a5b8', '#e54d9a', '#6b7280'];

const MAX_NAME_LENGTH = 40;

export function activeProjects(projects: Project[]): Project[] {
  return projects.filter((p) => !p.archived);
}

function nameError(projects: Project[], name: string, exceptId?: string): string | null {
  if (!name) return "Project name can't be empty.";
  if (name.length > MAX_NAME_LENGTH) return `Project name is too long (max ${MAX_NAME_LENGTH} characters).`;
  const taken = projects.some(
    (p) => p.id !== exceptId && !p.archived && p.name.toLowerCase() === name.toLowerCase(),
  );
  return taken ? `A project named "${name}" already exists.` : null;
}

export function addProject(projects: Project[], name: string, newId: () => string): Result<Project[]> {
  const trimmed = name.trim();
  const error = nameError(projects, trimmed);
  if (error) return err(error);
  const color = PALETTE[projects.length % PALETTE.length];
  return ok([...projects, { id: newId(), name: trimmed, color, archived: false }]);
}

export function renameProject(projects: Project[], id: string, name: string): Result<Project[]> {
  const trimmed = name.trim();
  const error = nameError(projects, trimmed, id);
  if (error) return err(error);
  return ok(projects.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
}

export function setProjectColor(projects: Project[], id: string, color: string): Project[] {
  return projects.map((p) => (p.id === id ? { ...p, color } : p));
}

export function setArchived(projects: Project[], id: string, archived: boolean): Result<Project[]> {
  const project = projects.find((p) => p.id === id);
  if (!project) return err('This project no longer exists.');
  if (!archived) {
    const error = nameError(projects, project.name, id);
    if (error) return err(error);
  }
  return ok(projects.map((p) => (p.id === id ? { ...p, archived } : p)));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/projects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/projects.ts src/domain/projects.test.ts
git commit -m "feat: project management rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Totals and week grid

**Files:**
- Create: `src/domain/totals.ts`
- Test: `src/domain/totals.test.ts`

**Interfaces:**
- Consumes: `entryEndMs` from `entries.ts`; `addDays`, `overlapMs`, `toMs` from `time.ts`; `Entry` from `types.ts`.
- Produces:
  - `entriesInRange(entries: Entry[], from: number, to: number, now: number): Entry[]` — entries touching `[from, to)`, newest start first; a running entry that started inside the range is included even with zero length.
  - `totalMs(entries: Entry[], from: number, to: number, now: number): number`
  - `totalsByProject(entries: Entry[], from: number, to: number, now: number): Record<string, number>` (only projects with time > 0)
  - `type WeekRow = { projectId: string; perDay: number[]; total: number }`
  - `type WeekGrid = { days: number[]; rows: WeekRow[]; dayTotals: number[]; total: number }`
  - `weekGrid(entries: Entry[], weekStart: number, now: number): WeekGrid` — rows sorted by total, largest first.

- [ ] **Step 1: Write the failing test `src/domain/totals.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { addDays, HOUR, toIso } from './time';
import { entriesInRange, totalMs, totalsByProject, weekGrid } from './totals';
import type { Entry } from './types';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const entry = (id: string, projectId: string, start: number, end: number | null): Entry => ({
  id,
  projectId,
  start: toIso(start),
  end: end === null ? null : toIso(end),
  source: 'manual',
});
const now = at(2026, 10, 8, 15);
const day = at(2026, 10, 8);

describe('entriesInRange', () => {
  it('returns entries touching the day, newest first, including a just-started timer', () => {
    const entries = [
      entry('old', 'p1', at(2026, 10, 7, 9), at(2026, 10, 7, 10)),
      entry('a', 'p1', at(2026, 10, 8, 9), at(2026, 10, 8, 10)),
      entry('night', 'p1', at(2026, 10, 7, 23), at(2026, 10, 8, 1)),
      entry('run', 'p2', now, null),
    ];
    expect(entriesInRange(entries, day, addDays(day, 1), now).map((e) => e.id)).toEqual(['run', 'a', 'night']);
  });
});

describe('totals', () => {
  it('clips entries to the range and counts the running entry until now', () => {
    const entries = [
      entry('night', 'p1', at(2026, 10, 7, 23), at(2026, 10, 8, 1)),
      entry('run', 'p2', at(2026, 10, 8, 14), null),
    ];
    expect(totalMs(entries, day, addDays(day, 1), now)).toBe(2 * HOUR);
    expect(totalsByProject(entries, day, addDays(day, 1), now)).toEqual({ p1: HOUR, p2: HOUR });
  });
});

describe('weekGrid', () => {
  it('builds rows per project with day and grand totals', () => {
    const entries = [
      entry('mon', 'p1', at(2026, 10, 5, 9), at(2026, 10, 5, 11)),
      entry('sun-night', 'p2', at(2026, 10, 11, 23), at(2026, 10, 12, 2)),
      entry('next-week', 'p1', at(2026, 10, 12, 9), at(2026, 10, 12, 10)),
    ];
    const grid = weekGrid(entries, at(2026, 10, 5), at(2026, 10, 13));
    expect(grid.days).toEqual([5, 6, 7, 8, 9, 10, 11].map((d) => at(2026, 10, d)));
    expect(grid.rows).toEqual([
      { projectId: 'p1', perDay: [2 * HOUR, 0, 0, 0, 0, 0, 0], total: 2 * HOUR },
      { projectId: 'p2', perDay: [0, 0, 0, 0, 0, 0, HOUR], total: HOUR },
    ]);
    expect(grid.dayTotals).toEqual([2 * HOUR, 0, 0, 0, 0, 0, HOUR]);
    expect(grid.total).toBe(3 * HOUR);
  });

  it('counts the whole 25-hour DST day', () => {
    const entries = [
      entry('morning', 'p1', at(2026, 10, 25), at(2026, 10, 25, 12)),
      entry('rest', 'p1', at(2026, 10, 25, 12), at(2026, 10, 26)),
    ];
    const grid = weekGrid(entries, at(2026, 10, 19), at(2026, 10, 27));
    expect(grid.days[6]).toBe(at(2026, 10, 25));
    expect(grid.dayTotals[6]).toBe(25 * HOUR);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/totals.test.ts`
Expected: FAIL — cannot resolve `./totals`.

- [ ] **Step 3: Implement `src/domain/totals.ts`**

```ts
import { entryEndMs } from './entries';
import { addDays, overlapMs, toMs } from './time';
import type { Entry } from './types';

export type WeekRow = { projectId: string; perDay: number[]; total: number };
export type WeekGrid = { days: number[]; rows: WeekRow[]; dayTotals: number[]; total: number };

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function entriesInRange(entries: Entry[], from: number, to: number, now: number): Entry[] {
  return entries
    .filter((e) => {
      const start = toMs(e.start);
      return start < to && (entryEndMs(e, now) > from || start >= from);
    })
    .sort((a, b) => toMs(b.start) - toMs(a.start));
}

export function totalsByProject(entries: Entry[], from: number, to: number, now: number): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of entries) {
    const ms = overlapMs(toMs(e.start), entryEndMs(e, now), from, to);
    if (ms > 0) totals[e.projectId] = (totals[e.projectId] ?? 0) + ms;
  }
  return totals;
}

export function totalMs(entries: Entry[], from: number, to: number, now: number): number {
  return sum(Object.values(totalsByProject(entries, from, to, now)));
}

export function weekGrid(entries: Entry[], weekStart: number, now: number): WeekGrid {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const perProject = new Map<string, number[]>();
  for (const e of entries) {
    const start = toMs(e.start);
    const end = entryEndMs(e, now);
    days.forEach((day, i) => {
      const ms = overlapMs(start, end, day, addDays(day, 1));
      if (ms <= 0) return;
      const row = perProject.get(e.projectId) ?? new Array<number>(7).fill(0);
      row[i] += ms;
      perProject.set(e.projectId, row);
    });
  }
  const rows = [...perProject]
    .map(([projectId, perDay]) => ({ projectId, perDay, total: sum(perDay) }))
    .sort((a, b) => b.total - a.total);
  const dayTotals = days.map((_, i) => sum(rows.map((r) => r.perDay[i])));
  return { days, rows, dayTotals, total: sum(dayTotals) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/totals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/totals.ts src/domain/totals.test.ts
git commit -m "feat: day totals and week grid" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Away detection logic

**Files:**
- Create: `src/domain/away.ts`
- Test: `src/domain/away.test.ts`

**Interfaces:**
- Consumes: `closeEntry`, `runningEntry` from `entries.ts`; `toIso`, `toMs` from `time.ts`; `Entry`, `PendingAway` from `types.ts`.
- Produces:
  - `type Period = { from: number; to: number }`
  - `type AwayChoice = 'keep' | 'discard' | 'stop'`
  - `detectGap(lastSeen: string | null, now: number, minGapMs: number): Period | null`
  - `cleanPending(pending: PendingAway | null, entries: Entry[]): PendingAway | null` — drops it unless its entry is still running.
  - `mergeAway(pending: PendingAway | null, entries: Entry[], period: Period, thresholdMs: number): PendingAway | null`
  - `resolveAway(entries: Entry[], pending: PendingAway, choice: AwayChoice, newId: () => string): Entry[]`

- [ ] **Step 1: Write the failing test `src/domain/away.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { cleanPending, detectGap, mergeAway, resolveAway } from './away';
import { HOUR, MINUTE, toIso } from './time';
import type { Entry, PendingAway } from './types';

const T0 = new Date(2026, 9, 8, 9, 0).getTime();
const TH = 5 * MINUTE;
const running: Entry = { id: 'r', projectId: 'p1', start: toIso(T0), end: null, note: 'focus', source: 'timer' };
const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

describe('detectGap', () => {
  it('returns null without lastSeen or below the minimum gap', () => {
    expect(detectGap(null, T0, TH)).toBeNull();
    expect(detectGap(toIso(T0), T0 + TH - 1, TH)).toBeNull();
  });

  it('returns the period from lastSeen to now at or above the minimum gap', () => {
    expect(detectGap(toIso(T0), T0 + TH, TH)).toEqual({ from: T0, to: T0 + TH });
  });
});

describe('mergeAway', () => {
  it('creates a pending period for the running entry', () => {
    expect(mergeAway(null, [running], { from: T0 + HOUR, to: T0 + HOUR + 10 * MINUTE }, TH)).toEqual({
      entryId: 'r',
      from: toIso(T0 + HOUR),
      to: toIso(T0 + HOUR + 10 * MINUTE),
    });
  });

  it('ignores periods shorter than the threshold', () => {
    expect(mergeAway(null, [running], { from: T0 + HOUR, to: T0 + HOUR + 4 * MINUTE }, TH)).toBeNull();
  });

  it('ignores periods when no timer is running', () => {
    const stopped = { ...running, end: toIso(T0 + HOUR) };
    expect(mergeAway(null, [stopped], { from: T0, to: T0 + HOUR }, TH)).toBeNull();
  });

  it('never starts the away period before the timer started', () => {
    expect(mergeAway(null, [running], { from: T0 - HOUR, to: T0 + 10 * MINUTE }, TH)).toEqual({
      entryId: 'r',
      from: toIso(T0),
      to: toIso(T0 + 10 * MINUTE),
    });
    expect(mergeAway(null, [running], { from: T0 - HOUR, to: T0 + 2 * MINUTE }, TH)).toBeNull();
  });

  it('extends an existing pending period', () => {
    const pending: PendingAway = { entryId: 'r', from: toIso(T0 + HOUR), to: toIso(T0 + HOUR + 10 * MINUTE) };
    expect(mergeAway(pending, [running], { from: T0 + 2 * HOUR, to: T0 + 2 * HOUR + 6 * MINUTE }, TH)).toEqual({
      entryId: 'r',
      from: toIso(T0 + HOUR),
      to: toIso(T0 + 2 * HOUR + 6 * MINUTE),
    });
  });

  it('keeps the pending period when the new one is too short', () => {
    const pending: PendingAway = { entryId: 'r', from: toIso(T0 + HOUR), to: toIso(T0 + 2 * HOUR) };
    expect(mergeAway(pending, [running], { from: T0 + 3 * HOUR, to: T0 + 3 * HOUR + MINUTE }, TH)).toBe(pending);
  });
});

describe('cleanPending', () => {
  it('drops a pending period whose entry is no longer running', () => {
    const pending: PendingAway = { entryId: 'r', from: toIso(T0 + HOUR), to: toIso(T0 + 2 * HOUR) };
    expect(cleanPending(pending, [running])).toBe(pending);
    expect(cleanPending(pending, [{ ...running, end: toIso(T0 + 3 * HOUR) }])).toBeNull();
    expect(cleanPending(pending, [])).toBeNull();
  });
});

describe('resolveAway', () => {
  const pending: PendingAway = { entryId: 'r', from: toIso(T0 + HOUR), to: toIso(T0 + 2 * HOUR) };

  it('keep leaves the entries unchanged', () => {
    const entries = [running];
    expect(resolveAway(entries, pending, 'keep', ids())).toBe(entries);
  });

  it('stop ends the entry when I left', () => {
    expect(resolveAway([running], pending, 'stop', ids())).toEqual([{ ...running, end: toIso(T0 + HOUR) }]);
  });

  it('discard cuts the entry and continues from when I came back', () => {
    expect(resolveAway([running], pending, 'discard', ids())).toEqual([
      { ...running, end: toIso(T0 + HOUR) },
      { id: 'id1', projectId: 'p1', start: toIso(T0 + 2 * HOUR), end: null, note: 'focus', source: 'timer' },
    ]);
  });

  it('discard drops a cut entry shorter than a minute', () => {
    const early: PendingAway = { entryId: 'r', from: toIso(T0 + 30_000), to: toIso(T0 + HOUR) };
    expect(resolveAway([running], early, 'discard', ids())).toEqual([
      { id: 'id1', projectId: 'p1', start: toIso(T0 + HOUR), end: null, note: 'focus', source: 'timer' },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/away.test.ts`
Expected: FAIL — cannot resolve `./away`.

- [ ] **Step 3: Implement `src/domain/away.ts`**

```ts
import { closeEntry, runningEntry } from './entries';
import { toIso, toMs } from './time';
import type { Entry, PendingAway } from './types';

export type Period = { from: number; to: number };
export type AwayChoice = 'keep' | 'discard' | 'stop';

export function detectGap(lastSeen: string | null, now: number, minGapMs: number): Period | null {
  if (lastSeen === null) return null;
  const from = toMs(lastSeen);
  return now - from >= minGapMs ? { from, to: now } : null;
}

export function cleanPending(pending: PendingAway | null, entries: Entry[]): PendingAway | null {
  if (!pending) return null;
  return runningEntry(entries)?.id === pending.entryId ? pending : null;
}

/** Records an away period for the running entry, extending one that is already pending. */
export function mergeAway(
  pending: PendingAway | null,
  entries: Entry[],
  period: Period,
  thresholdMs: number,
): PendingAway | null {
  const current = cleanPending(pending, entries);
  const running = runningEntry(entries);
  if (!running) return null;
  const from = Math.max(period.from, toMs(running.start));
  if (period.to - from < thresholdMs) return current;
  if (current) {
    return {
      entryId: current.entryId,
      from: toIso(Math.min(from, toMs(current.from))),
      to: toIso(Math.max(period.to, toMs(current.to))),
    };
  }
  return { entryId: running.id, from: toIso(from), to: toIso(period.to) };
}

export function resolveAway(entries: Entry[], pending: PendingAway, choice: AwayChoice, newId: () => string): Entry[] {
  const entry = entries.find((e) => e.id === pending.entryId && e.end === null);
  if (!entry || choice === 'keep') return entries;
  const closed = closeEntry(entries, entry.id, toMs(pending.from));
  if (choice === 'stop') return closed;
  return [
    ...closed,
    {
      id: newId(),
      projectId: entry.projectId,
      start: pending.to,
      end: null,
      ...(entry.note ? { note: entry.note } : {}),
      source: 'timer',
    },
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/away.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/away.ts src/domain/away.test.ts
git commit -m "feat: away period detection and resolution" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Backup — import validation, JSON and CSV export

**Files:**
- Create: `src/domain/backup.ts`
- Test: `src/domain/backup.test.ts`

**Interfaces:**
- Consumes: `cleanPending` from `away.ts`; `dayKey`, `MINUTE`, `timeOfDay`, `toMs` from `time.ts`; `AppData`, `DEFAULT_SETTINGS`, `Entry`, `PendingAway`, `Project`, `Result`, `Settings`, `ok`, `err` from `types.ts`.
- Produces:
  - `parseAppData(raw: unknown): Result<AppData>` — used for both import and loading from storage.
  - `toJson(data: AppData): string`
  - `toCsv(data: AppData): string`

- [ ] **Step 1: Write the failing test `src/domain/backup.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/backup.test.ts`
Expected: FAIL — cannot resolve `./backup`.

- [ ] **Step 3: Implement `src/domain/backup.ts`**

```ts
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
  const { id, projectId, start, end, note, source } = e;
  if (typeof id !== 'string' || typeof projectId !== 'string' || !isIso(start)) return null;
  if (!(end === null || isIso(end))) return null;
  if (source !== 'timer' && source !== 'manual') return null;
  if (note !== undefined && typeof note !== 'string') return null;
  return { id, projectId, start, end, source: source as EntrySource, ...(note ? { note } : {}) };
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
        localStamp(start),
        localStamp(end),
        String(Math.round((end - start) / MINUTE)),
        e.note ?? '',
        e.source,
      ];
    });
  return [CSV_HEADER, ...rows].map((row) => row.map(csvField).join(',')).join('\n') + '\n';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/backup.ts src/domain/backup.test.ts
git commit -m "feat: backup validation and JSON/CSV export" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: localStorage persistence

**Files:**
- Create: `src/storage/store.ts`
- Test: `src/storage/store.test.ts`

**Interfaces:**
- Consumes: `parseAppData` from `domain/backup.ts`; `AppData`, `emptyData` from `domain/types.ts`.
- Produces:
  - `STORAGE_KEY = 'working-hours:v1'`
  - `type KeyValueStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void }`
  - `type LoadResult = { data: AppData; warning: string | null }`
  - `loadData(storage: KeyValueStorage, now: number): LoadResult`
  - `saveData(storage: KeyValueStorage, data: AppData): void` (may throw, e.g. quota exceeded)

- [ ] **Step 1: Write the failing test `src/storage/store.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { emptyData } from '../domain/types';
import { loadData, saveData, STORAGE_KEY } from './store';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe('store', () => {
  it('returns empty data without a warning when nothing is stored', () => {
    expect(loadData(memoryStorage(), 1)).toEqual({ data: emptyData(), warning: null });
  });

  it('round-trips saved data', () => {
    const storage = memoryStorage();
    const data = { ...emptyData(), projects: [{ id: 'p1', name: 'job1', color: '#4f7cff', archived: false }] };
    saveData(storage, data);
    expect(loadData(storage, 1)).toEqual({ data, warning: null });
  });

  it('keeps a copy of corrupt JSON and starts empty with a warning', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{oops' });
    const result = loadData(storage, 1234);
    const backupKey = `${STORAGE_KEY}:corrupt-1234`;
    expect(result.data).toEqual(emptyData());
    expect(storage.map.get(backupKey)).toBe('{oops');
    expect(result.warning).toContain(backupKey);
    expect(storage.map.get(STORAGE_KEY)).toBe('{oops');
  });

  it('treats structurally invalid data the same way and says why', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{"version":7}' });
    const result = loadData(storage, 99);
    expect(storage.map.get(`${STORAGE_KEY}:corrupt-99`)).toBe('{"version":7}');
    expect(result.warning).toContain('Unsupported backup version: 7.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/storage/store.test.ts`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Implement `src/storage/store.ts`**

```ts
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

export function saveData(storage: KeyValueStorage, data: AppData): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/storage/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage
git commit -m "feat: localStorage persistence with corrupt data backup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: App actions

**Files:**
- Create: `src/domain/appActions.ts`
- Test: `src/domain/appActions.test.ts`

**Interfaces:**
- Consumes: `away.ts` (`cleanPending`, `detectGap`, `mergeAway`, `resolveAway`, `AwayChoice`, `Period`), `entries.ts` (`deleteEntry`, `EntryDraft`, `runningEntry`, `saveEntry`, `setNote`, `startTimer`, `stopTimer`), `projects.ts` (`addProject`, `renameProject`, `setArchived`, `setProjectColor`), `time.ts` (`MINUTE`, `toIso`), `types.ts`.
- Produces (all pure; `newId: () => string`):
  - `HEARTBEAT_MIN_GAP_MS = 2 * MINUTE`
  - `startAction(data: AppData, projectId: string, now: number, newId): AppData`
  - `stopAction(data: AppData, now: number): AppData`
  - `setNoteAction(data: AppData, note: string): AppData` (running entry)
  - `saveEntryAction(data: AppData, draft: EntryDraft, now: number, newId, editingId?: string): Result<AppData>`
  - `deleteEntryAction(data: AppData, entryId: string): AppData`
  - `addProjectAction(data: AppData, name: string, newId): Result<AppData>`
  - `renameProjectAction(data: AppData, id: string, name: string): Result<AppData>`
  - `setProjectColorAction(data: AppData, id: string, color: string): AppData`
  - `setArchivedAction(data: AppData, id: string, archived: boolean, now: number): Result<AppData>`
  - `updateSettingsAction(data: AppData, patch: Partial<Settings>): AppData`
  - `heartbeatAction(data: AppData, now: number): AppData` (returns the same object when nothing changes)
  - `awayAction(data: AppData, period: Period): AppData`
  - `resolveAwayAction(data: AppData, choice: AwayChoice, now: number, newId): AppData`

- [ ] **Step 1: Write the failing test `src/domain/appActions.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  awayAction,
  heartbeatAction,
  resolveAwayAction,
  saveEntryAction,
  setArchivedAction,
  startAction,
  stopAction,
  updateSettingsAction,
} from './appActions';
import { runningEntry } from './entries';
import { HOUR, MINUTE, toIso } from './time';
import type { AppData } from './types';
import { emptyData } from './types';

const T0 = new Date(2026, 9, 8, 9, 0).getTime();
const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const base = (): AppData => ({
  ...emptyData(),
  projects: [
    { id: 'p1', name: 'job1', color: '#4f7cff', archived: false },
    { id: 'p2', name: 'job2', color: '#22a06b', archived: false },
  ],
});
const withThreshold = (data: AppData, minutes: number) => ({
  ...data,
  settings: { ...data.settings, awayThresholdMinutes: minutes },
});

describe('timer actions', () => {
  it('start resets lastSeen so time before the start is never away', () => {
    const stale = { ...base(), lastSeen: toIso(T0 - 5 * HOUR) };
    const started = startAction(stale, 'p1', T0, ids());
    expect(started.lastSeen).toBe(toIso(T0));
    expect(heartbeatAction(started, T0 + 30_000).pendingAway).toBeNull();
  });

  it('stop clears lastSeen and any pending away period', () => {
    const started = startAction(base(), 'p1', T0, ids());
    const pending = { ...started, pendingAway: { entryId: 'id1', from: toIso(T0 + HOUR), to: toIso(T0 + 2 * HOUR) } };
    const stopped = stopAction(pending, T0 + 3 * HOUR);
    expect(stopped.lastSeen).toBeNull();
    expect(stopped.pendingAway).toBeNull();
    expect(runningEntry(stopped.entries)).toBeUndefined();
  });

  it('archiving the running project stops the timer', () => {
    const started = startAction(base(), 'p1', T0, ids());
    const result = setArchivedAction(started, 'p1', true, T0 + HOUR);
    if (!result.ok) throw new Error(result.error);
    expect(runningEntry(result.value.entries)).toBeUndefined();
    expect(result.value.entries[0].end).toBe(toIso(T0 + HOUR));
  });

  it('saveEntryAction passes validation errors through', () => {
    const draft = { projectId: 'p1', start: T0, end: T0, note: '' };
    expect(saveEntryAction(base(), draft, T0 + HOUR, ids())).toEqual({ ok: false, error: 'End must be after start.' });
  });
});

describe('updateSettingsAction', () => {
  it('clamps and rounds the threshold', () => {
    const threshold = (minutes: number) =>
      updateSettingsAction(base(), { awayThresholdMinutes: minutes }).settings.awayThresholdMinutes;
    expect(threshold(0)).toBe(1);
    expect(threshold(500)).toBe(120);
    expect(threshold(7.6)).toBe(8);
    expect(threshold(Number.NaN)).toBe(5);
  });
});

describe('heartbeatAction', () => {
  it('returns the same object when no timer runs and nothing is stored', () => {
    const data = base();
    expect(heartbeatAction(data, T0)).toBe(data);
  });

  it('records an away period after a long gap and updates lastSeen', () => {
    const started = startAction(base(), 'p1', T0, ids());
    const next = heartbeatAction(started, T0 + 10 * MINUTE);
    expect(next.pendingAway).toEqual({ entryId: 'id1', from: toIso(T0), to: toIso(T0 + 10 * MINUTE) });
    expect(next.lastSeen).toBe(toIso(T0 + 10 * MINUTE));
  });

  it('ignores a 70-second gap from background-tab throttling even with a 1-minute threshold', () => {
    const started = withThreshold(startAction(base(), 'p1', T0, ids()), 1);
    expect(heartbeatAction(started, T0 + 70_000).pendingAway).toBeNull();
  });

  it('still detects a 3-minute gap with a 1-minute threshold', () => {
    const started = withThreshold(startAction(base(), 'p1', T0, ids()), 1);
    expect(heartbeatAction(started, T0 + 3 * MINUTE).pendingAway).not.toBeNull();
  });
});

describe('away actions', () => {
  it('idle periods use the plain threshold', () => {
    const started = withThreshold(startAction(base(), 'p1', T0, ids()), 1);
    expect(awayAction(started, { from: T0 + HOUR, to: T0 + HOUR + 70_000 }).pendingAway).toEqual({
      entryId: 'id1',
      from: toIso(T0 + HOUR),
      to: toIso(T0 + HOUR + 70_000),
    });
  });

  const pendingData = () => {
    const started = startAction(base(), 'p1', T0, ids());
    return { ...started, pendingAway: { entryId: 'id1', from: toIso(T0 + HOUR), to: toIso(T0 + 2 * HOUR) } };
  };

  it('stop ends the timer when I left and clears lastSeen', () => {
    const next = resolveAwayAction(pendingData(), 'stop', T0 + 2 * HOUR, ids());
    expect(runningEntry(next.entries)).toBeUndefined();
    expect(next.entries[0].end).toBe(toIso(T0 + HOUR));
    expect(next.pendingAway).toBeNull();
    expect(next.lastSeen).toBeNull();
  });

  it('discard continues the timer from when I came back', () => {
    const next = resolveAwayAction(pendingData(), 'discard', T0 + 2 * HOUR + MINUTE, () => 'new');
    expect(runningEntry(next.entries)).toMatchObject({ id: 'new', projectId: 'p1', start: toIso(T0 + 2 * HOUR) });
    expect(next.pendingAway).toBeNull();
    expect(next.lastSeen).toBe(toIso(T0 + 2 * HOUR + MINUTE));
  });

  it('keep only clears the pending period', () => {
    const data = pendingData();
    const next = resolveAwayAction(data, 'keep', T0 + 2 * HOUR, ids());
    expect(next.entries).toBe(data.entries);
    expect(next.pendingAway).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/appActions.test.ts`
Expected: FAIL — cannot resolve `./appActions`.

- [ ] **Step 3: Implement `src/domain/appActions.ts`**

```ts
import { type AwayChoice, cleanPending, detectGap, mergeAway, type Period, resolveAway } from './away';
import { deleteEntry, type EntryDraft, runningEntry, saveEntry, setNote, startTimer, stopTimer } from './entries';
import { addProject, renameProject, setArchived, setProjectColor } from './projects';
import { MINUTE, toIso } from './time';
import type { AppData, Entry, Result, Settings } from './types';
import { DEFAULT_SETTINGS, ok } from './types';

type NewId = () => string;

/** Chrome ticks background tabs about once a minute; shorter gaps are not absences. */
export const HEARTBEAT_MIN_GAP_MS = 2 * MINUTE;

const thresholdMs = (settings: Settings) => settings.awayThresholdMinutes * MINUTE;

/** Replaces entries and drops away state that no longer applies. */
function withEntries(data: AppData, entries: Entry[]): AppData {
  const running = runningEntry(entries);
  return {
    ...data,
    entries,
    pendingAway: cleanPending(data.pendingAway, entries),
    lastSeen: running ? data.lastSeen : null,
  };
}

export function startAction(data: AppData, projectId: string, now: number, newId: NewId): AppData {
  const entries = startTimer(data.entries, projectId, now, newId);
  if (entries === data.entries) return data;
  return { ...withEntries(data, entries), lastSeen: toIso(now) };
}

export function stopAction(data: AppData, now: number): AppData {
  const entries = stopTimer(data.entries, now);
  return entries === data.entries ? data : withEntries(data, entries);
}

export function setNoteAction(data: AppData, note: string): AppData {
  const running = runningEntry(data.entries);
  return running ? { ...data, entries: setNote(data.entries, running.id, note) } : data;
}

export function saveEntryAction(
  data: AppData,
  draft: EntryDraft,
  now: number,
  newId: NewId,
  editingId?: string,
): Result<AppData> {
  const result = saveEntry(data.entries, data.projects, draft, now, newId, editingId);
  return result.ok ? ok(withEntries(data, result.value)) : result;
}

export function deleteEntryAction(data: AppData, entryId: string): AppData {
  return withEntries(data, deleteEntry(data.entries, entryId));
}

export function addProjectAction(data: AppData, name: string, newId: NewId): Result<AppData> {
  const result = addProject(data.projects, name, newId);
  return result.ok ? ok({ ...data, projects: result.value }) : result;
}

export function renameProjectAction(data: AppData, id: string, name: string): Result<AppData> {
  const result = renameProject(data.projects, id, name);
  return result.ok ? ok({ ...data, projects: result.value }) : result;
}

export function setProjectColorAction(data: AppData, id: string, color: string): AppData {
  return { ...data, projects: setProjectColor(data.projects, id, color) };
}

export function setArchivedAction(data: AppData, id: string, archived: boolean, now: number): Result<AppData> {
  const result = setArchived(data.projects, id, archived);
  if (!result.ok) return result;
  const next = { ...data, projects: result.value };
  return ok(archived && runningEntry(data.entries)?.projectId === id ? stopAction(next, now) : next);
}

export function updateSettingsAction(data: AppData, patch: Partial<Settings>): AppData {
  const merged = { ...data.settings, ...patch };
  const minutes = Number.isFinite(merged.awayThresholdMinutes)
    ? Math.min(120, Math.max(1, Math.round(merged.awayThresholdMinutes)))
    : DEFAULT_SETTINGS.awayThresholdMinutes;
  return { ...data, settings: { ...merged, awayThresholdMinutes: minutes } };
}

export function heartbeatAction(data: AppData, now: number): AppData {
  if (!runningEntry(data.entries)) {
    return data.lastSeen === null && data.pendingAway === null ? data : { ...data, lastSeen: null, pendingAway: null };
  }
  const threshold = thresholdMs(data.settings);
  const gap = detectGap(data.lastSeen, now, Math.max(threshold, HEARTBEAT_MIN_GAP_MS));
  const pendingAway = gap
    ? mergeAway(data.pendingAway, data.entries, gap, threshold)
    : cleanPending(data.pendingAway, data.entries);
  return { ...data, pendingAway, lastSeen: toIso(now) };
}

export function awayAction(data: AppData, period: Period): AppData {
  const pendingAway = mergeAway(data.pendingAway, data.entries, period, thresholdMs(data.settings));
  return pendingAway === data.pendingAway ? data : { ...data, pendingAway };
}

export function resolveAwayAction(data: AppData, choice: AwayChoice, now: number, newId: NewId): AppData {
  if (!data.pendingAway) return data;
  const entries = resolveAway(data.entries, data.pendingAway, choice, newId);
  const next = withEntries({ ...data, pendingAway: null }, entries);
  return runningEntry(entries) ? { ...next, lastSeen: toIso(now) } : next;
}
```

- [ ] **Step 4: Run all tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: all test files PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/domain/appActions.ts src/domain/appActions.test.ts
git commit -m "feat: app-level actions over AppData" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: UI shell, persistence hook and Projects tab

**Files:**
- Create: `src/ui/styles.css`, `src/ui/useAppData.ts`, `src/ui/useNow.ts`, `src/ui/newId.ts`, `src/ui/ProjectsView.tsx`
- Modify: `src/ui/App.tsx` (replace placeholder), `src/main.tsx` (import styles)

**Interfaces:**
- Consumes: `loadData`, `saveData`, `STORAGE_KEY` (store); `addProjectAction`, `renameProjectAction`, `setArchivedAction`, `setProjectColorAction` (appActions); `PALETTE`.
- Produces:
  - `type AppStore = { data: AppData; warning: string | null; update(change: (d: AppData) => AppData): void; tryUpdate(change: (d: AppData) => Result<AppData>): string | null; dismissWarning(): void }` and `useAppData(): AppStore`
  - `useNow(intervalMs?: number): number`
  - `newId(): string`
  - `ProjectsView({ store, now })`
  - `App` with tabs `today | week | projects | settings`; Tasks 11–13 replace the placeholders, Task 14 gives the final file.

- [ ] **Step 1: Write `src/ui/styles.css`**

```css
:root {
  --bg: #f7f7f8;
  --surface: #ffffff;
  --text: #1d1d1f;
  --muted: #6b6b73;
  --border: #dcdce0;
  --accent: #3b6cf6;
  --accent-text: #ffffff;
  --danger: #d13b3b;
  --warn-bg: #fff4d6;
  --warn-text: #5c4400;
  color-scheme: light dark;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #151517;
    --surface: #1f1f23;
    --text: #ececf0;
    --muted: #9a9aa3;
    --border: #34343a;
    --accent: #6b8fff;
    --accent-text: #0b0b0d;
    --danger: #ff6b6b;
    --warn-bg: #3a3014;
    --warn-text: #ffe2a0;
  }
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
.app { max-width: 880px; margin: 0 auto; padding: 16px; }
.app-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
h1 { font-size: 1.25rem; margin: 0; }
h2 { font-size: 1.05rem; margin: 0 0 12px; }
button, input, select { font: inherit; color: inherit; }
button { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; cursor: pointer; }
button:hover { border-color: var(--muted); }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
button.danger { color: var(--danger); }
input, select { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; min-width: 0; }
.tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.tab.active { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.panel-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.panel-head h2 { margin: 0; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.muted { color: var(--muted); }
.error { color: var(--danger); margin: 8px 0 0; }
.banner { display: flex; gap: 12px; align-items: center; justify-content: space-between; background: var(--warn-bg); color: var(--warn-text); padding: 10px 12px; border-radius: 8px; margin-bottom: 16px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }

.project-list { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; }
.project { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.project.archived .project-name { opacity: 0.55; }
.project-name { flex: 1 1 160px; }
.swatches { display: flex; gap: 4px; }
.swatch { width: 22px; height: 22px; padding: 0; border-radius: 50%; border: 2px solid transparent; }
.swatch[aria-checked='true'] { border-color: var(--text); }

.timer { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.timer select { flex: 1 1 160px; }
.timer .elapsed { font-variant-numeric: tabular-nums; font-size: 1.6rem; min-width: 7ch; text-align: right; }
.timer .note { flex: 1 1 100%; }
.big { font-size: 1.05rem; padding: 10px 20px; }

.totals { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 12px; }
.entry-list { list-style: none; margin: 0; padding: 0; }
.entry { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; padding: 10px 0; border-top: 1px solid var(--border); }
.entry-main { min-width: 0; }
.entry-note { color: var(--muted); overflow-wrap: anywhere; }
.entry-side { display: flex; gap: 6px; align-items: center; justify-content: flex-end; font-variant-numeric: tabular-nums; }

.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 12px; }
.form-grid label { display: grid; gap: 4px; font-size: 0.9rem; color: var(--muted); }
.form-grid .wide { grid-column: 1 / -1; }

.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 8px; text-align: right; border-bottom: 1px solid var(--border); white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
th button { border: none; background: none; padding: 2px 4px; font-weight: 600; }
th button[aria-pressed='true'] { color: var(--accent); text-decoration: underline; }
tfoot td { font-weight: 600; }

.overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: grid; place-items: center; padding: 16px; z-index: 10; }
.dialog { background: var(--surface); border-radius: 12px; padding: 20px; max-width: 480px; width: 100%; }
.dialog .row { margin-top: 16px; }

.settings label { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.settings input[type='number'] { width: 6em; }
.settings h2:not(:first-child) { margin-top: 20px; }
```

- [ ] **Step 2: Import the styles in `src/main.tsx`**

Add the line `import './ui/styles.css';` after the `App` import, so the file reads:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Write `src/ui/newId.ts` and `src/ui/useNow.ts`**

`src/ui/newId.ts`:
```ts
export const newId = (): string => crypto.randomUUID();
```

`src/ui/useNow.ts`:
```ts
import { useEffect, useState } from 'react';

/** Current time, refreshed every `intervalMs` so live durations re-render. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

- [ ] **Step 4: Write `src/ui/useAppData.ts`**

The latest data is kept in a ref so actions never run twice under StrictMode (side effects stay out of `setState` updaters) and so an action that generates ids is applied exactly once.

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData, Result } from '../domain/types';
import { loadData, saveData, STORAGE_KEY } from '../storage/store';

export type AppStore = {
  data: AppData;
  warning: string | null;
  update: (change: (data: AppData) => AppData) => void;
  /** Applies the change if it succeeds; returns the error message otherwise. */
  tryUpdate: (change: (data: AppData) => Result<AppData>) => string | null;
  dismissWarning: () => void;
};

export function useAppData(): AppStore {
  const [initial] = useState(() => loadData(window.localStorage, Date.now()));
  const dataRef = useRef(initial.data);
  const [data, setData] = useState(initial.data);
  const [warning, setWarning] = useState(initial.warning);

  const commit = useCallback((next: AppData) => {
    if (next === dataRef.current) return;
    dataRef.current = next;
    setData(next);
    try {
      saveData(window.localStorage, next);
    } catch {
      setWarning('Could not save to browser storage. Export a JSON backup to keep your data.');
    }
  }, []);

  const update = useCallback((change: (data: AppData) => AppData) => commit(change(dataRef.current)), [commit]);

  const tryUpdate = useCallback(
    (change: (data: AppData) => Result<AppData>) => {
      const result = change(dataRef.current);
      if (!result.ok) return result.error;
      commit(result.value);
      return null;
    },
    [commit],
  );

  // Another tab changed the data: adopt it.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const loaded = loadData(window.localStorage, Date.now());
      dataRef.current = loaded.data;
      setData(loaded.data);
      if (loaded.warning) setWarning(loaded.warning);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const dismissWarning = useCallback(() => setWarning(null), []);

  return { data, warning, update, tryUpdate, dismissWarning };
}
```

- [ ] **Step 5: Write `src/ui/ProjectsView.tsx`**

```tsx
import { type FormEvent, useState } from 'react';
import {
  addProjectAction,
  renameProjectAction,
  setArchivedAction,
  setProjectColorAction,
} from '../domain/appActions';
import { PALETTE } from '../domain/projects';
import type { Project } from '../domain/types';
import { newId } from './newId';
import type { AppStore } from './useAppData';

type Props = { store: AppStore; now: number };

export function ProjectsView({ store, now }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = (event: FormEvent) => {
    event.preventDefault();
    const problem = store.tryUpdate((d) => addProjectAction(d, name, newId));
    setError(problem);
    if (!problem) setName('');
  };

  const sorted = [...store.data.projects].sort(
    (a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name),
  );

  return (
    <section className="panel">
      <h2>Projects</h2>
      <form className="row" onSubmit={add}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project, e.g. job1"
          aria-label="New project name"
        />
        <button type="submit" className="primary">
          Add
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {sorted.length === 0 ? (
        <p className="muted">No projects yet.</p>
      ) : (
        <ul className="project-list">
          {sorted.map((p) => (
            <ProjectRow key={p.id} project={p} store={store} now={now} onError={setError} />
          ))}
        </ul>
      )}
    </section>
  );
}

type RowProps = { project: Project; store: AppStore; now: number; onError: (error: string | null) => void };

function ProjectRow({ project, store, now, onError }: RowProps) {
  const [draft, setDraft] = useState(project.name);

  const commitName = () => {
    if (draft.trim() === project.name) {
      setDraft(project.name);
      return;
    }
    const problem = store.tryUpdate((d) => renameProjectAction(d, project.id, draft));
    onError(problem);
    setDraft(problem ? project.name : draft.trim());
  };

  return (
    <li className={project.archived ? 'project archived' : 'project'}>
      <input
        className="project-name"
        value={draft}
        aria-label={`Name of ${project.name}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <div className="swatches" role="radiogroup" aria-label={`Color of ${project.name}`}>
        {PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={project.color === color}
            aria-label={color}
            className="swatch"
            style={{ background: color }}
            onClick={() => store.update((d) => setProjectColorAction(d, project.id, color))}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => onError(store.tryUpdate((d) => setArchivedAction(d, project.id, !project.archived, now)))}
      >
        {project.archived ? 'Unarchive' : 'Archive'}
      </button>
    </li>
  );
}
```

- [ ] **Step 6: Replace `src/ui/App.tsx`**

```tsx
import { useState } from 'react';
import { ProjectsView } from './ProjectsView';
import { useAppData } from './useAppData';
import { useNow } from './useNow';

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'projects', label: 'Projects' },
  { id: 'settings', label: 'Settings & Data' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function App() {
  const store = useAppData();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('today');

  return (
    <div className="app">
      <header className="app-header">
        <h1>Working Hours</h1>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tab ? 'tab active' : 'tab'}
              aria-current={t.id === tab ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      {store.warning && (
        <div className="banner" role="alert">
          <span>{store.warning}</span>
          <button type="button" onClick={store.dismissWarning}>
            Dismiss
          </button>
        </div>
      )}
      <main>
        {tab === 'today' && <p className="muted">Today view comes in the next task.</p>}
        {tab === 'week' && <p className="muted">Week view comes later.</p>}
        {tab === 'projects' && <ProjectsView store={store} now={now} />}
        {tab === 'settings' && <p className="muted">Settings come later.</p>}
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Typecheck, build and check in the browser**

Run: `npm run build`
Expected: no type errors; build succeeds.

Run: `npm run dev` and open the printed `http://localhost:5173/` URL. Check:
- Projects tab: add `job1` and `job2` (second one gets the green color); adding `JOB1` shows "A project named "JOB1" already exists."; renaming with Enter/blur works; clicking a swatch changes color; Archive greys the row and moves it down.
- Reload the page: projects are still there.
- Toggle macOS dark mode: colors switch.

- [ ] **Step 8: Commit**

```bash
git add src/main.tsx src/ui
git commit -m "feat: app shell with persistence hook and projects tab" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Today tab — timer bar, entry list and entry form

**Files:**
- Create: `src/ui/TimerBar.tsx`, `src/ui/EntryList.tsx`, `src/ui/EntryForm.tsx`, `src/ui/DayPanel.tsx`, `src/ui/TodayView.tsx`
- Modify: `src/ui/App.tsx` (render `TodayView`)

**Interfaces:**
- Consumes: `AppStore`, `newId`; `startAction`, `stopAction`, `setNoteAction`, `saveEntryAction`, `deleteEntryAction`; `runningEntry`, `entryEndMs`; `activeProjects`; `draftFromForm`, `emptyForm`, `formFromEntry`, `EntryFormValues`; `entriesInRange`, `totalMs`, `totalsByProject`; `addDays`, `dayKey`, `formatHM`, `formatHMS`, `startOfDay`, `timeOfDay`, `toMs`.
- Produces:
  - `TimerBar({ store, now, onGoToProjects })`
  - `EntryList({ entries, projects, now, onEdit, onDelete })`
  - `EntryForm({ title, projects, initial, onSubmit, onCancel })` where `onSubmit(values) => string | null` (error or null)
  - `DayPanel({ store, now, dayStart, title })` — reused by the Week tab in Task 12
  - `TodayView({ store, now, onGoToProjects })`

- [ ] **Step 1: Write `src/ui/TimerBar.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { setNoteAction, startAction, stopAction } from '../domain/appActions';
import { runningEntry } from '../domain/entries';
import { activeProjects } from '../domain/projects';
import { formatHMS, toMs } from '../domain/time';
import { newId } from './newId';
import type { AppStore } from './useAppData';

type Props = { store: AppStore; now: number; onGoToProjects: () => void };

export function TimerBar({ store, now, onGoToProjects }: Props) {
  const { data } = store;
  const running = runningEntry(data.entries);
  const choices = activeProjects(data.projects);
  const [selected, setSelected] = useState(running?.projectId ?? '');

  useEffect(() => {
    if (running) setSelected(running.projectId);
  }, [running?.projectId]);

  if (choices.length === 0) {
    return (
      <section className="panel row">
        <span>Create a project to start tracking.</span>
        <button type="button" className="primary" onClick={onGoToProjects}>
          Go to Projects
        </button>
      </section>
    );
  }

  const selectedId = choices.some((p) => p.id === selected) ? selected : (running?.projectId ?? choices[0].id);
  const selectedName = choices.find((p) => p.id === selectedId)?.name ?? '';
  const isSwitch = running !== undefined && running.projectId !== selectedId;

  const onMain = () => {
    if (running && !isSwitch) store.update((d) => stopAction(d, Date.now()));
    else store.update((d) => startAction(d, selectedId, Date.now(), newId));
  };

  return (
    <section className="panel timer">
      <select value={selectedId} onChange={(e) => setSelected(e.target.value)} aria-label="Project">
        {choices.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <span className="elapsed">{running ? formatHMS(now - toMs(running.start)) : '0:00:00'}</span>
      <button type="button" className="primary big" onClick={onMain}>
        {!running ? 'Start' : isSwitch ? `Switch to ${selectedName}` : 'Stop'}
      </button>
      {running && (
        <input
          className="note"
          placeholder="What are you working on? (optional)"
          aria-label="Note for the running timer"
          value={running.note ?? ''}
          onChange={(e) => store.update((d) => setNoteAction(d, e.target.value))}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 2: Write `src/ui/EntryList.tsx`**

```tsx
import { entryEndMs } from '../domain/entries';
import { dayKey, formatHM, timeOfDay, toMs } from '../domain/time';
import type { Entry, Project } from '../domain/types';

type Props = {
  entries: Entry[];
  projects: Project[];
  now: number;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
};

export function EntryList({ entries, projects, now, onEdit, onDelete }: Props) {
  if (entries.length === 0) return <p className="muted">No entries.</p>;
  const byId = new Map(projects.map((p) => [p.id, p]));

  return (
    <ul className="entry-list">
      {entries.map((entry) => {
        const project = byId.get(entry.projectId);
        const running = entry.end === null;
        const start = toMs(entry.start);
        const end = entryEndMs(entry, now);
        const nextDay = !running && dayKey(end) !== dayKey(start);
        return (
          <li key={entry.id} className="entry">
            <div className="entry-main">
              <span className="dot" style={{ background: project?.color ?? 'gray' }} />
              <strong>{project?.name ?? 'Unknown project'}</strong>{' '}
              <span className="muted">
                {timeOfDay(start)}–{running ? 'now' : timeOfDay(end)}
                {nextDay ? ' (+1 day)' : ''}
              </span>
              {entry.note && <div className="entry-note">{entry.note}</div>}
            </div>
            <div className="entry-side">
              <span>{formatHM(end - start)}</span>
              {!running && (
                <>
                  <button type="button" onClick={() => onEdit(entry)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => onDelete(entry)}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 3: Write `src/ui/EntryForm.tsx`**

```tsx
import { type ChangeEvent, type FormEvent, useState } from 'react';
import type { EntryFormValues } from '../domain/entryForm';
import type { Project } from '../domain/types';

type Props = {
  title: string;
  projects: Project[];
  initial: EntryFormValues;
  /** Returns an error message, or null when saved. */
  onSubmit: (values: EntryFormValues) => string | null;
  onCancel: () => void;
};

export function EntryForm({ title, projects, initial, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const choices = projects.filter((p) => !p.archived || p.id === initial.projectId);

  const set = (key: keyof EntryFormValues) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(onSubmit(values));
  };

  return (
    <form className="panel" onSubmit={submit} aria-label={title}>
      <h2>{title}</h2>
      <div className="form-grid">
        <label>
          Project
          <select value={values.projectId} onChange={set('projectId')} required>
            <option value="" disabled>
              Choose…
            </option>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={values.date} onChange={set('date')} required />
        </label>
        <label>
          Start
          <input type="time" value={values.startTime} onChange={set('startTime')} required />
        </label>
        <label>
          End
          <input type="time" value={values.endTime} onChange={set('endTime')} />
        </label>
        <label>
          or duration (h:mm)
          <input value={values.duration} onChange={set('duration')} placeholder="1:30" />
        </label>
        <label className="wide">
          Note
          <input value={values.note} onChange={set('note')} />
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="primary">
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Write `src/ui/DayPanel.tsx`**

```tsx
import { useState } from 'react';
import { deleteEntryAction, saveEntryAction } from '../domain/appActions';
import { runningEntry } from '../domain/entries';
import { draftFromForm, emptyForm, type EntryFormValues, formFromEntry } from '../domain/entryForm';
import { activeProjects } from '../domain/projects';
import { addDays, formatHM } from '../domain/time';
import { entriesInRange, totalMs, totalsByProject } from '../domain/totals';
import type { Entry } from '../domain/types';
import { EntryForm } from './EntryForm';
import { EntryList } from './EntryList';
import { newId } from './newId';
import type { AppStore } from './useAppData';

type Props = { store: AppStore; now: number; dayStart: number; title: string };
type Editing = { entryId?: string; values: EntryFormValues };

export function DayPanel({ store, now, dayStart, title }: Props) {
  const { data } = store;
  const [editing, setEditing] = useState<Editing | null>(null);
  const dayEnd = addDays(dayStart, 1);
  const entries = entriesInRange(data.entries, dayStart, dayEnd, now);
  const byProject = totalsByProject(data.entries, dayStart, dayEnd, now);
  const projectsById = new Map(data.projects.map((p) => [p.id, p]));
  const defaultProject = runningEntry(data.entries)?.projectId ?? activeProjects(data.projects)[0]?.id ?? '';

  const submit = (values: EntryFormValues) => {
    const draft = draftFromForm(values);
    if (!draft.ok) return draft.error;
    const problem = store.tryUpdate((d) => saveEntryAction(d, draft.value, Date.now(), newId, editing?.entryId));
    if (!problem) setEditing(null);
    return problem;
  };

  const remove = (entry: Entry) => {
    if (window.confirm('Delete this entry?')) store.update((d) => deleteEntryAction(d, entry.id));
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          {title} · {formatHM(totalMs(data.entries, dayStart, dayEnd, now))}
        </h2>
        <button type="button" onClick={() => setEditing({ values: emptyForm(defaultProject, dayStart) })}>
          + Add entry
        </button>
      </div>
      {Object.keys(byProject).length > 0 && (
        <div className="totals">
          {Object.entries(byProject).map(([id, ms]) => (
            <span key={id}>
              <span className="dot" style={{ background: projectsById.get(id)?.color }} />
              {projectsById.get(id)?.name ?? 'Unknown project'} {formatHM(ms)}
            </span>
          ))}
        </div>
      )}
      {editing && (
        <EntryForm
          key={editing.entryId ?? 'new'}
          title={editing.entryId ? 'Edit entry' : 'Add entry'}
          projects={data.projects}
          initial={editing.values}
          onSubmit={submit}
          onCancel={() => setEditing(null)}
        />
      )}
      <EntryList
        entries={entries}
        projects={data.projects}
        now={now}
        onEdit={(entry) => setEditing({ entryId: entry.id, values: formFromEntry(entry) })}
        onDelete={remove}
      />
    </section>
  );
}
```

- [ ] **Step 5: Write `src/ui/TodayView.tsx`**

```tsx
import { startOfDay } from '../domain/time';
import { DayPanel } from './DayPanel';
import { TimerBar } from './TimerBar';
import type { AppStore } from './useAppData';

type Props = { store: AppStore; now: number; onGoToProjects: () => void };

export function TodayView({ store, now, onGoToProjects }: Props) {
  const today = startOfDay(now);
  return (
    <>
      <TimerBar store={store} now={now} onGoToProjects={onGoToProjects} />
      <DayPanel key={today} store={store} now={now} dayStart={today} title="Today" />
    </>
  );
}
```

- [ ] **Step 6: Render the Today tab in `src/ui/App.tsx`**

Add the import `import { TodayView } from './TodayView';` and replace
```tsx
        {tab === 'today' && <p className="muted">Today view comes in the next task.</p>}
```
with
```tsx
        {tab === 'today' && <TodayView store={store} now={now} onGoToProjects={() => setTab('projects')} />}
```

- [ ] **Step 7: Typecheck, build and check in the browser**

Run: `npm run build`
Expected: no type errors; build succeeds.

Run: `npm run dev`, open the URL and check:
- With no projects, Today shows "Create a project to start tracking" and the button opens Projects.
- Start `job1`: elapsed counts up; type a note; reload — timer and note survive.
- Select `job2`: button says "Switch to job2"; click it — the `job1` entry ends and `job2` runs (if `job1` ran under a minute, its entry disappears).
- Stop after more than a minute: the entry appears with a duration and Edit/Delete.
- "+ Add entry" for 08:00–08:30 saves. Adding 08:15 with duration 0:30 shows "Overlaps with job1, <today> 08:00–08:30.". Start 23:00 / end 01:00 for yesterday's date saves and shows on Today as "(+1 day)".
- Edit an entry, change project and times, save; Delete asks for confirmation.
- Today's total and per-project totals add up.

- [ ] **Step 8: Commit**

```bash
git add src/ui
git commit -m "feat: today tab with timer, entries and manual entry form" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Week tab

**Files:**
- Create: `src/ui/WeekView.tsx`
- Modify: `src/ui/App.tsx` (render `WeekView`)

**Interfaces:**
- Consumes: `weekGrid`; `addDays`, `formatHM`, `startOfWeek`; `DayPanel` (Task 11); `AppStore`.
- Produces: `WeekView({ store, now })`.

- [ ] **Step 1: Write `src/ui/WeekView.tsx`**

```tsx
import { useState } from 'react';
import { addDays, formatHM, startOfWeek } from '../domain/time';
import { weekGrid } from '../domain/totals';
import { DayPanel } from './DayPanel';
import type { AppStore } from './useAppData';

type Props = { store: AppStore; now: number };

const dayLabel = (day: number) =>
  new Date(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function WeekView({ store, now }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(now));
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const grid = weekGrid(store.data.entries, weekStart, now);
  const projectsById = new Map(store.data.projects.map((p) => [p.id, p]));

  const goTo = (start: number) => {
    setWeekStart(start);
    setSelectedDay(null);
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>
            Week of {new Date(weekStart).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
          </h2>
          <div className="row">
            <button type="button" aria-label="Previous week" onClick={() => goTo(addDays(weekStart, -7))}>
              ←
            </button>
            <button type="button" onClick={() => goTo(startOfWeek(Date.now()))}>
              This week
            </button>
            <button type="button" aria-label="Next week" onClick={() => goTo(addDays(weekStart, 7))}>
              →
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                {grid.days.map((day) => (
                  <th key={day}>
                    <button
                      type="button"
                      aria-pressed={selectedDay === day}
                      onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                    >
                      {dayLabel(day)}
                    </button>
                  </th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    No time tracked this week. Click a day to add an entry.
                  </td>
                </tr>
              )}
              {grid.rows.map((row) => {
                const project = projectsById.get(row.projectId);
                return (
                  <tr key={row.projectId}>
                    <td>
                      <span className="dot" style={{ background: project?.color ?? 'gray' }} />
                      {project?.name ?? 'Unknown project'}
                    </td>
                    {row.perDay.map((ms, i) => (
                      <td key={i}>{ms > 0 ? formatHM(ms) : '–'}</td>
                    ))}
                    <td>{formatHM(row.total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                {grid.dayTotals.map((ms, i) => (
                  <td key={i}>{formatHM(ms)}</td>
                ))}
                <td>{formatHM(grid.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      {selectedDay !== null && (
        <DayPanel
          key={selectedDay}
          store={store}
          now={now}
          dayStart={selectedDay}
          title={new Date(selectedDay).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Render the Week tab in `src/ui/App.tsx`**

Add the import `import { WeekView } from './WeekView';` and replace
```tsx
        {tab === 'week' && <p className="muted">Week view comes later.</p>}
```
with
```tsx
        {tab === 'week' && <WeekView store={store} now={now} />}
```

- [ ] **Step 3: Typecheck, build and check in the browser**

Run: `npm run build`
Expected: no type errors; build succeeds.

Run: `npm run dev` and check:
- The week starts on Monday; each project with time has a row; the row, column and grand totals match the Today tab for today.
- An entry from 23:00 to 01:00 is split across two day columns.
- ← / → / "This week" navigate; clicking a day header shows that day's entries below with Add/Edit/Delete; clicking it again hides them.
- At a 375 px wide window, the table scrolls horizontally inside its panel and the page itself doesn't.

- [ ] **Step 4: Commit**

```bash
git add src/ui
git commit -m "feat: week tab with per-project grid and day details" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Settings & Data tab

**Files:**
- Create: `src/ui/idle-detector.d.ts`, `src/ui/download.ts`, `src/ui/SettingsView.tsx`
- Modify: `src/ui/App.tsx` (render `SettingsView`)

**Interfaces:**
- Consumes: `updateSettingsAction`; `parseAppData`, `toCsv`, `toJson`; `dayKey`; `AppStore`.
- Produces:
  - Global `IdleDetector` type declaration (also used by Task 14).
  - `downloadFile(name: string, content: string, type: string): void`
  - `SettingsView({ store })`

- [ ] **Step 1: Write `src/ui/idle-detector.d.ts`**

Idle Detection is Chromium-only and missing from TypeScript's DOM types.

```ts
interface IdleDetectorStartOptions {
  threshold: number;
  signal?: AbortSignal;
}

declare class IdleDetector extends EventTarget {
  readonly userState: 'active' | 'idle' | null;
  readonly screenState: 'locked' | 'unlocked' | null;
  start(options: IdleDetectorStartOptions): Promise<void>;
  static requestPermission(): Promise<'granted' | 'denied'>;
}
```

- [ ] **Step 2: Write `src/ui/download.ts`**

```ts
export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 3: Write `src/ui/SettingsView.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { updateSettingsAction } from '../domain/appActions';
import { parseAppData, toCsv, toJson } from '../domain/backup';
import { dayKey } from '../domain/time';
import { downloadFile } from './download';
import type { AppStore } from './useAppData';

export function SettingsView({ store }: { store: AppStore }) {
  const { data } = store;
  const [threshold, setThreshold] = useState(String(data.settings.awayThresholdMinutes));
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const idleSupported = 'IdleDetector' in window;

  useEffect(() => setThreshold(String(data.settings.awayThresholdMinutes)), [data.settings.awayThresholdMinutes]);

  const commitThreshold = () => {
    store.update((d) => updateSettingsAction(d, { awayThresholdMinutes: Number(threshold) }));
    setThreshold(String(store.data.settings.awayThresholdMinutes));
  };

  const toggleIdle = async (enabled: boolean) => {
    if (!enabled) {
      store.update((d) => updateSettingsAction(d, { idleDetectionEnabled: false }));
      return;
    }
    try {
      if ((await IdleDetector.requestPermission()) !== 'granted') {
        setMessage('Permission was denied, so only sleep and lid-close are detected.');
        return;
      }
      store.update((d) => updateSettingsAction(d, { idleDetectionEnabled: true }));
      setMessage(null);
    } catch {
      setMessage('Idle detection could not be enabled in this browser.');
    }
  };

  const importFile = async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setMessage('Import failed: the file is not valid JSON.');
      return;
    }
    const result = parseAppData(parsed);
    if (!result.ok) {
      setMessage(`Import failed: ${result.error}`);
      return;
    }
    const { projects, entries } = result.value;
    const question = `Replace ALL current data with ${projects.length} projects and ${entries.length} entries from "${file.name}"?`;
    if (!window.confirm(question)) return;
    store.update(() => result.value);
    setMessage(`Imported ${entries.length} entries.`);
  };

  const stamp = dayKey(Date.now());

  return (
    <section className="panel settings">
      <h2>Away detection</h2>
      <label>
        Ask after
        <input
          type="number"
          min={1}
          max={120}
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          onBlur={commitThreshold}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        minutes away
      </label>
      {idleSupported ? (
        <label>
          <input
            type="checkbox"
            checked={data.settings.idleDetectionEnabled}
            onChange={(e) => void toggleIdle(e.target.checked)}
          />
          Also detect screen lock and inactivity
        </label>
      ) : (
        <p className="muted">
          This browser only notices sleep and a closed lid. Chrome or Edge can also detect a locked screen.
        </p>
      )}

      <h2>Data</h2>
      <div className="row">
        <button type="button" onClick={() => downloadFile(`working-hours-backup-${stamp}.json`, toJson(data), 'application/json')}>
          Export JSON
        </button>
        <button type="button" onClick={() => downloadFile(`working-hours-${stamp}.csv`, toCsv(data), 'text/csv')}>
          Export CSV
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Import JSON…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importFile(file);
          }}
        />
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
```

Note: `commitThreshold` reads `store.data` from the current render, so the displayed value can lag one render; the `useEffect` on `awayThresholdMinutes` corrects it after the update lands.

- [ ] **Step 4: Render the Settings tab in `src/ui/App.tsx`**

Add the import `import { SettingsView } from './SettingsView';` and replace
```tsx
        {tab === 'settings' && <p className="muted">Settings come later.</p>}
```
with
```tsx
        {tab === 'settings' && <SettingsView store={store} />}
```

- [ ] **Step 5: Typecheck, build and check in the browser**

Run: `npm run build`
Expected: no type errors; build succeeds.

Run: `npm run dev` and check:
- Threshold: type `0` and press Enter → shows `1`; type `500` → `120`; reload → value kept.
- In Chrome: ticking the idle checkbox asks for permission; allow → stays ticked. In Safari: the explanatory note appears instead.
- Export JSON and Export CSV download files with today's date in the name; open the CSV in Numbers/Excel — notes with commas stay in one column.
- Delete one entry, then Import JSON with the exported file → confirmation → the entry is back.
- Import a file with `{}` → "Import failed: Unsupported backup version: undefined." and nothing changes.

- [ ] **Step 6: Commit**

```bash
git add src/ui
git commit -m "feat: settings tab with away threshold, export and import" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Away detection in the UI and document title

**Files:**
- Create: `src/ui/useHeartbeat.ts`, `src/ui/useIdleDetector.ts`, `src/ui/AwayDialog.tsx`
- Modify: `src/ui/App.tsx` (final version below)

**Interfaces:**
- Consumes: `heartbeatAction`, `awayAction`, `resolveAwayAction`, `updateSettingsAction`; `AwayChoice`, `Period`; `runningEntry`; `dayKey`, `formatHM`, `timeOfDay`, `toMs`; `PendingAway`; global `IdleDetector` (Task 13).
- Produces:
  - `useHeartbeat(update: AppStore['update']): void`
  - `useIdleDetector(enabled: boolean, onAway: (period: Period) => void, onUnavailable: () => void): void`
  - `AwayDialog({ pending, projectName, onChoose })`

- [ ] **Step 1: Write `src/ui/useHeartbeat.ts`**

```ts
import { useEffect } from 'react';
import { heartbeatAction } from '../domain/appActions';
import type { AppStore } from './useAppData';

export const HEARTBEAT_MS = 30_000;

/** Updates lastSeen while a timer runs; a jump since the last beat means the Mac slept or the page was closed. */
export function useHeartbeat(update: AppStore['update']): void {
  useEffect(() => {
    const beat = () => update((d) => heartbeatAction(d, Date.now()));
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat();
    };
    beat();
    const id = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', beat);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', beat);
    };
  }, [update]);
}
```

- [ ] **Step 2: Write `src/ui/useIdleDetector.ts`**

```ts
import { useEffect, useRef } from 'react';
import type { Period } from '../domain/away';

const IDLE_THRESHOLD_MS = 60_000;

/** Reports an away period when the user returns from inactivity or a locked screen (Chrome/Edge). */
export function useIdleDetector(enabled: boolean, onAway: (period: Period) => void, onUnavailable: () => void): void {
  const callbacks = useRef({ onAway, onUnavailable });
  callbacks.current = { onAway, onUnavailable };

  useEffect(() => {
    if (!enabled) return;
    if (!('IdleDetector' in window)) {
      callbacks.current.onUnavailable();
      return;
    }
    const controller = new AbortController();
    const detector = new IdleDetector();
    let awaySince: number | null = null;

    detector.addEventListener('change', () => {
      const now = Date.now();
      const idle = detector.userState === 'idle';
      const locked = detector.screenState === 'locked';
      if ((idle || locked) && awaySince === null) {
        // "idle" fires after a minute without input; a lock can happen right away.
        awaySince = idle ? now - IDLE_THRESHOLD_MS : now;
      } else if (!idle && !locked && awaySince !== null) {
        callbacks.current.onAway({ from: awaySince, to: now });
        awaySince = null;
      }
    });

    detector.start({ threshold: IDLE_THRESHOLD_MS, signal: controller.signal }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) callbacks.current.onUnavailable();
    });

    return () => controller.abort();
  }, [enabled]);
}
```

- [ ] **Step 3: Write `src/ui/AwayDialog.tsx`**

```tsx
import type { AwayChoice } from '../domain/away';
import { dayKey, formatHM, timeOfDay, toMs } from '../domain/time';
import type { PendingAway } from '../domain/types';

type Props = { pending: PendingAway; projectName: string; onChoose: (choice: AwayChoice) => void };

export function AwayDialog({ pending, projectName, onChoose }: Props) {
  const from = toMs(pending.from);
  const to = toMs(pending.to);
  const toLabel = dayKey(to) === dayKey(from) ? timeOfDay(to) : `${timeOfDay(to)} on ${dayKey(to)}`;

  return (
    <div className="overlay">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="away-title">
        <h2 id="away-title">Were you working?</h2>
        <p>
          You were away {timeOfDay(from)} → {toLabel} ({formatHM(to - from)}) while “{projectName}” was running.
        </p>
        <div className="row">
          <button type="button" onClick={() => onChoose('keep')}>
            Keep as work
          </button>
          <button type="button" className="primary" autoFocus onClick={() => onChoose('discard')}>
            Discard away time
          </button>
          <button type="button" onClick={() => onChoose('stop')}>
            Stop timer at {timeOfDay(from)}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/ui/App.tsx` with the final version**

```tsx
import { useEffect, useState } from 'react';
import { awayAction, resolveAwayAction, updateSettingsAction } from '../domain/appActions';
import { runningEntry } from '../domain/entries';
import { formatHM, toMs } from '../domain/time';
import { AwayDialog } from './AwayDialog';
import { newId } from './newId';
import { ProjectsView } from './ProjectsView';
import { SettingsView } from './SettingsView';
import { TodayView } from './TodayView';
import { useAppData } from './useAppData';
import { useHeartbeat } from './useHeartbeat';
import { useIdleDetector } from './useIdleDetector';
import { useNow } from './useNow';
import { WeekView } from './WeekView';

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'projects', label: 'Projects' },
  { id: 'settings', label: 'Settings & Data' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function App() {
  const store = useAppData();
  const { data, update } = store;
  const now = useNow();
  const [tab, setTab] = useState<Tab>('today');

  useHeartbeat(update);
  useIdleDetector(
    data.settings.idleDetectionEnabled,
    (period) => update((d) => awayAction(d, period)),
    () => update((d) => updateSettingsAction(d, { idleDetectionEnabled: false })),
  );

  const projectName = (id: string | undefined) => data.projects.find((p) => p.id === id)?.name ?? '';
  const running = runningEntry(data.entries);
  const title = running ? `${formatHM(now - toMs(running.start))} · ${projectName(running.projectId)}` : 'Working Hours';
  useEffect(() => {
    document.title = title;
  }, [title]);

  const pending = data.pendingAway;
  const pendingEntry = pending ? data.entries.find((e) => e.id === pending.entryId) : undefined;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Working Hours</h1>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tab ? 'tab active' : 'tab'}
              aria-current={t.id === tab ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      {store.warning && (
        <div className="banner" role="alert">
          <span>{store.warning}</span>
          <button type="button" onClick={store.dismissWarning}>
            Dismiss
          </button>
        </div>
      )}
      <main>
        {tab === 'today' && <TodayView store={store} now={now} onGoToProjects={() => setTab('projects')} />}
        {tab === 'week' && <WeekView store={store} now={now} />}
        {tab === 'projects' && <ProjectsView store={store} now={now} />}
        {tab === 'settings' && <SettingsView store={store} />}
      </main>
      {pending && (
        <AwayDialog
          pending={pending}
          projectName={projectName(pendingEntry?.projectId)}
          onChoose={(choice) => update((d) => resolveAwayAction(d, choice, Date.now(), newId))}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck, build and check in the browser**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds.

Run: `npm run dev` and check:
- Start a timer: the browser tab title shows `0:00 · job1` and updates each minute.
- Simulated sleep: in the DevTools console run
  ```js
  const k = 'working-hours:v1';
  const d = JSON.parse(localStorage[k]);
  const run = d.entries.find((e) => e.end === null);
  run.start = new Date(Date.now() - 60 * 60000).toISOString();
  d.lastSeen = new Date(Date.now() - 20 * 60000).toISOString();
  localStorage[k] = JSON.stringify(d);
  location.reload();
  ```
  Expected: the dialog says away for about 20 minutes. "Discard away time" leaves two entries for the project (about 40 min ended, and a running one from about now). Repeat and try "Stop timer at …" (the timer stops at that time) and "Keep as work" (nothing changes).
- Real sleep: start a timer, close the lid for more than 5 minutes, open it: the dialog appears.
- Chrome with idle detection on: start a timer, lock the screen (Ctrl+Cmd+Q) for more than 5 minutes, unlock: the dialog appears.
- Two tabs: stopping the timer in one tab updates the other.

- [ ] **Step 6: Commit**

```bash
git add src/ui
git commit -m "feat: away dialog with heartbeat and idle detection" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Working Hours

A personal time tracker in the browser: start/stop a timer per project, add entries by hand,
see daily and weekly totals, export/import JSON and CSV. Data stays in this browser's localStorage.

## Run

    npm install
    npm run dev      # http://localhost:5173
    npm test
    npm run build    # static site in dist/ (relative paths, any static host)

## Notes

- Data is per browser and per address: localhost and a deployed URL have separate data.
  Move it with Settings & Data → Export JSON / Import JSON.
- Away detection works while the page is open (a background tab is fine). Chrome/Edge can
  also detect a locked screen when enabled in Settings.
- If Chrome's Memory Saver discards the tab, reopening it may ask about time you were not away;
  choose "Keep as work", or exclude the site from Memory Saver.
```

- [ ] **Step 2: Run the full check**

Run: `npm test && npm run build && npx vite preview`
Expected: all tests PASS; build succeeds; open the preview URL (`http://localhost:4173/`) and confirm the production build loads, a timer starts and stops, and the Week tab renders.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

# Working Hours — Design

Date: 2026-10-08
Status: Draft for review

## Goal

A personal web page that shows how much time I spend on work, split by project
(job1, job2, …). Work happens mostly on one MacBook in irregular sessions
(e.g. 10 min, a break outside, then 1 h). Time is captured with a start/stop
timer or entered manually. The page notices when I step away while a timer is
running and asks what to do with that time.

Success: I can start/stop/switch a timer in one click, fix or add entries by
hand, see daily and weekly totals per project, and never silently count time
I spent away from the Mac (beyond a small threshold).

### Out of scope (v1)

- Server, accounts, multi-device sync (data lives in one browser).
- Automatic tracking without a running timer.
- Monthly view, reports beyond the week grid, invoicing/rates.
- Deployment (the build must be static and deployable, but deploying is a
  later step).

## Stack

Vite + React + TypeScript, Vitest for tests. Static build (`npm run build`)
with no backend. Data in `localStorage`.

## Data model

```ts
type Project = {
  id: string;          // crypto.randomUUID()
  name: string;        // unique among non-archived projects, trimmed, non-empty
  color: string;       // hex, e.g. "#4f7cff"
  archived: boolean;
};

type Entry = {
  id: string;
  projectId: string;
  start: string;       // ISO 8601 timestamp (UTC)
  end: string | null;  // null = running timer
  note?: string;
  untimed?: true;      // duration-only entry: start = local midnight of its date
  source: "timer" | "manual";
};

type Settings = {
  awayThresholdMinutes: number;  // default 5, min 1, max 120
  idleDetectionEnabled: boolean; // default false
};

type PendingAway = {
  entryId: string;     // running entry the away period belongs to
  from: string;        // ISO, when I left
  to: string;          // ISO, when I came back
};

type AppData = {
  version: 1;
  projects: Project[];
  entries: Entry[];
  settings: Settings;
  pendingAway: PendingAway | null;
  lastSeen: string | null;  // ISO, heartbeat timestamp while a timer runs
};
```

Stored under the single key `working-hours:v1` and written on every change.
On load, invalid or missing data falls back to an empty `AppData`. Corrupt
JSON is never silently discarded: the raw string is kept under
`working-hours:v1:corrupt-<timestamp>` and the UI shows a warning.

## Rules

1. **One running timer.** At most one entry has `end: null`.
2. **Start** with project P: if a timer is running, stop it now, then create
   a new running entry for P starting now (source `timer`). Starting the
   project that is already running does nothing.
3. **Stop:** set `end` to now.
4. **Short entries are kept.** A timer entry is saved however short it is
   (stop, switch, or an away cut). Only a zero-length entry (end = start) is
   dropped, since it records nothing. The entry list shows durations under a
   minute in seconds (`42s`); totals stay `h:mm`.
5. **No overlaps.** Adding or editing an entry so that `[start, end)`
   intersects another entry's interval (a running entry's interval extends to
   now) is rejected with an error naming the clashing entry (project, time
   range). Touching boundaries (one ends at 14:00, next starts at 14:00) is
   allowed.
6. **Manual entries — what matters is the duration per project.** The form
   needs project, date and duration in whole minutes (`15`, `120`); note,
   start and end are optional and come last. Project defaults to the running
   timer's, else the latest entry's; date defaults to the shown day; the cursor
   starts in the first empty required field (usually Minutes) and Enter saves.
   Required fields are large and bold, optional ones small. Without a start time the entry is *untimed*: it
   counts fully toward its date and project, shows no time range, and is never
   checked for overlaps. With a start time it is timed as before: either an
   end time or a duration; an end time earlier than the start means the next
   day; `end` not in the future; no overlaps. An end time without a start time
   is an error. All entries: duration > 0 and ≤ 24 h; an untimed entry's date
   can't be in the future.
7. **Day split.** Totals per day clip each entry to that day's local
   midnight boundaries (23:00–01:00 adds 1 h to each day). Weeks run
   Monday–Sunday in local time.
8. **Projects.** Deleting a project is not offered; archiving hides it from
   the timer dropdown and the manual-entry form but keeps its entries and
   totals visible. Archiving the project of a running timer stops the timer.
9. **Display.** Durations as `h:mm` (e.g. `0:07`, `12:30`); the live timer
   as `h:mm:ss`.

## UI

Single page, four tabs. Follows system light/dark mode.

**Today** (default)
- Timer bar: project dropdown (non-archived), Start/Stop button, live elapsed
  `h:mm:ss`, optional note field (saved to the running entry). While running,
  `document.title` = `"1:24 · job1"`; otherwise `"Working Hours"`.
- Today's entries, newest first: time range, project (color dot), note,
  duration, Edit and Delete (delete asks for confirmation). The running entry
  appears at the top with a live duration and can't be deleted (stop it
  first).
- Totals: today overall and per project.
- "+ Add entry" opens the entry form (project, date, minutes, then optional
  note, start and end). Adding 15 minutes to the current project is: press
  `A` (or click "+ Add entry (A)"), type `15`, press Enter. `A` works from any
  tab (it switches to Today), is matched by key position so it works on any
  keyboard layout, and is ignored while typing in a field, with Cmd/Ctrl/Alt
  held, or while the away dialog is open. Escape closes the form. The same form is used for editing. Time ranges in
  the list are shown smaller than project and duration; untimed entries have
  none.

**Week**
- Grid: rows = projects that have time in the week, columns = Mon–Sun, row
  totals, column totals, grand total. Prev/next week and "this week" buttons.
- Clicking a day header shows that day's entries below the grid (same list
  component as Today, with edit/delete).

**Projects**
- List with name, color, archived state. Add, rename, change color (preset
  palette of 8 colors), archive/unarchive.
- First run with no projects: the Today tab shows a prompt to create one.

**Settings & Data**
- Away threshold (minutes), idle-detection toggle (shown only if the browser
  supports `IdleDetector`; enabling it requests permission).
- Export JSON: downloads `working-hours-backup-YYYY-MM-DD.json` (full
  `AppData`).
- Export CSV: `working-hours-YYYY-MM-DD.csv` with columns
  `date,project,start,end,duration_minutes,note,source` (local time,
  finished entries only; start/end empty for untimed entries).
- Import JSON: validates the file; if valid, asks for confirmation, then
  replaces all data. If invalid, shows what is wrong and changes nothing.

## Away detection

Active only while a timer is running.

**Heartbeat (all browsers).** Every 30 s the page sets `lastSeen = now`.
On each tick, on page load, and when the tab becomes visible or focused, if
a timer is running and `now - lastSeen ≥ max(threshold, 2 min)`, an away
period `[lastSeen, now]` is detected. JS timers freeze while the Mac sleeps
or the lid is closed, and nothing runs while the browser is closed, so the
jump reveals the gap. The 2-minute floor exists because Chrome throttles
background tabs to about one tick per minute, which must not look like an
absence. Starting a timer sets `lastSeen = now`, so time before the start is
never treated as away; an away period is also clamped to start no earlier
than the running entry.

**Idle Detection (Chrome/Edge, opt-in).** An `IdleDetector` with a 60 s
threshold. When it reports `userState: "idle"`, the away start is recorded
as `now - 60 s` (idle fires after a minute without input); when it reports
`screenState: "locked"` first, the away start is `now`, since a lock can
happen right after typing. When it reports active and
unlocked again, an away period `[awayStart, now]` is detected. This covers a
locked screen while the Mac stays awake. If permission is denied, the toggle
switches back off and shows a note.

**Resolving.** An away period shorter than the threshold is ignored (counted
as work). Otherwise it is stored as `pendingAway` (if one already exists for
the same entry, its `to` is extended to the new end, keeping the earliest
`from`) and a modal dialog appears:

> You were away 14:05 → 14:57 (52 min) while "job1" was running.
> [Keep as work] [Discard away time] [Stop timer at 14:05]

- **Keep as work:** clear `pendingAway`; the entry is unchanged.
- **Discard away time:** set the running entry's `end = from`, then create a
  new running entry for the same project and note starting at `to`.
- **Stop timer at `from`:** set the running entry's `end = from`.

The entry cut at `from` is kept however short (only a zero-length cut is dropped).
`pendingAway` is persisted, so the dialog reappears after a reload. If the
running entry was stopped or deleted in the meantime, the pending away period
is dropped.

**Known limits:** the page must stay open (a background tab is fine) for the
idle signal; Safari/Firefox only get the heartbeat signal. If the browser
discards the tab to save memory (Chrome Memory Saver) or throttles it for
longer than the threshold, the reload/next tick can raise a false away
prompt; "Keep as work" resolves it, and the site can be excluded from Memory
Saver.

Multiple open tabs stay in sync through the `storage` event.

## Code structure

```
src/
  domain/          pure functions, no React, no localStorage; time passed in
    types.ts       AppData types, defaults, Result helper
    time.ts        duration math, h:mm formatting, local day/week ranges, day clipping
    entries.ts     start/stop/switch, add/edit/delete validation, overlap check, short entries
    entryForm.ts   form values (date, start, end-or-duration) ↔ entry draft
    projects.ts    add/rename/recolor/archive validation
    totals.ts      per-day and per-project totals, week grid
    away.ts        detect away period from (lastSeen, now, threshold); merge pending; resolve actions
    backup.ts      AppData validation for import, JSON export, CSV export
    appActions.ts  every user action as AppData → AppData (composes the modules above)
  storage/
    store.ts       load/save AppData to localStorage, corrupt-data handling
  ui/
    App.tsx, TimerBar.tsx, TodayView.tsx, WeekView.tsx, ProjectsView.tsx,
    SettingsView.tsx, EntryList.tsx, EntryForm.tsx, AwayDialog.tsx
    useAppData.ts      state + persistence hook
    useHeartbeat.ts    30 s tick, lastSeen, away detection
    useIdleDetector.ts IdleDetector wrapper
```

Domain functions take the current time as a parameter (no `Date.now()`
inside), which makes them deterministic in tests.

## Testing

- Domain modules written test-first with Vitest: overlap edge cases
  (touching boundaries, running entry), midnight split, week boundaries,
  short and zero-length entries, switching projects, away detection and all three
  resolutions, pending-away merge, import validation, CSV escaping.
- `store.ts` tested against a fake `localStorage` (including corrupt data).
- UI checked by hand in the browser: timer start/stop/switch, manual
  add/edit, week grid, export/import round trip, and away detection
  (simulated by setting `lastSeen` back in localStorage, plus a real screen
  lock in Chrome).

## Deployment (later)

`vite build` with a relative `base` so the `dist/` folder works on GitHub
Pages or any static host. Data on the deployed site is separate from
`localhost`; move it once with Export/Import JSON.

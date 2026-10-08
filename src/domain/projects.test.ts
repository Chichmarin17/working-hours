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

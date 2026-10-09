import { useState } from 'react';
import { deleteEntryAction, saveEntryAction } from '../domain/appActions';
import { draftFromForm, emptyForm, type EntryFormValues, formFromEntry } from '../domain/entryForm';
import { currentProjectId } from '../domain/projects';
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
  const defaultProject = currentProjectId(data.projects, data.entries);

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

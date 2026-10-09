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
          Duration (h:mm)
          <input value={values.duration} onChange={set('duration')} placeholder="1:30" />
        </label>
        <label className="wide">
          Note
          <input value={values.note} onChange={set('note')} />
        </label>
        <label>
          Start (optional)
          <input type="time" value={values.startTime} onChange={set('startTime')} />
        </label>
        <label>
          End (optional)
          <input type="time" value={values.endTime} onChange={set('endTime')} />
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

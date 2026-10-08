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

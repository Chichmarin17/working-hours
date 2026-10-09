import { entryEndMs } from '../domain/entries';
import { dayKey, formatEntryDuration, timeOfDay, toMs } from '../domain/time';
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
              <span>{formatEntryDuration(end - start)}</span>
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

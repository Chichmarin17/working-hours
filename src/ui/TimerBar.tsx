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

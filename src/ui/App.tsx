import { useEffect, useState } from 'react';
import { awayAction, resolveAwayAction, updateSettingsAction } from '../domain/appActions';
import { runningEntry } from '../domain/entries';
import { formatHM, toMs } from '../domain/time';
import { AwayDialog } from './AwayDialog';
import { newId } from './newId';
import { ProjectsView } from './ProjectsView';
import { SettingsView } from './SettingsView';
import { isAddEntryShortcut } from './shortcuts';
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
  const [addRequested, setAddRequested] = useState(false);

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

  // "A" anywhere (outside a field) jumps to Today and opens Add entry.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { code, metaKey, ctrlKey, altKey, repeat } = event;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!isAddEntryShortcut({ code, metaKey, ctrlKey, altKey, repeat, target }, pending !== null)) return;
      event.preventDefault();
      setTab('today');
      setAddRequested(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pending]);

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
        {tab === 'today' && (
          <TodayView
            store={store}
            now={now}
            onGoToProjects={() => setTab('projects')}
            addRequested={addRequested}
            onAddOpened={() => setAddRequested(false)}
          />
        )}
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

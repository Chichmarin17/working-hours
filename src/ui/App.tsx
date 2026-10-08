import { useState } from 'react';
import { ProjectsView } from './ProjectsView';
import { TodayView } from './TodayView';
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
        {tab === 'today' && <TodayView store={store} now={now} onGoToProjects={() => setTab('projects')} />}
        {tab === 'week' && <p className="muted">Week view comes later.</p>}
        {tab === 'projects' && <ProjectsView store={store} now={now} />}
        {tab === 'settings' && <p className="muted">Settings come later.</p>}
      </main>
    </div>
  );
}

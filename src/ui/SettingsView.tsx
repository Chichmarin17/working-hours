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

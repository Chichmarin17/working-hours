import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData, Result } from '../domain/types';
import { loadData, saveData, STORAGE_KEY } from '../storage/store';

export type AppStore = {
  data: AppData;
  warning: string | null;
  update: (change: (data: AppData) => AppData) => void;
  /** Applies the change if it succeeds; returns the error message otherwise. */
  tryUpdate: (change: (data: AppData) => Result<AppData>) => string | null;
  dismissWarning: () => void;
};

export function useAppData(): AppStore {
  const [initial] = useState(() => loadData(window.localStorage, Date.now()));
  const dataRef = useRef(initial.data);
  const [data, setData] = useState(initial.data);
  const [warning, setWarning] = useState(initial.warning);

  const commit = useCallback((next: AppData) => {
    if (next === dataRef.current) return;
    dataRef.current = next;
    setData(next);
    try {
      saveData(window.localStorage, next);
    } catch {
      setWarning('Could not save to browser storage. Export a JSON backup to keep your data.');
    }
  }, []);

  const update = useCallback((change: (data: AppData) => AppData) => commit(change(dataRef.current)), [commit]);

  const tryUpdate = useCallback(
    (change: (data: AppData) => Result<AppData>) => {
      const result = change(dataRef.current);
      if (!result.ok) return result.error;
      commit(result.value);
      return null;
    },
    [commit],
  );

  // Another tab changed the data: adopt it.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const loaded = loadData(window.localStorage, Date.now());
      dataRef.current = loaded.data;
      setData(loaded.data);
      if (loaded.warning) setWarning(loaded.warning);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const dismissWarning = useCallback(() => setWarning(null), []);

  return { data, warning, update, tryUpdate, dismissWarning };
}

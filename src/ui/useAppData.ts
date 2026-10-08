import { useCallback, useEffect, useState } from 'react';
import type { AppData, Result } from '../domain/types';
import { openStore, STORAGE_KEY } from '../storage/store';

export type AppStore = {
  data: AppData;
  warning: string | null;
  update: (change: (data: AppData) => AppData) => void;
  /** Applies the change if it succeeds; returns the error message otherwise. */
  tryUpdate: (change: (data: AppData) => Result<AppData>) => string | null;
  dismissWarning: () => void;
};

export function useAppData(): AppStore {
  const [{ store, warning: initialWarning }] = useState(() => openStore(window.localStorage, Date.now()));
  const [data, setData] = useState(store.data());
  const [warning, setWarning] = useState(initialWarning);

  // Picks up writes from other tabs or hand edits, so a save never overwrites them.
  const sync = useCallback(() => {
    const result = store.refresh(Date.now());
    if (result.warning) setWarning(result.warning);
    if (result.changed) setData(store.data());
  }, [store]);

  const commit = useCallback(
    (next: AppData) => {
      if (next === store.data()) return;
      setData(next);
      try {
        store.save(next);
      } catch {
        setWarning('Could not save to browser storage. Export a JSON backup to keep your data.');
      }
    },
    [store],
  );

  const update = useCallback(
    (change: (data: AppData) => AppData) => {
      sync();
      commit(change(store.data()));
    },
    [store, sync, commit],
  );

  const tryUpdate = useCallback(
    (change: (data: AppData) => Result<AppData>) => {
      sync();
      const result = change(store.data());
      if (!result.ok) return result.error;
      commit(result.value);
      return null;
    },
    [store, sync, commit],
  );

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) sync();
    };
    // A page restored from the back/forward cache may have missed storage events.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [sync]);

  const dismissWarning = useCallback(() => setWarning(null), []);

  return { data, warning, update, tryUpdate, dismissWarning };
}

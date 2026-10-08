import { describe, expect, it } from 'vitest';
import { emptyData } from '../domain/types';
import { loadData, openStore, saveData, STORAGE_KEY } from './store';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe('store', () => {
  it('returns empty data without a warning when nothing is stored', () => {
    expect(loadData(memoryStorage(), 1)).toEqual({ data: emptyData(), warning: null });
  });

  it('round-trips saved data', () => {
    const storage = memoryStorage();
    const data = { ...emptyData(), projects: [{ id: 'p1', name: 'job1', color: '#4f7cff', archived: false }] };
    saveData(storage, data);
    expect(loadData(storage, 1)).toEqual({ data, warning: null });
  });

  it('keeps a copy of corrupt JSON and starts empty with a warning', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{oops' });
    const result = loadData(storage, 1234);
    const backupKey = `${STORAGE_KEY}:corrupt-1234`;
    expect(result.data).toEqual(emptyData());
    expect(storage.map.get(backupKey)).toBe('{oops');
    expect(result.warning).toContain(backupKey);
    expect(storage.map.get(STORAGE_KEY)).toBe('{oops');
  });

  it('treats structurally invalid data the same way and says why', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{"version":7}' });
    const result = loadData(storage, 99);
    expect(storage.map.get(`${STORAGE_KEY}:corrupt-99`)).toBe('{"version":7}');
    expect(result.warning).toContain('Unsupported backup version: 7.');
  });
});

describe('openStore', () => {
  const project = { id: 'p1', name: 'job1', color: '#4f7cff', archived: false };

  it('adopts data written elsewhere before the next save, so the save does not overwrite it', () => {
    const storage = memoryStorage();
    const { store } = openStore(storage, 1);
    saveData(storage, { ...emptyData(), projects: [project] }); // another tab or a hand edit
    expect(store.refresh(2)).toEqual({ changed: true, warning: null });
    store.save({ ...store.data(), lastSeen: '2026-10-08T10:00:00.000Z' });
    expect(loadData(storage, 3).data.projects).toEqual([project]);
  });

  it('does not treat its own writes as outside changes', () => {
    const storage = memoryStorage();
    const { store } = openStore(storage, 1);
    store.save({ ...emptyData(), projects: [project] });
    expect(store.refresh(2)).toEqual({ changed: false, warning: null });
  });

  it('keeps its data and one copy when the stored data becomes unreadable', () => {
    const storage = memoryStorage();
    const { store } = openStore(storage, 1);
    store.save({ ...emptyData(), projects: [project] });
    storage.setItem(STORAGE_KEY, '{oops');
    const result = store.refresh(5);
    expect(result.changed).toBe(false);
    expect(result.warning).toContain(`${STORAGE_KEY}:corrupt-5`);
    expect(store.data().projects).toEqual([project]);
    expect(store.refresh(6)).toEqual({ changed: false, warning: null });
    expect(storage.map.has(`${STORAGE_KEY}:corrupt-6`)).toBe(false);
  });
});

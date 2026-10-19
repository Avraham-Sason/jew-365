import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV({ id: 'jew-365' });

export const StorageService = {
  get<T>(key: string): T | undefined {
    const raw = storage.getString(key);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  },
  set<T>(key: string, value: T): void {
    storage.set(key, JSON.stringify(value));
  },
  delete(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clearAll();
  },
};

export function createZustandStorage() {
  return {
    getItem: (name: string): string | null => {
      const v = storage.getString(name);
      return v ?? null;
    },
    setItem: (name: string, value: string): void => {
      storage.set(name, value);
    },
    removeItem: (name: string): void => {
      storage.delete(name);
    },
  };
}

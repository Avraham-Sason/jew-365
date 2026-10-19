type MockMmkv = { clearAll: jest.Mock; recrypt: jest.Mock; contains: (key: string) => boolean };
type Opened = { config: { id: string; encryptionKey?: string }; instance: MockMmkv };

const mockOpened: Opened[] = [];

// One file per id, as on a device: a flag the plain store holds must survive a module reload.
const mockFiles = new Map<string, MockMmkv>();

jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return {
    MMKV: jest.fn((config: Opened['config']) => {
      const cached = mockFiles.get(config.id);
      if (cached) {
        mockOpened.push({ config, instance: cached });
        return cached;
      }
      const base = createMockMMKV();
      const instance: MockMmkv = { ...base, clearAll: jest.fn(base.clearAll), recrypt: jest.fn() };
      mockFiles.set(config.id, instance);
      mockOpened.push({ config, instance });
      return instance;
    }),
  };
});

const SecureStore = require('expo-secure-store');
const KEY_OPTIONS = { keychainAccessible: 'afterFirstUnlockThisDeviceOnly' };
const KEY_NAME = 'taharah-mmkv-key';

type TaharahStorageModule = typeof import('../TaharahStorage');

function load(): TaharahStorageModule {
  let loaded!: TaharahStorageModule;
  jest.isolateModules(() => {
    jest.doMock('expo-secure-store', () => SecureStore);
    loaded = require('../TaharahStorage');
  });
  return loaded;
}

const lastOpened = () => mockOpened[mockOpened.length - 1];
const taharahOpened = () => mockOpened.filter((opened) => opened.config.id !== 'jew-365');

describe('TaharahStorage', () => {
  beforeEach(() => {
    SecureStore.__store.clear();
    mockOpened.length = 0;
    mockFiles.clear();
    jest.spyOn(SecureStore, 'getItem');
    jest.spyOn(SecureStore, 'setItem');
  });
  afterEach(() => jest.restoreAllMocks());

  describe('key', () => {
    it('is created once, 16 characters, in the secure store for this device only', () => {
      load();

      const key = SecureStore.__store.get(KEY_NAME);
      expect(key).toMatch(/^[A-Za-z0-9_-]{16}$/);
      expect(SecureStore.getItem).toHaveBeenCalledWith(KEY_NAME, KEY_OPTIONS);
      expect(SecureStore.setItem).toHaveBeenCalledTimes(1);
      expect(SecureStore.setItem).toHaveBeenCalledWith(KEY_NAME, key, KEY_OPTIONS);
    });

    it('opens its own MMKV file with that key', () => {
      load();

      expect(taharahOpened()).toHaveLength(1);
      expect(lastOpened().config).toEqual({
        id: 'jew-365-taharah',
        encryptionKey: SecureStore.__store.get(KEY_NAME),
      });
    });

    it('is read from the secure store and reused by the next load', () => {
      load();
      const first = SecureStore.__store.get(KEY_NAME);
      const firstConfig = lastOpened().config;

      load();

      expect(SecureStore.__store.size).toBe(1);
      expect(SecureStore.__store.get(KEY_NAME)).toBe(first);
      expect(SecureStore.setItem).toHaveBeenCalledTimes(1);
      expect(lastOpened().config).toEqual(firstConfig);
    });

    it('starts a newly made key on a clean file, and leaves a file whose key already existed alone', () => {
      load();
      expect(lastOpened().instance.clearAll).toHaveBeenCalledTimes(1);

      load();
      expect(lastOpened().instance.clearAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('without a usable key', () => {
    it('opens a separate unencrypted file when the secure store cannot be read', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      SecureStore.getItem.mockImplementation(() => {
        throw new Error('keychain locked');
      });

      load();

      expect(lastOpened().config).toEqual({ id: 'jew-365-taharah-unencrypted' });
      expect(SecureStore.setItem).not.toHaveBeenCalled();
    });

    it('does the same when the new key cannot be stored', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      SecureStore.setItem.mockImplementation(() => {
        throw new Error('keystore broken');
      });

      load();

      expect(lastOpened().config).toEqual({ id: 'jew-365-taharah-unencrypted' });
    });

    it('never touches the secure store on web', () => {
      try {
        jest.isolateModules(() => {
          jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
          jest.doMock('expo-secure-store', () => SecureStore);
          require('../TaharahStorage');
        });
      } finally {
        jest.dontMock('react-native');
      }

      expect(SecureStore.getItem).not.toHaveBeenCalled();
      expect(SecureStore.setItem).not.toHaveBeenCalled();
      expect(lastOpened().config).toEqual({ id: 'jew-365-taharah-unencrypted' });
    });

    // A reset while the key cannot be read wipes only the fallback file; the encrypted one is
    // wiped by the next launch that can read the key, which replaces it.
    it('a reset without the key is finished by the next launch that has one', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      SecureStore.__store.set(KEY_NAME, 'OldKeyOldKeyOldK');
      SecureStore.getItem.mockImplementationOnce(() => {
        throw new Error('keychain locked');
      });
      const locked = load();
      expect(lastOpened().config).toEqual({ id: 'jew-365-taharah-unencrypted' });

      locked.clearTaharahStorage();
      expect(mockFiles.get('jew-365')!.contains(locked.WIPE_PENDING_KEY)).toBe(true);
      expect(SecureStore.__store.get(KEY_NAME)).toBe('OldKeyOldKeyOldK');

      load();
      const replaced = SecureStore.__store.get(KEY_NAME);
      expect(replaced).not.toBe('OldKeyOldKeyOldK');
      expect(lastOpened().config).toEqual({ id: 'jew-365-taharah', encryptionKey: replaced });
      expect(lastOpened().instance.clearAll).toHaveBeenCalled();
      expect(mockFiles.get('jew-365')!.contains(locked.WIPE_PENDING_KEY)).toBe(false);
    });

    it('clearing still wipes the data and leaves the secure store alone', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      SecureStore.getItem.mockImplementation(() => {
        throw new Error('keychain locked');
      });
      const { taharahStorage, clearTaharahStorage } = load();
      taharahStorage.set('taharah-store', 'private');

      clearTaharahStorage();

      expect(taharahStorage.getString('taharah-store')).toBeUndefined();
      expect(SecureStore.setItem).not.toHaveBeenCalled();
      expect(lastOpened().instance.recrypt).not.toHaveBeenCalled();
    });
  });

  describe('createTaharahZustandStorage', () => {
    it('round-trips through the taharah instance and reports a missing key as null', () => {
      const { createTaharahZustandStorage, taharahStorage } = load();
      const adapter = createTaharahZustandStorage();

      expect(adapter.getItem('taharah-store')).toBeNull();
      adapter.setItem('taharah-store', '{"a":1}');
      expect(adapter.getItem('taharah-store')).toBe('{"a":1}');
      expect(taharahStorage.getString('taharah-store')).toBe('{"a":1}');
      adapter.removeItem('taharah-store');
      expect(adapter.getItem('taharah-store')).toBeNull();
    });
  });

  describe('clearTaharahStorage', () => {
    it('wipes the data and swaps the key, in the secure store and in the running instance', () => {
      const { taharahStorage, clearTaharahStorage } = load();
      const oldKey = SecureStore.__store.get(KEY_NAME);
      taharahStorage.set('taharah-store', 'private');

      clearTaharahStorage();

      const newKey = SecureStore.__store.get(KEY_NAME);
      expect(taharahStorage.getString('taharah-store')).toBeUndefined();
      expect(newKey).toMatch(/^[A-Za-z0-9_-]{16}$/);
      expect(newKey).not.toBe(oldKey);
      expect(SecureStore.__store.size).toBe(1);
      expect(SecureStore.setItem).toHaveBeenLastCalledWith(KEY_NAME, newKey, KEY_OPTIONS);
      expect(lastOpened().instance.recrypt).toHaveBeenCalledWith(newKey);
    });

    it('keeps the running instance on whatever key the secure store holds, reset after reset', () => {
      const { clearTaharahStorage } = load();
      const instance = lastOpened().instance;

      clearTaharahStorage();
      clearTaharahStorage();

      const storedKey = SecureStore.__store.get(KEY_NAME);
      expect(instance.recrypt).toHaveBeenCalledTimes(2);
      expect(instance.recrypt).toHaveBeenLastCalledWith(storedKey);
    });

    it('leaves the old key in place when the new one cannot be stored', () => {
      const { clearTaharahStorage } = load();
      const oldKey = SecureStore.__store.get(KEY_NAME);
      SecureStore.setItem.mockImplementationOnce(() => {
        throw new Error('keystore broken');
      });

      expect(() => clearTaharahStorage()).not.toThrow();

      expect(SecureStore.__store.get(KEY_NAME)).toBe(oldKey);
      expect(lastOpened().instance.recrypt).not.toHaveBeenCalled();
    });

    it('puts the old key back when the instance cannot take the new one', () => {
      const { clearTaharahStorage } = load();
      const oldKey = SecureStore.__store.get(KEY_NAME);
      lastOpened().instance.recrypt.mockImplementation(() => {
        throw new Error('recrypt failed');
      });

      expect(() => clearTaharahStorage()).not.toThrow();

      expect(SecureStore.__store.get(KEY_NAME)).toBe(oldKey);
    });
  });
});

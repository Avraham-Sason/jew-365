import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { StorageService } from '@/services/StorageService';

export const TAHARAH_STORAGE_ID = 'jew-365-taharah';
export const TAHARAH_KEY_NAME = 'taharah-mmkv-key';

// Opened when no key can be had (web, or a keychain that cannot be read). A different file than the
// encrypted one, so a launch that cannot read the key never decodes, appends to or discards it.
const UNENCRYPTED_STORAGE_ID = `${TAHARAH_STORAGE_ID}-unencrypted`;

const KEY_LENGTH = 16;
const KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// This device only: the key never rides a backup or a device transfer to a phone that holds the data.
// Readable after the first unlock since boot, not only while unlocked: the nightly rebuild and a
// mark-done tap from the lock screen run on a locked phone and must still see the events.
const KEY_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

// MMKV takes at most 16 bytes; 16 random 6-bit symbols keep 96 bits of entropy in printable ASCII.
function generateKey(): string {
  return Array.from(Crypto.getRandomBytes(KEY_LENGTH), (byte) => KEY_ALPHABET[byte & 63]).join('');
}

let activeKey: string | undefined;
let keyIsNew = false;

// Set by a reset that ran while the key could not be read: the encrypted file could not be wiped
// then, so the next launch that can read the key replaces it and starts the file clean.
export const WIPE_PENDING_KEY = 'taharah:wipe-pending';

function resolveKey(): void {
  if (Platform.OS === 'web') return;
  try {
    const wipePending = StorageService.get<boolean>(WIPE_PENDING_KEY) === true;
    const stored = wipePending ? undefined : SecureStore.getItem(TAHARAH_KEY_NAME, KEY_OPTIONS);
    if (stored) {
      activeKey = stored;
      return;
    }
    const created = generateKey();
    SecureStore.setItem(TAHARAH_KEY_NAME, created, KEY_OPTIONS);
    activeKey = created;
    keyIsNew = true;
    if (wipePending) StorageService.delete(WIPE_PENDING_KEY);
  } catch (error) {
    if (__DEV__) console.warn('[taharah] storage key unavailable, using unencrypted storage', error);
  }
}

resolveKey();

export const taharahStorage = new MMKV(
  activeKey ? { id: TAHARAH_STORAGE_ID, encryptionKey: activeKey } : { id: UNENCRYPTED_STORAGE_ID },
);

// A key that was just made cannot open anything older: a file restored from a backup without its
// key is unreadable, so start it clean instead of decoding it with the wrong key.
if (keyIsNew) taharahStorage.clearAll();

export function createTaharahZustandStorage() {
  return {
    getItem: (name: string): string | null => taharahStorage.getString(name) ?? null,
    setItem: (name: string, value: string): void => {
      taharahStorage.set(name, value);
    },
    removeItem: (name: string): void => {
      taharahStorage.delete(name);
    },
  };
}

// Wipes the data and replaces the key, in the store and in the running instance alike. Deleting the
// key instead would leave this process writing under a key the next launch no longer finds.
export function clearTaharahStorage(): void {
  taharahStorage.clearAll();
  if (!activeKey) {
    // Only the fallback file was wiped. The encrypted one waits for a launch that holds the key.
    if (Platform.OS !== 'web') StorageService.set(WIPE_PENDING_KEY, true);
    return;
  }
  const previous = activeKey;
  try {
    const next = generateKey();
    SecureStore.setItem(TAHARAH_KEY_NAME, next, KEY_OPTIONS);
    taharahStorage.recrypt(next);
    activeKey = next;
  } catch {
    try {
      SecureStore.setItem(TAHARAH_KEY_NAME, previous, KEY_OPTIONS);
    } catch {}
  }
}

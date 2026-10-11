import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Nusach } from '@/types/mitzvah';
import { ChokAsset } from '@/types/chok';
import { SiddurText, SiddurTextId } from '@/types/siddur';
import { chokAsset } from '@/data/chok';
import { siddurAsset } from '@/data/siddur';

const loaded = new Map<string, Promise<unknown>>();

async function readAsset(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (Platform.OS === 'web') return (await fetch(uri)).text();
  return new File(uri).text();
}

function loadOnce<T>(key: string, moduleId: number): Promise<T> {
  const cached = loaded.get(key);
  if (cached) return cached as Promise<T>;
  const pending = readAsset(moduleId).then((raw) => JSON.parse(raw) as T);
  loaded.set(key, pending);
  pending.catch(() => loaded.delete(key));
  return pending;
}

export function loadSiddurText(nusach: Nusach, id: SiddurTextId): Promise<SiddurText> {
  const moduleId = siddurAsset(nusach, id);
  if (moduleId === undefined) return Promise.reject(new Error(`no siddur text ${nusach}/${id}`));
  return loadOnce<SiddurText>(`${nusach}/${id}`, moduleId);
}

export function loadChokParasha(parasha: string): Promise<ChokAsset> {
  const moduleId = chokAsset(parasha);
  if (moduleId === undefined) return Promise.reject(new Error(`no chok text ${parasha}`));
  return loadOnce<ChokAsset>(`chok/${parasha}`, moduleId);
}

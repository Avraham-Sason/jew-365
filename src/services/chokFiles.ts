import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { ChokInstall } from '@/types/chok';

export const CHOK_DIRECTORY = 'chok';

export function chokRootDirectory(): Directory {
  return new Directory(Paths.document, CHOK_DIRECTORY);
}

export function chokVersionDirectory(version: number): Directory {
  return new Directory(Paths.document, CHOK_DIRECTORY, `v${version}`);
}

export function chokParashaFile(install: ChokInstall, parasha: string): File | null {
  const path = install.files[parasha];
  return path ? new File(chokVersionDirectory(install.version), path) : null;
}

export function chokInstallPresent(install: ChokInstall): boolean {
  if (Platform.OS === 'web') return false;
  try {
    const paths = Object.values(install.files);
    if (paths.length === 0) return false;
    const directory = chokVersionDirectory(install.version);
    return directory.exists && paths.every((path) => new File(directory, path).exists);
  } catch {
    return false;
  }
}

export function deleteChokFiles(): void {
  const root = chokRootDirectory();
  if (root.exists) root.delete();
}

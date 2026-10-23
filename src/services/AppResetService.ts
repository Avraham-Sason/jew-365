import { Platform } from 'react-native';
import { storage } from '@/services/StorageService';
import { clearTaharahStorage } from '@/services/TaharahStorage';
import { clearLastError, reportError } from '@/services/errors';
import { cancelChokDownload } from '@/services/ChokContentService';
import { deleteChokFiles } from '@/services/chokFiles';
import { useUserStore } from '@/stores/useUserStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { useCustomMitzvotStore } from '@/stores/useCustomMitzvotStore';
import { useTaharahStore } from '@/stores/useTaharahStore';
import { useChokStore } from '@/stores/useChokStore';
import { NotificationScheduler, setSchedulingSuspended } from '@/services/NotificationScheduler';

export const AppResetService = {
  // Order matters. Resetting the stores fires the scheduler's subscriptions, so scheduling is
  // suspended for the whole operation; cancelling runs after the stores are clean, and MMKV is
  // wiped last so nothing can write a key back in behind the wipe.
  async reset(): Promise<void> {
    setSchedulingSuspended(true);
    try {
      clearLastError();
      cancelChokDownload();
      useUserStore.getState().reset();
      useMitzvotStore.getState().reset();
      useCompletionsStore.getState().reset();
      useCustomMitzvotStore.getState().reset();
      useTaharahStore.getState().reset();
      useChokStore.getState().reset();
      try {
        await NotificationScheduler.cancelAll();
      } catch (error) {
        reportError('reset', error);
      }
      if (Platform.OS !== 'web') {
        try {
          storage.clearAll();
        } catch (error) {
          reportError('reset', error);
        }
        try {
          clearTaharahStorage();
        } catch (error) {
          reportError('reset', error);
        }
        try {
          deleteChokFiles();
        } catch (error) {
          reportError('reset', error);
        }
      }
    } finally {
      setSchedulingSuspended(false);
    }
  },
};

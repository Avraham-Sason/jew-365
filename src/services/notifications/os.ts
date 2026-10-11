import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { t } from '@/i18n';
import {
  ANDROID_CHANNELS,
  MARK_DONE_ACTION,
  MITZVAH_REMINDER_CATEGORY,
  MITZVAH_TEXT_CATEGORY,
  OPEN_TEXT_ACTION,
  TAHARAH_BEDIKA_CATEGORY,
  pendingNotificationMetaFromContent,
  type NotificationContentLike,
  type PendingNotificationMeta,
} from '@/services/notifications/ids';
import type { ScheduleCandidate } from '@/services/notifications/types';

export type NotificationTaskPayload = Notifications.NotificationTaskPayload;
export type NotificationResponse = Notifications.NotificationResponse;

// A notification as the scheduler reasons about it, scheduled or in the tray.
export type TrayNotification = { identifier: string; data: PendingNotificationMeta };

export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.mitzvot, {
    name: t('notifications.channelName'),
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#C9922A',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.hilulot, {
    name: t('hilulot.title'),
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.roshChodesh, {
    name: t('roshChodesh.title'),
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.taharah, {
    name: t('taharah.home.title'),
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.system, {
    name: t('notifications.channelSystem'),
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

export async function ensureCategories(): Promise<void> {
  if (typeof Notifications.setNotificationCategoryAsync !== 'function') return;
  try {
    await ensureChannels();
    const markDone = {
      identifier: MARK_DONE_ACTION,
      buttonTitle: t('notifications.markDone'),
      options: { opensAppToForeground: false },
    };
    await Notifications.setNotificationCategoryAsync(MITZVAH_REMINDER_CATEGORY, [markDone]);
    await Notifications.setNotificationCategoryAsync(MITZVAH_TEXT_CATEGORY, [
      {
        identifier: OPEN_TEXT_ACTION,
        buttonTitle: t('siddur.open'),
        options: { opensAppToForeground: true },
      },
      markDone,
    ]);
    await Notifications.setNotificationCategoryAsync(TAHARAH_BEDIKA_CATEGORY, [
      { ...markDone, buttonTitle: t('taharah.notify.markDone') },
    ]);
  } catch (err) {
    if (__DEV__) {
      console.warn('[notifications] category registration failed', err);
    }
  }
}

function requestFor(candidate: ScheduleCandidate): Notifications.NotificationRequestInput {
  return {
    identifier: candidate.id,
    content: {
      title: candidate.title,
      body: candidate.body,
      data: candidate.data,
      ...(candidate.categoryIdentifier && { categoryIdentifier: candidate.categoryIdentifier }),
      autoDismiss: true,
      sticky: false,
      sound: 'default',
    },
    // Android resolves the channel from the trigger. Without it every notification lands on
    // expo's "Miscellaneous" fallback channel and the configured one is dead.
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: candidate.trigger,
      channelId: ANDROID_CHANNELS[candidate.channel],
    },
  };
}

// One at a time and in the given order; a candidate the OS refuses is skipped, not fatal.
export async function schedule(candidates: ScheduleCandidate[]): Promise<void> {
  for (const candidate of candidates) {
    try {
      await Notifications.scheduleNotificationAsync(requestFor(candidate));
    } catch (err) {
      if (__DEV__) console.warn('[notifications] schedule failed', candidate.id, err);
    }
  }
}

// Shown at once, on the system channel on Android.
export async function presentNow(notice: {
  identifier: string;
  title: string;
  body: string;
  data: PendingNotificationMeta;
}): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: notice.identifier,
    content: {
      title: notice.title,
      body: notice.body,
      data: notice.data,
      autoDismiss: true,
      sticky: false,
      sound: 'default',
    },
    trigger: Platform.OS === 'android' ? { channelId: ANDROID_CHANNELS.system } : null,
  });
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

function trayNotification(request: { identifier: string; content: unknown }): TrayNotification {
  return {
    identifier: request.identifier,
    data: pendingNotificationMetaFromContent(request.content as NotificationContentLike),
  };
}

export async function getScheduled(): Promise<TrayNotification[]> {
  return (await Notifications.getAllScheduledNotificationsAsync()).map(trayNotification);
}

export async function cancelScheduled(ids: string[]): Promise<void> {
  for (const id of ids) await Notifications.cancelScheduledNotificationAsync(id);
}

export async function getPresented(): Promise<TrayNotification[]> {
  if (typeof Notifications.getPresentedNotificationsAsync !== 'function') return [];
  try {
    return (await Notifications.getPresentedNotificationsAsync()).map(({ request }) => trayNotification(request));
  } catch {
    return [];
  }
}

export async function dismiss(ids: Iterable<string>): Promise<void> {
  if (typeof Notifications.dismissNotificationAsync !== 'function') return;
  await Promise.all([...new Set(ids)].map((id) => Notifications.dismissNotificationAsync(id).catch(() => {})));
}

export async function getPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

export async function requestPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return status === 'granted';
}

export function setForegroundHandler(
  shouldSuppress: (data: PendingNotificationMeta, identifier: string) => boolean,
): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = pendingNotificationMetaFromContent(notification.request.content as NotificationContentLike);
      const show = !shouldSuppress(data, notification.request.identifier);
      return {
        shouldShowAlert: show,
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });
}

export async function registerActionTask(name: string): Promise<void> {
  await Notifications.registerTaskAsync(name);
}

export function isNotificationResponse(data: NotificationTaskPayload): data is NotificationResponse {
  return Boolean(data && typeof data === 'object' && 'actionIdentifier' in data && 'notification' in data);
}

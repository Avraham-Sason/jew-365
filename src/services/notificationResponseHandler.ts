import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  MARK_DONE_ACTION,
  OPEN_TEXT_ACTION,
  markDoneFromNotificationData,
  notificationTargetFromData,
  pendingNotificationMetaFromContent,
  PendingNotificationMeta,
} from '@/services/NotificationScheduler';
import { isUpdateApplied, reloadIntoUpdate } from '@/services/appUpdates';
import { useUserStore } from '@/stores/useUserStore';
import { isQuietAt } from '@/utils/skipRules';

export const DEFAULT_NOTIFICATION_ACTION = 'expo.modules.notifications.actions.DEFAULT';
export { MARK_DONE_ACTION, OPEN_TEXT_ACTION };

function getData(response: Notifications.NotificationResponse): PendingNotificationMeta {
  return pendingNotificationMetaFromContent(response.notification.request.content);
}

let pendingNavigation: (() => void) | null = null;

// When the app is launched BY the tap, this listener can fire before the router tree is mounted
// and expo-router silently drops the navigation. Buffer it and let the root replay it once
// navigation is ready.
export function consumePendingNotificationRoute(): void {
  const pending = pendingNavigation;
  pendingNavigation = null;
  if (pending && !isAppQuiet()) navigate(pending);
}

// Inside a Shabbat / Yom Tov block a tap must open nothing: the route would mount under the
// Shabbat screen and stay there — the reader keeping the screen awake — until the block ends.
function isAppQuiet(): boolean {
  const { isOnboarded, location } = useUserStore.getState();
  return isOnboarded && isQuietAt(new Date(), location);
}

function navigate(go: () => void) {
  try {
    go();
  } catch {
    pendingNavigation = go;
  }
}

function openMitzvahDetail(data: PendingNotificationMeta) {
  const { mitzvahId } = data;
  if (!mitzvahId) return;
  navigate(() =>
    router.push({
      pathname: '/mitzvah/[id]',
      params: {
        id: mitzvahId,
        highlightContent: data.fullContent?.length ? '1' : '0',
      },
    }),
  );
}

function openSiddur(data: PendingNotificationMeta, notificationId: string) {
  const target = notificationTargetFromData(data, notificationId);
  if (!target) {
    openMitzvahDetail(data);
    return;
  }
  navigate(() =>
    router.push({
      pathname: '/siddur/[id]',
      params: { id: target.mitzvahId, date: target.key },
    }),
  );
}

// A response can reach the app twice: through the listener and, after a launch, through
// getLastNotificationResponse(). The replay skips the one the listener already handled.
let lastHandled: string | null = null;

function responseKey(response: Notifications.NotificationResponse): string {
  return `${response.notification.request.identifier}|${response.actionIdentifier}|${response.notification.date}`;
}

function clearLastResponse(): void {
  try {
    Notifications.clearLastNotificationResponse();
  } catch {}
}

export function handleNotificationResponse(response: Notifications.NotificationResponse): void {
  lastHandled = responseKey(response);
  clearLastResponse();
  const data = getData(response);
  if (response.actionIdentifier === MARK_DONE_ACTION) {
    markDoneFromNotificationData(data, response.notification.request.identifier).catch(() => {});
    return;
  }

  if (isAppQuiet()) return;

  if (data.kind === 'blockNotice') {
    if (response.actionIdentifier === DEFAULT_NOTIFICATION_ACTION) navigate(() => router.navigate('/(tabs)/home'));
    return;
  }

  if (data.kind === 'checkin') {
    if (response.actionIdentifier === DEFAULT_NOTIFICATION_ACTION) navigate(() => router.navigate('/checkin'));
    return;
  }

  if (data.kind === 'taharah') {
    if (response.actionIdentifier === DEFAULT_NOTIFICATION_ACTION) navigate(() => router.navigate('/taharah'));
    return;
  }

  if (data.kind === 'hilula') {
    if (response.actionIdentifier === DEFAULT_NOTIFICATION_ACTION) navigate(() => router.navigate('/hilulot'));
    return;
  }

  if (data.kind === 'roshChodesh') {
    if (response.actionIdentifier === DEFAULT_NOTIFICATION_ACTION) navigate(() => router.navigate('/rosh-chodesh'));
    return;
  }

  if (data.kind === 'report') {
    if (response.actionIdentifier === DEFAULT_NOTIFICATION_ACTION) {
      navigate(() => router.navigate({ pathname: '/report', params: { week: data.report?.week } }));
    }
    return;
  }

  if (data.kind === 'update') {
    if (response.actionIdentifier !== DEFAULT_NOTIFICATION_ACTION) return;
    if (isUpdateApplied(data)) navigate(() => router.navigate('/(tabs)/home'));
    else reloadIntoUpdate();
    return;
  }

  if (response.actionIdentifier === OPEN_TEXT_ACTION) {
    openSiddur(data, response.notification.request.identifier);
    return;
  }

  if (response.actionIdentifier === DEFAULT_NOTIFICATION_ACTION) {
    if (data.hasText) openSiddur(data, response.notification.request.identifier);
    else openMitzvahDetail(data);
  }
}

export function initNotificationResponseHandler(): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
}

// A tap that launched a killed app is not delivered to a listener added after launch; the native
// side keeps it as the last response instead. The root layout calls this once the first screen is
// up, so the route lands on top of it instead of being replaced by the index redirect. Mark-done
// never needs it: the headless action task has already recorded it.
export function openLaunchNotificationResponse(): void {
  let response: Notifications.NotificationResponse | null = null;
  try {
    response = Notifications.getLastNotificationResponse();
  } catch {
    return;
  }
  if (!response || response.actionIdentifier === MARK_DONE_ACTION || responseKey(response) === lastHandled) {
    clearLastResponse();
    return;
  }
  handleNotificationResponse(response);
}

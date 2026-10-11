import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import type { Mitzvah, Reminder, UserSettings } from '@/types/mitzvah';
import type { Location } from '@/types/zmanim';
import { StorageService } from '@/services/StorageService';
import { downloadNewUpdate, isUpdateApplied } from '@/services/appUpdates';
import { clearLastError, getLastError, reportError } from '@/services/errors';
import { isQuietAt } from '@/utils/skipRules';
import { blockForDay, blockOfCheckIn, checkInFor } from '@/utils/checkIn';
import { deriveCycle } from '@/utils/taharah/cycle';
import { hebrewDay } from '@/utils/taharah/onot';
import { activeOnsets } from '@/utils/taharah/vestot';
import { t } from '@/i18n';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useUserStore } from '@/stores/useUserStore';
import { useCustomMitzvotStore } from '@/stores/useCustomMitzvotStore';
import { useCompletionsStore, dateKey } from '@/stores/useCompletionsStore';
import { useTaharahStore } from '@/stores/useTaharahStore';
import {
  ANDROID_CHANNELS,
  CHECK_IN_KIND,
  DAILY_REBUILD_TASK,
  IOS_MAX,
  LAST_REBUILD_KEY,
  LEGACY_DAILY_REBUILD_TASK,
  MARK_DONE_ACTION,
  MITZVAH_REMINDER_CATEGORY,
  MITZVAH_TEXT_CATEGORY,
  NOTIFICATION_ACTION_TASK,
  OPEN_TEXT_ACTION,
  PENDING_LIMIT,
  SCHEDULE_FORMAT,
  SCHEDULE_FORMAT_KEY,
  TAHARAH_BEDIKA_CATEGORY,
  TAHARAH_KIND,
  UPDATE_KIND,
  UPDATE_NOTIFIED_KEY,
  notificationMatchesTarget,
  notificationTargetFromData,
  parseId,
  pendingNotificationMetaFromContent,
  type NotificationContentLike,
  type PendingNotificationMeta,
} from '@/services/notifications/ids';
import * as os from '@/services/notifications/os';
import { buildPlan } from '@/services/notifications/plan';
import {
  currentScope,
  currentSettings,
  enabledMitzvot,
  hasNotificationPermission,
  readPlanInput,
  type PlanScope,
} from '@/services/notifications/snapshot';
import { checkInInputOf } from '@/services/notifications/planners/checkIn';
import { bodyForReminder, buildTriggerTime } from '@/services/notifications/planners/mitzvot';
import { bedikotMissingIn } from '@/services/notifications/planners/taharah';

const REBUILD_HOUR = 0;
const REBUILD_MINUTE = 15;
const BACKGROUND_NOTIFICATION_RESULT = {
  NoData: 1,
  NewData: 2,
  Failed: 3,
} as const;

const reportScheduleError = (error: unknown) => reportError('schedule', error);

const clearScheduleError = () => {
  if (getLastError()?.scope === 'schedule') clearLastError();
};

function shouldRunDailyRebuild(now: Date = new Date()): boolean {
  const last = StorageService.get<string>(LAST_REBUILD_KEY);
  const today = dateKey(now);
  if (last === today) return false;
  const hours = now.getHours();
  const minutes = now.getMinutes();
  return hours > REBUILD_HOUR || (hours === REBUILD_HOUR && minutes >= REBUILD_MINUTE);
}

export function pickBodyForReminder(reminder: Reminder, mitzvah: Mitzvah, trigger: Date): string {
  return bodyForReminder(reminder, mitzvah, trigger, useUserStore.getState().language === 'en');
}

async function dismissPresentedNotificationsForMitzvah(
  mitzvahId: string,
  key: string,
  notificationId?: string,
): Promise<void> {
  const ids = new Set<string>();
  if (notificationId) ids.add(notificationId);

  for (const { identifier, data } of await os.getPresented()) {
    if (notificationMatchesTarget(identifier, data, mitzvahId, key)) {
      ids.add(identifier);
    }
  }

  await os.dismiss(ids);
}

// A check-in is over once the user finished it or nothing in it is left to mark.
function checkInSettled(blockId: string): boolean {
  if (useCompletionsStore.getState().checkIns[blockId]) return true;
  const block = blockOfCheckIn(blockId, useUserStore.getState().location);
  if (!block) return true;
  const input = readPlanInput(new Date());
  const checkIn = checkInFor(block, checkInInputOf(input), input.now);
  return !checkIn || checkIn.finished;
}

function isFinishedCheckIn(data: PendingNotificationMeta): boolean {
  return data.kind === CHECK_IN_KIND && Boolean(data.blockId) && checkInSettled(data.blockId!);
}

// A taharah notification is settled once the cycle no longer waits for what it asks: read from the
// events as they are now, so a mark made in the app and one made from a notification agree.
export function taharahNotificationSettled(data: PendingNotificationMeta): boolean {
  const info = data.kind === TAHARAH_KIND ? data.taharah : undefined;
  if (!info) return false;
  const { events, settings } = useTaharahStore.getState();
  const { location } = useUserStore.getState();
  const state = deriveCycle(events, settings.rules, location, new Date());
  switch (info.task) {
    case 'bedikaMorning':
    case 'bedikaEvening': {
      const cleanDay = state.cleanDays.find((day) => day.day === info.day);
      return !cleanDay || cleanDay[info.task === 'bedikaMorning' ? 'morning' : 'evening'] !== null;
    }
    case 'hefsek':
      return state.stage !== 'niddah' && state.stage !== 'awaitingHefsek';
    case 'tevila':
    case 'tevilaPrep':
      return state.stage === 'tahor';
    case 'postBlock': {
      const block = blockOfCheckIn(dateKey(hebrewDay(info.day).greg()), location);
      return !block || !bedikotMissingIn(state, block);
    }
    case 'expectOnset': {
      const onsets = activeOnsets(events);
      const latest = onsets[onsets.length - 1];
      return latest !== undefined && latest.onah.abs >= info.day;
    }
    default:
      return false;
  }
}

function isStaleUpdateNotice(data: PendingNotificationMeta): boolean {
  return data.kind === UPDATE_KIND && isUpdateApplied(data);
}

function shouldSuppressForCompletion(data: PendingNotificationMeta, notificationId?: string): boolean {
  if (isFinishedCheckIn(data)) return true;
  if (isStaleUpdateNotice(data)) return true;
  if (data.kind === TAHARAH_KIND) return taharahNotificationSettled(data);
  if (!data.skipIfDone) return false;
  const target = notificationTargetFromData(data, notificationId);
  if (!target) return false;
  const completions = useCompletionsStore.getState();
  return completions.isDone(target.mitzvahId, target.date) || completions.isSkipped(target.mitzvahId, target.date);
}

export async function dismissCompletedPresentedNotifications(): Promise<void> {
  const ids: string[] = [];
  const completions = useCompletionsStore.getState();
  for (const { identifier, data } of await os.getPresented()) {
    const target = notificationTargetFromData(data, identifier);
    // Skipped counts as resolved, exactly like the schedule and shouldSuppressForCompletion treat
    // it — otherwise a mitzvah the user deliberately skipped keeps nagging from the tray.
    if (
      target &&
      (completions.isDone(target.mitzvahId, target.date) || completions.isSkipped(target.mitzvahId, target.date))
    ) {
      ids.push(identifier);
    }
    if (isFinishedCheckIn(data) || taharahNotificationSettled(data) || isStaleUpdateNotice(data)) ids.push(identifier);
  }
  await os.dismiss(ids);
}

export async function notifyIfUpdateReady(now: Date = new Date()): Promise<boolean> {
  const update = await downloadNewUpdate();
  if (!update) return false;
  const previous = StorageService.get<string>(UPDATE_NOTIFIED_KEY);
  if (previous === update.id) return false;
  if (!hasNotificationPermission()) return false;
  const { isOnboarded, location } = useUserStore.getState();
  if (isOnboarded && isQuietAt(now, location)) return false;
  await os.ensureChannels();
  if (previous) await os.dismiss([`${UPDATE_KIND}:${previous}`]);
  await os.presentNow({
    identifier: `${UPDATE_KIND}:${update.id}`,
    title: t('update.notice.title'),
    body: t('home.updateReady'),
    data: { kind: UPDATE_KIND, updateId: update.id, updateCreatedAt: update.createdAt },
  });
  StorageService.set(UPDATE_NOTIFIED_KEY, update.id);
  return true;
}

// Only a bedika can be marked from the notification: "done" on a hefsek or an immersion must be a
// conscious entry in the app. A slot the cycle no longer waits for is left alone, so a stale
// notification can never overwrite a result the user recorded in the app.
async function markTaharahBedikaDone(data: PendingNotificationMeta, notificationId?: string): Promise<boolean> {
  const info = data.taharah;
  if (info?.task !== 'bedikaMorning' && info?.task !== 'bedikaEvening') return false;
  if (!taharahNotificationSettled(data)) {
    useTaharahStore.getState().addEvent({
      type: 'bedika',
      day: info.day,
      slot: info.task === 'bedikaMorning' ? 'morning' : 'evening',
      result: 'clean',
    });
  }
  await os.dismiss(notificationId ? [notificationId] : []);
  return true;
}

export async function markDoneFromNotificationData(
  data: PendingNotificationMeta,
  notificationId?: string,
): Promise<boolean> {
  if (data.kind === TAHARAH_KIND) return markTaharahBedikaDone(data, notificationId);
  const target = notificationTargetFromData(data, notificationId);
  if (!target) return false;
  useCompletionsStore.getState().markDone(target.mitzvahId, target.date);
  await Promise.all([
    NotificationScheduler.cancelForMitzvah(target.mitzvahId, target.date).catch(() => {}),
    dismissPresentedNotificationsForMitzvah(target.mitzvahId, target.key, notificationId),
  ]);
  return true;
}

async function scheduleAllImpl(scope: PlanScope): Promise<void> {
  if (!hasNotificationPermission()) return;
  await os.ensureCategories();
  await os.schedule(buildPlan(readPlanInput(new Date(), scope)));
}

export const NotificationScheduler = {
  inFlight: null as Promise<void> | null,

  rerunQueued: false,

  // Trailing-edge coalescing, not drop-on-conflict. A rebuild reads the store INSIDE the locked
  // task, so a request arriving mid-run reflects state the running task never saw; dropping it
  // left the newest toggle or city change unscheduled until the next day.
  async withLock(task: () => Promise<void>): Promise<void> {
    if (this.inFlight) {
      this.rerunQueued = true;
      return this.inFlight;
    }
    const run = (async () => {
      try {
        await task();
      } finally {
        while (this.rerunQueued) {
          this.rerunQueued = false;
          await task();
        }
      }
    })().finally(() => {
      if (this.inFlight === run) {
        this.inFlight = null;
      }
    });
    this.inFlight = run;
    return run;
  },

  async scheduleAll(
    fromDate: Date = new Date(),
    activeMitzvot: Mitzvah[] = enabledMitzvot(),
    location: Location = useUserStore.getState().location,
    settings: UserSettings = currentSettings(),
  ): Promise<void> {
    return this.withLock(() => scheduleAllImpl({ fromDate, mitzvot: activeMitzvot, location, settings }));
  },

  async cancelAll(): Promise<void> {
    await os.cancelAll();
  },

  async cancelForMitzvah(mitzvahId: string, date: Date = new Date()): Promise<void> {
    const key = dateKey(date);
    const pending = await os.getScheduled();
    const matching = pending.filter(({ identifier, data }) => {
      const parsed = (identifier ? parseId(identifier) : null) ?? (data.customId ? parseId(data.customId) : null);
      return (parsed?.mitzvahId ?? data.mitzvahId) === mitzvahId && (parsed?.date ?? data.dateKey) === key;
    });
    await os.cancelScheduled(matching.map(({ identifier }) => identifier));
    await dismissPresentedNotificationsForMitzvah(mitzvahId, key);
  },

  // A finished check-in clears its nudges from the tray and withdraws the rest through a rebuild:
  // one that is already running read the old state and would schedule them again, and the lock
  // re-runs it once with the new one.
  async cancelCheckIn(blockId: string): Promise<void> {
    const prefix = `${CHECK_IN_KIND}:${blockId}:`;
    const presented = await os.getPresented();
    await os.dismiss(presented.map(({ identifier }) => identifier).filter((id) => id.startsWith(prefix)));
    await this.rebuild();
  },

  // After a mark: if it settled the check-in of the block this day belongs to, its nudges go too.
  async settleCheckIn(date: Date): Promise<void> {
    const block = blockForDay(date, useUserStore.getState().location);
    if (!block || !checkInSettled(block.days[0])) return;
    const prefix = `${CHECK_IN_KIND}:${block.days[0]}:`;
    const pending = await os.getScheduled().catch(() => []);
    if (pending.some(({ identifier }) => identifier.startsWith(prefix))) await this.cancelCheckIn(block.days[0]);
  },

  async rebuild(): Promise<void> {
    if (schedulingSuspended) return;
    return this.withLock(async () => {
      StorageService.delete(SCHEDULE_FORMAT_KEY);
      await this.cancelAll();
      await scheduleAllImpl(currentScope());
      StorageService.set(SCHEDULE_FORMAT_KEY, SCHEDULE_FORMAT);
      clearScheduleError();
    });
  },

  // Only the day-rollover path stamps LAST_REBUILD_KEY. A settings-driven rebuild used to stamp it
  // too, which suppressed that night's recovery run for the rest of the day.
  async rebuildForNewDay(): Promise<void> {
    await this.rebuild();
    StorageService.set(LAST_REBUILD_KEY, dateKey(new Date()));
  },
};

export async function syncNotificationPermissionStatus(): Promise<boolean> {
  const granted = await os.getPermissions();
  const previous = useUserStore.getState().notificationPermission;
  useUserStore.getState().setNotificationPermission(granted ? 'granted' : 'denied');
  // Nothing else reacts to this field, so without an explicit rebuild a user who grants permission
  // in OS settings (which the home banner invites them to do) never gets a single reminder.
  if (granted && previous !== 'granted') {
    NotificationScheduler.rebuild().catch(reportScheduleError);
  }
  return granted;
}

// Extends the today+tomorrow horizon whenever the app is opened. Background fetch is opportunistic
// — iOS runs it never for a force-quit app — so it must not be the only path that keeps reminders
// alive, or they simply stop after two days with no signal.
export async function refreshSchedulingOnForeground(): Promise<void> {
  if (!useUserStore.getState().isOnboarded) return;
  if (shouldRunDailyRebuild()) {
    await NotificationScheduler.rebuildForNewDay();
    return;
  }
  const pending = await os.getScheduled().catch(() => []);
  const staleFormat = StorageService.get<number>(SCHEDULE_FORMAT_KEY) !== SCHEDULE_FORMAT;
  if (!pending.length || staleFormat) await NotificationScheduler.rebuild();
}

export async function requestNotificationPermissions(): Promise<boolean> {
  await os.ensureChannels();
  if (await os.getPermissions()) {
    useUserStore.getState().setNotificationPermission('granted');
    return true;
  }
  const granted = await os.requestPermissions();
  useUserStore.getState().setNotificationPermission(granted ? 'granted' : 'denied');
  return granted;
}

TaskManager.defineTask(DAILY_REBUILD_TASK, async () => {
  try {
    if (shouldRunDailyRebuild()) {
      await NotificationScheduler.rebuildForNewDay();
    }
    await notifyIfUpdateReady().catch((err) => {
      console.warn('[updates] background check failed', err);
      return false;
    });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.warn('[daily-rebuild] failed', err);
    reportScheduleError(err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

TaskManager.defineTask<os.NotificationTaskPayload>(NOTIFICATION_ACTION_TASK, async ({ data, error }) => {
  if (error) {
    if (__DEV__) console.warn('[notifications] action task failed', error);
    return BACKGROUND_NOTIFICATION_RESULT.Failed;
  }
  if (!os.isNotificationResponse(data) || data.actionIdentifier !== MARK_DONE_ACTION) {
    return BACKGROUND_NOTIFICATION_RESULT.NoData;
  }
  const handled = await markDoneFromNotificationData(
    pendingNotificationMetaFromContent(data.notification.request.content as NotificationContentLike),
    data.notification.request.identifier,
  );
  return handled ? BACKGROUND_NOTIFICATION_RESULT.NewData : BACKGROUND_NOTIFICATION_RESULT.NoData;
});

async function dropLegacyDailyTask(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(LEGACY_DAILY_REBUILD_TASK)) {
    await TaskManager.unregisterTaskAsync(LEGACY_DAILY_REBUILD_TASK);
  }
}

export async function registerDailyRebuildTask(): Promise<void> {
  try {
    await dropLegacyDailyTask().catch(() => {});
    await BackgroundTask.registerTaskAsync(DAILY_REBUILD_TASK, { minimumInterval: 60 });
  } catch (err) {
    console.warn('[daily-rebuild] register failed', err);
  }
}

export async function registerNotificationActionTask(): Promise<void> {
  try {
    await os.registerActionTask(NOTIFICATION_ACTION_TASK);
  } catch (err) {
    if (__DEV__) console.warn('[notifications] action task register failed', err);
  }
}

// Returns a teardown. The caller owns it — without one, a remount (fast refresh, or a second
// mount) stacks another full set of store subscriptions and every change fans out N rebuilds.
export function initNotificationHandlers(): () => void {
  if (teardownHandlers) teardownHandlers();
  os.setForegroundHandler(shouldSuppressForCompletion);
  os.ensureCategories().catch(() => {});
  registerNotificationActionTask().catch(() => {});
  syncNotificationPermissionStatus().catch(reportScheduleError);
  dismissCompletedPresentedNotifications().catch(() => {});
  refreshSchedulingOnForeground().catch(reportScheduleError);
  const unsubscribers = [
    useUserStore.subscribe((state, prev) => {
      if (state.notificationsEnabled !== prev.notificationsEnabled) {
        if (state.notificationsEnabled) {
          NotificationScheduler.rebuild().catch(reportScheduleError);
        } else {
          NotificationScheduler.cancelAll().catch(reportScheduleError);
        }
        return;
      }
      if (
        state.language !== prev.language ||
        state.location !== prev.location ||
        state.nusach !== prev.nusach ||
        state.halachicOpinions !== prev.halachicOpinions ||
        state.inIsrael !== prev.inIsrael ||
        state.taharahEnabled !== prev.taharahEnabled ||
        state.hilulotEnabled !== prev.hilulotEnabled ||
        state.roshChodeshEnabled !== prev.roshChodeshEnabled ||
        state.weeklyReportEnabled !== prev.weeklyReportEnabled
      ) {
        NotificationScheduler.rebuild().catch(reportScheduleError);
      }
    }),
    useMitzvotStore.subscribe((state, prev) => {
      if (state.activeMitzvot === prev.activeMitzvot) return;
      if (mitzvotConfigChanged(state.activeMitzvot, prev.activeMitzvot)) {
        NotificationScheduler.rebuild().catch(reportScheduleError);
      }
    }),
    useCustomMitzvotStore.subscribe((state, prev) => {
      if (state.items !== prev.items) {
        NotificationScheduler.rebuild().catch(reportScheduleError);
      }
    }),
    useTaharahStore.subscribe((state, prev) => {
      if (!useUserStore.getState().taharahEnabled) return;
      if (
        state.events !== prev.events ||
        state.settings !== prev.settings ||
        state.discreetNotifications !== prev.discreetNotifications ||
        state.hefsekLeadMin !== prev.hefsekLeadMin ||
        state.bedikaEveningLeadMin !== prev.bedikaEveningLeadMin ||
        state.tevilaPrepLeadMin !== prev.tevilaPrepLeadMin
      ) {
        NotificationScheduler.rebuild().catch(reportScheduleError);
      }
    }),
  ];
  registerDailyRebuildTask().catch(() => {});
  teardownHandlers = () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    teardownHandlers = null;
  };
  return teardownHandlers;
}

let teardownHandlers: (() => void) | null = null;

// App reset resets four stores in a row, and every one of them fires the subscriptions above.
// Without this the reset would re-arm a full schedule from the freshly restored defaults —
// reminders at Jerusalem zmanim for a profile the user just deleted.
let schedulingSuspended = false;

export function setSchedulingSuspended(value: boolean): void {
  schedulingSuspended = value;
}

function mitzvotConfigChanged(
  next: Record<string, { enabled: boolean; customReminders?: Reminder[] }>,
  prev: Record<string, { enabled: boolean; customReminders?: Reminder[] }>,
): boolean {
  const keys = new Set([...Object.keys(next), ...Object.keys(prev)]);
  for (const id of keys) {
    const a = next[id];
    const b = prev[id];
    if ((a?.enabled ?? false) !== (b?.enabled ?? false)) return true;
    if (a?.customReminders !== b?.customReminders) return true;
  }
  return false;
}

export type { PendingNotificationMeta };
export { buildTriggerTime, notificationTargetFromData, pendingNotificationMetaFromContent };

export {
  ANDROID_CHANNELS,
  PENDING_LIMIT,
  IOS_MAX,
  DAILY_REBUILD_TASK,
  NOTIFICATION_ACTION_TASK,
  LAST_REBUILD_KEY,
  SCHEDULE_FORMAT_KEY,
  MITZVAH_REMINDER_CATEGORY,
  MITZVAH_TEXT_CATEGORY,
  TAHARAH_KIND,
  TAHARAH_BEDIKA_CATEGORY,
  UPDATE_KIND,
  UPDATE_NOTIFIED_KEY,
  MARK_DONE_ACTION,
  OPEN_TEXT_ACTION,
  shouldSuppressForCompletion,
};

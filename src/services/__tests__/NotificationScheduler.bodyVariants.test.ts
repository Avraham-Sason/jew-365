jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
}));

import { pickBodyForReminder } from '../NotificationScheduler';
import { MITZVOT } from '@/data/mitzvot';
import { Mitzvah, Reminder } from '@/types/mitzvah';

const baseMitzvah: Mitzvah = {
  id: 'test',
  name: { he: 'בדיקה' },
  icon: 'test',
  timeType: 'range-within-day',
  category: 'daily-morning',
  computeWindow: () => null,
  defaultReminders: [],
  skipOn: [],
  nuschaotSupported: ['ashkenaz'],
};

describe('pickBodyForReminder', () => {
  it('rotates variants deterministically by trigger day', () => {
    const reminder: Reminder = {
      anchor: 'start',
      offsetMin: 0,
      label: 'fallback',
      bodyVariants: ['variant-0', 'variant-1', 'variant-2'],
    };
    const triggers = [
      new Date('2026-05-06T00:00:00Z'),
      new Date('2026-05-07T00:00:00Z'),
      new Date('2026-05-08T00:00:00Z'),
    ];

    const result = triggers.map((trigger) => pickBodyForReminder(reminder, baseMitzvah, trigger));
    const expected = triggers.map((trigger) => reminder.bodyVariants![Math.floor(trigger.getTime() / 86_400_000) % 3]);
    expect(result).toEqual(expected);
    expect(new Set(result).size).toBe(3);
  });

  it('returns the same variant for the same trigger', () => {
    const reminder: Reminder = {
      anchor: 'start',
      offsetMin: 0,
      label: 'fallback',
      bodyVariants: ['first', 'second', 'third'],
    };
    const trigger = new Date('2026-05-06T12:00:00Z');
    expect(pickBodyForReminder(reminder, baseMitzvah, trigger)).toBe(
      pickBodyForReminder(reminder, baseMitzvah, trigger),
    );
  });

  it('falls back to the label and appends text content when requested', () => {
    const reminder: Reminder = {
      anchor: 'start',
      offsetMin: 0,
      label: 'fallback',
      includeContentInBody: true,
    };
    const mitzvah: Mitzvah = {
      ...baseMitzvah,
      contentBlocks: [
        { type: 'text', he: 'טקסט' },
        { type: 'blessing', he: 'ברכה' },
        { type: 'link', he: 'קישור', url: 'https://example.com' },
        { type: 'siddur', he: 'אשר יצר', textId: 'asher_yatzar' },
      ],
    };
    expect(pickBodyForReminder(reminder, mitzvah, new Date('2026-05-06T00:00:00Z'))).toBe('fallback\nטקסט\nברכה');
  });
});

describe('registry body variants', () => {
  const withVariants = MITZVOT.flatMap((mitzvah) =>
    mitzvah.defaultReminders.filter((r) => r.bodyVariants).map((reminder) => ({ mitzvah, reminder })),
  );

  it('keeps variants on the opening reminder of every daily mitzvah and the Omer', () => {
    const ids = withVariants.map(({ mitzvah }) => mitzvah.id);
    for (const id of [
      'tefillin',
      'tzitzit',
      'krias_shma_shacharit',
      'shacharit',
      'mincha',
      'maariv',
      'sefirat_haomer',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it.each(withVariants.map(({ mitzvah, reminder }) => [mitzvah.id, mitzvah, reminder] as const))(
    '%s offers three distinct non-empty variants that rotate day by day',
    (_id, mitzvah, reminder) => {
      const variants = reminder.bodyVariants!;
      expect(variants).toHaveLength(3);
      expect(new Set(variants.map((variant) => variant.trim())).size).toBe(3);
      expect(variants.every((variant) => variant.trim().length > 0)).toBe(true);

      const days = [0, 1, 2].map((offset) => new Date(Date.UTC(2026, 4, 6 + offset)));
      const bodies = days.map((day) => pickBodyForReminder(reminder, mitzvah, day).split('\n')[0]);
      expect(new Set(bodies)).toEqual(new Set(variants));
    },
  );
});

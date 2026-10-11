jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

import { HDate, months } from '@hebcal/core';
import { buildPlan } from '../plan';
import {
  IOS_HEADROOM,
  IOS_MAX,
  MITZVAH_REMINDER_CATEGORY,
  MITZVAH_TEXT_CATEGORY,
  PENDING_LIMIT,
  TAHARAH_KIND,
} from '../ids';
import type { PlanInput } from '../types';
import { CITIES } from '@/data/cities';
import { MITZVOT } from '@/data/mitzvot';
import { rulesFor } from '@/data/taharahPresets';
import { HebcalService } from '@/services/HebcalService';
import { at, zmanimFor } from '@/testing/zmanim';
import { t } from '@/i18n';
import type { Mitzvah } from '@/types/mitzvah';

const JERUSALEM = CITIES[0];
const ALL_NUSCHAOT: Mitzvah['nuschaotSupported'] = ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'];

// Tuesday, 2 Cheshvan 5787: the hilula of 3 Cheshvan opens that evening.
const TUESDAY = at(JERUSALEM, '2026-10-13T05:00');
const FRIDAY = at(JERUSALEM, '2026-11-13T06:00');
const WEDNESDAY = at(JERUSALEM, '2026-11-11T05:00');
const CHESHVAN_3 = new HDate(3, months.CHESHVAN, 5787).abs();

const zmanimOn = (iso: string) => zmanimFor(at(JERUSALEM, `${iso}T12:00`), JERUSALEM);
const minutes = (instant: Date, delta: number) => instant.getTime() + delta * 60_000;
const byId = (id: string) => MITZVOT.find((mitzvah) => mitzvah.id === id)!;

const STUDY: Mitzvah = {
  id: 'custom_1_study',
  name: { he: 'לימוד', en: 'Study' },
  icon: 'custom',
  isCustom: true,
  timeType: 'range-within-day',
  category: 'daily-morning',
  skipOn: [],
  nuschaotSupported: ALL_NUSCHAOT,
  defaultReminders: [{ anchor: 'start', offsetMin: 15, label: 'להתיישב ללמוד' }],
  contentBlocks: [{ type: 'blessing', he: 'ברכה' }],
  computeWindow: ({ zmanim }) => ({ start: zmanim.shkia, end: new Date(zmanim.shkia.getTime() + 2 * 3_600_000) }),
};

function planInput(overrides: Partial<PlanInput> = {}): PlanInput {
  const now = overrides.now ?? TUESDAY;
  return {
    now,
    fromDate: now,
    platform: 'android',
    hasPermission: true,
    language: 'he',
    location: JERUSALEM,
    settings: { nusach: 'ashkenaz', halachicOpinions: { ksSofZman: 'GRA' }, inIsrael: true },
    mitzvot: [byId('shacharit'), byId('mincha'), STUDY],
    reminderOverrides: {},
    completions: {},
    skipped: {},
    checkIns: {},
    enabledSince: {},
    hilulotEnabled: false,
    roshChodeshEnabled: false,
    weeklyReportEnabled: false,
    taharahEnabled: false,
    taharah: {
      events: [],
      settings: { preset: 'ashkenaz', rules: rulesFor('ashkenaz'), role: 'woman' },
      discreet: true,
      leads: { hefsekLeadMin: 90, bedikaEveningLeadMin: 60, tevilaPrepLeadMin: 180 },
    },
    ...overrides,
  };
}

const summary = (plan: ReturnType<typeof buildPlan>) =>
  plan.map((candidate) => [candidate.id, candidate.trigger.getTime()]);

describe('buildPlan', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('plans every enabled mitzvah on both horizon days, soonest first, and the hilula notice beside them', () => {
    const plan = buildPlan(planInput({ hilulotEnabled: true }));

    const expected: [string, number][] = [];
    for (const day of ['2026-10-13', '2026-10-14']) {
      const zmanim = zmanimOn(day);
      expected.push(
        [`shacharit__${day}__0`, zmanim.netzHaChama.getTime()],
        [`shacharit__${day}__1`, minutes(zmanim.sofZmanTfilaGra, -45)],
        [`mincha__${day}__0`, zmanim.minchaGedola.getTime()],
        [`mincha__${day}__1`, minutes(zmanim.shkia, -60)],
        [`${STUDY.id}__${day}__0`, minutes(zmanim.shkia, 15)],
      );
    }
    expected.push([`hilula:${CHESHVAN_3}:evening`, zmanimOn('2026-10-13').shkia.getTime()]);
    expected.sort((a, b) => a[1] - b[1]);

    expect(summary(plan)).toEqual(expected);
  });

  it('routes each kind to its own channel and attaches the mitzvah payload', () => {
    const plan = buildPlan(planInput({ hilulotEnabled: true }));
    const channelOf = (prefix: string) => [
      ...new Set(plan.filter((candidate) => candidate.id.startsWith(prefix)).map((candidate) => candidate.channel)),
    ];

    expect(channelOf('shacharit__')).toEqual(['mitzvot']);
    expect(channelOf('mincha__')).toEqual(['mitzvot']);
    expect(channelOf(STUDY.id)).toEqual(['mitzvot']);
    expect(channelOf('hilula:')).toEqual(['hilulot']);

    const study = plan.find((candidate) => candidate.id === `${STUDY.id}__2026-10-13__0`)!;
    expect(study.categoryIdentifier).toBe(MITZVAH_TEXT_CATEGORY);
    expect(study.title).toBe('לימוד');
    expect(study.data).toEqual({
      mitzvahId: STUDY.id,
      windowEnd: new Date(minutes(zmanimOn('2026-10-13').shkia, 120)).toISOString(),
      dateKey: '2026-10-13',
      reminderIndex: 0,
      customId: `${STUDY.id}__2026-10-13__0`,
      skipIfDone: false,
      hasText: true,
      fullContent: STUDY.contentBlocks,
    });
  });

  it('gives a mitzvah with no text the mark-done-only category', () => {
    const plain: Mitzvah = { ...STUDY, id: 'custom_2_plain', contentBlocks: undefined };
    const plan = buildPlan(planInput({ mitzvot: [plain] }));

    expect(plan.length).toBeGreaterThan(0);
    for (const candidate of plan) {
      expect(candidate.categoryIdentifier).toBe(MITZVAH_REMINDER_CATEGORY);
      expect(candidate.data.hasText).toBe(false);
    }
  });

  it('names a mitzvah in English when the input language is English', () => {
    const plan = buildPlan(planInput({ language: 'en', mitzvot: [STUDY] }));
    expect(plan.map((candidate) => candidate.title)).toEqual(['Study', 'Study']);
  });

  it('leaves out the hilula notices while the setting is off', () => {
    const plan = buildPlan(planInput({ hilulotEnabled: false }));
    expect(plan.filter((candidate) => candidate.id.startsWith('hilula:'))).toEqual([]);
  });

  it('plans the Rosh Chodesh notices on their own channel and leaves them out while the setting is off', () => {
    const sunday = at(JERUSALEM, '2026-10-11T06:00');
    const noticesOf = (roshChodeshEnabled: boolean) =>
      buildPlan(planInput({ now: sunday, mitzvot: [], roshChodeshEnabled })).filter((candidate) =>
        candidate.id.startsWith('roshChodesh:'),
      );

    expect(noticesOf(false)).toEqual([]);
    const notices = noticesOf(true);
    expect(notices.map((candidate) => candidate.id)).toEqual([
      `roshChodesh:${new HDate(30, months.TISHREI, 5787).abs()}:day`,
      `roshChodesh:${new HDate(1, months.CHESHVAN, 5787).abs()}:day`,
    ]);
    expect(notices.map((candidate) => candidate.trigger.getTime())).toEqual([
      at(JERUSALEM, '2026-10-11T07:00').getTime(),
      at(JERUSALEM, '2026-10-12T07:00').getTime(),
    ]);
    for (const notice of notices) {
      expect(notice.channel).toBe('roshChodesh');
      expect(notice.categoryIdentifier).toBeUndefined();
    }
  });

  it('plans nothing without notification permission', () => {
    expect(buildPlan(planInput({ hasPermission: false }))).toEqual([]);
  });

  it('skips a mitzvah that is done or skipped on a day, and keeps its other days', () => {
    const plan = buildPlan(
      planInput({
        completions: { '2026-10-13': { shacharit: 1 } },
        skipped: { '2026-10-14': { mincha: 1 } },
      }),
    );
    const ids = plan.map((candidate) => candidate.id);

    expect(ids.filter((id) => id.startsWith('shacharit__'))).toEqual([
      'shacharit__2026-10-14__0',
      'shacharit__2026-10-14__1',
    ]);
    expect(ids.filter((id) => id.startsWith('mincha__'))).toEqual(['mincha__2026-10-13__0', 'mincha__2026-10-13__1']);
  });

  it("uses a mitzvah's own reminders when the user edited them", () => {
    const plan = buildPlan(
      planInput({
        mitzvot: [byId('mincha')],
        reminderOverrides: { mincha: [{ anchor: 'start', offsetMin: 10, label: 'x' }] },
      }),
    );

    expect(summary(plan)).toEqual([
      ['mincha__2026-10-13__0', minutes(zmanimOn('2026-10-13').minchaGedola, 10)],
      ['mincha__2026-10-14__0', minutes(zmanimOn('2026-10-14').minchaGedola, 10)],
    ]);
  });

  it('reads the clock from the input: a reminder already due at `now` is dropped', () => {
    const afterNetz = at(JERUSALEM, '2026-10-13T07:00');
    const plan = buildPlan(planInput({ now: afterNetz, mitzvot: [byId('shacharit')] }));

    expect(plan.map((candidate) => candidate.id)).toEqual([
      'shacharit__2026-10-13__1',
      'shacharit__2026-10-14__0',
      'shacharit__2026-10-14__1',
    ]);
  });

  it('keeps the other mitzvot when one throws', () => {
    const exploding: Mitzvah = {
      ...STUDY,
      id: 'exploding',
      computeWindow: () => {
        throw new Error('zmanim blew up');
      },
    };
    const plan = buildPlan(planInput({ mitzvot: [exploding, byId('mincha')] }));

    expect(plan.map((candidate) => candidate.id)).toEqual([
      'mincha__2026-10-13__0',
      'mincha__2026-10-13__1',
      'mincha__2026-10-14__0',
      'mincha__2026-10-14__1',
    ]);
    expect(warn).toHaveBeenCalledWith('[notifications] scheduling failed', 'exploding', expect.any(Error));
  });

  describe('the slot cap', () => {
    // Seventy mitzvot whose single reminder falls one minute apart, on each of the two horizon days.
    const bulk = (index: number): Mitzvah => ({
      ...STUDY,
      id: `bulk_${index}`,
      contentBlocks: undefined,
      defaultReminders: [{ anchor: 'start', offsetMin: 0, label: 'x' }],
      computeWindow: () => ({
        start: new Date(minutes(TUESDAY, index + 1)),
        end: new Date(minutes(TUESDAY, 600)),
      }),
    });
    const many = Array.from({ length: 70 }, (_, index) => bulk(index));
    const earliest = Array.from({ length: PENDING_LIMIT / 2 }, (_, index) => [
      `bulk_${index}__2026-10-13__0`,
      `bulk_${index}__2026-10-14__0`,
    ]).flat();

    it('keeps the soonest reminders and warns about the rest', () => {
      const plan = buildPlan(planInput({ mitzvot: many }));

      expect(plan.map((candidate) => candidate.id)).toEqual(earliest);
      expect(warn).toHaveBeenCalledWith(
        `[notifications] ${140 - PENDING_LIMIT} reminder(s) beyond the ${PENDING_LIMIT} slot cap were not scheduled`,
      );
    });

    it('leaves iOS the headroom its 64 pending requests need, and caps elsewhere at the pending limit', () => {
      expect(buildPlan(planInput({ mitzvot: many, platform: 'ios' }))).toHaveLength(IOS_MAX - IOS_HEADROOM);
      expect(buildPlan(planInput({ mitzvot: many, platform: 'android' }))).toHaveLength(PENDING_LIMIT);
    });
  });

  describe('a Shabbat in the horizon', () => {
    const shabbat = () => HebcalService.holyBlockAt(at(JERUSALEM, '2026-11-14T12:00'), JERUSALEM)!;
    const plan = () => buildPlan(planInput({ now: FRIDAY, mitzvot: [byId('shacharit'), byId('mincha')] }));

    it('sends the pre-block notice an hour before candle lighting, on the mitzvot channel with no category', () => {
      const notice = plan().find((candidate) => candidate.id === 'blockNotice:2026-11-14')!;

      expect(notice.trigger.getTime()).toBe(minutes(shabbat().start, -60));
      expect(notice.channel).toBe('mitzvot');
      expect(notice.title).toBe(t('holyBlock.title.shabbat'));
      expect(notice.categoryIdentifier).toBeUndefined();
      expect(notice.data).toEqual({ kind: 'blockNotice' });
    });

    it('sends the check-in nudges at tzeit, two hours later and the next evening, on the system channel', () => {
      const nudges = plan().filter((candidate) => candidate.id.startsWith('checkin:'));

      expect(summary(nudges)).toEqual([
        ['checkin:2026-11-14:0', shabbat().end.getTime()],
        ['checkin:2026-11-14:1', minutes(shabbat().end, 120)],
        ['checkin:2026-11-14:2', new Date(2026, 10, 15, 20).getTime()],
      ]);
      for (const nudge of nudges) {
        expect(nudge.channel).toBe('system');
        expect(nudge.categoryIdentifier).toBeUndefined();
        expect(nudge.data).toEqual({ kind: 'checkin', blockId: '2026-11-14' });
      }
    });

    it('sends the weekly report between the first and second check-in nudge, on the system channel', () => {
      const withReport = () =>
        buildPlan(planInput({ now: FRIDAY, mitzvot: [byId('shacharit'), byId('mincha')], weeklyReportEnabled: true }));
      const sequence = withReport().filter((candidate) => /^(checkin|report):/.test(candidate.id));

      expect(summary(sequence)).toEqual([
        ['checkin:2026-11-14:0', shabbat().end.getTime()],
        ['report:2026-11-14', minutes(shabbat().end, 45)],
        ['checkin:2026-11-14:1', minutes(shabbat().end, 120)],
        ['checkin:2026-11-14:2', new Date(2026, 10, 15, 20).getTime()],
      ]);
      const report = sequence[1];
      expect(report.channel).toBe('system');
      expect(report.categoryIdentifier).toBeUndefined();
      expect(report.title).toBe(t('report.notice.title'));
      expect(report.body).toBe(t('report.notice.body'));
      expect(report.data).toEqual({ kind: 'report', report: { week: '2026-11-14' } });
    });

    it('leaves the weekly report out while its setting is off', () => {
      expect(plan().filter((candidate) => candidate.id.startsWith('report:'))).toEqual([]);
    });

    it('plans nothing strictly inside the block', () => {
      const { start, end } = shabbat();
      const inside = plan().filter(
        (candidate) => candidate.trigger.getTime() > start.getTime() && candidate.trigger.getTime() < end.getTime(),
      );
      expect(inside.map((candidate) => candidate.id)).toEqual([]);
    });
  });

  describe('taharah reminders', () => {
    const onsetDay = new HDate(new Date(2026, 10, 8)).abs();
    const events: PlanInput['taharah']['events'] = [
      { id: 'e1', recordedAt: 1, type: 'onset', onah: { abs: onsetDay, kind: 'day' } },
    ];

    it('plans none while the feature is off', () => {
      const plan = buildPlan(
        planInput({ now: WEDNESDAY, mitzvot: [], taharahEnabled: false, taharah: { ...planInput().taharah, events } }),
      );
      expect(plan).toEqual([]);
    });

    it('plans the hefsek on the taharah channel, discreet, at shkia minus the lead', () => {
      const plan = buildPlan(
        planInput({ now: WEDNESDAY, mitzvot: [], taharahEnabled: true, taharah: { ...planInput().taharah, events } }),
      );

      expect(plan).toHaveLength(1);
      const [hefsek] = plan;
      expect(hefsek.id).toBe(`${TAHARAH_KIND}:hefsek:${onsetDay + 4}`);
      expect(hefsek.trigger.getTime()).toBe(minutes(zmanimOn('2026-11-12').shkia, -90));
      expect(hefsek.channel).toBe('taharah');
      expect(hefsek.title).toBe(t('taharah.notify.discreetTitle'));
      expect(hefsek.categoryIdentifier).toBeUndefined();
      expect(hefsek.data).toEqual({ kind: TAHARAH_KIND, taharah: { task: 'hefsek', day: onsetDay + 4 } });
    });
  });
});

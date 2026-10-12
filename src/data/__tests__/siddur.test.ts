jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

import * as fs from 'fs';
import * as path from 'path';
import { HDate, gematriya, months } from '@hebcal/core';
import {
  SIDDUR_GROUPS,
  SIDDUR_TEXTS,
  SIDDUR_TEXT_IDS,
  STANDALONE_TEXTS,
  customSiddurText,
  hasSiddurText,
  hasStandaloneText,
  isSiddurTextId,
  mitzvahTextId,
  standaloneTextId,
  standaloneTextDay,
  standaloneTextsIn,
} from '../siddur';
import { HebcalService } from '@/services/HebcalService';
import { SHARED_SIDDUR_TEXT_IDS, SIDDUR_ASSETS } from '../siddurAssets.generated';
import { findMitzvah } from '../mitzvot';
import { Mitzvah, Nusach } from '@/types/mitzvah';
import {
  DayFeatures,
  DayFlag,
  MitzvahTextId,
  Run,
  SiddurSection,
  SiddurSegment,
  SiddurText,
  SiddurTextId,
  StandaloneTextId,
} from '@/types/siddur';
import {
  aloneFolds,
  dayFeatures,
  forMaritalStatus,
  liturgicalDay,
  matchesCondition,
  pickerEntries,
  resolveSiddurText,
  segmentBlocks,
} from '@/utils/siddur';
import { keepsCholHamoed } from '@/utils/skipRules';
import { readSiddurText, siddurAssetFolder } from '@/testing/siddur';

const NUSCHAOT: Nusach[] = ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'];
const TEXT_IDS = SIDDUR_TEXT_IDS;
const MITZVAH_TEXT_IDS = Object.keys(SIDDUR_TEXTS) as MitzvahTextId[];
const STANDALONE_IDS = Object.keys(STANDALONE_TEXTS) as StandaloneTextId[];
const ASSET_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'siddur');

function load(nusach: Nusach, id: SiddurTextId): SiddurText {
  return readSiddurText(nusach, id);
}

function letters(text: string): string {
  return text
    .replace(/־/g, ' ')
    .replace(/[֑-ׇ͏]/g, '')
    .replace(/[״"׳'(),.:;]/g, '')
    .replace(/\s+/g, ' ');
}

function textOn(nusach: Nusach, id: SiddurTextId, day: DayFeatures, keep: (run: Run) => boolean): string {
  return letters(
    resolveSiddurText(load(nusach, id), day)
      .flatMap((section) =>
        section.segments.flatMap((segment) =>
          segment.he.map((runs) =>
            runs
              .filter(keep)
              .map((run) => run.t)
              .join(''),
          ),
        ),
      )
      .join(' '),
  );
}

function saidOn(nusach: Nusach, id: SiddurTextId, day: DayFeatures): string {
  return textOn(nusach, id, day, (run) => run.s !== 'n');
}

function shownOn(nusach: Nusach, id: SiddurTextId, day: DayFeatures): string {
  return textOn(nusach, id, day, () => true);
}

const ISRAEL = { inIsrael: true, jerusalem: false };
const DIASPORA = { inIsrael: false, jerusalem: false };

function day(date: number, month: number, year: number, place = ISRAEL): DayFeatures {
  return dayFeatures(new HDate(date, month, year), place);
}

function civilDay(civil: Date, place = ISRAEL): DayFeatures {
  return dayFeatures(new HDate(civil), place);
}

function count(text: string, pattern: RegExp): number {
  return (text.match(new RegExp(pattern.source, 'g')) ?? []).length;
}

function eveningOf(civil: Date, place = ISRAEL): DayFeatures {
  return dayFeatures(liturgicalDay(civil, true), place);
}

function erev(day: number, month: number, year: number): Date {
  return new HDate(day, month, year).prev().greg();
}

describe('siddur content', () => {
  it('ships every registered text for every nusach, in step with the generated asset map', () => {
    for (const nusach of NUSCHAOT) {
      for (const id of TEXT_IDS) {
        expect((SIDDUR_ASSETS[nusach] as Record<string, unknown>)[id]).toBeDefined();
        const text = load(nusach, id);
        if (siddurAssetFolder(nusach, id) === 'shared') expect(text.nusach).toBeUndefined();
        else expect(text.nusach).toBe(nusach);
        expect(text.id).toBe(id);
        expect(text.sections.length).toBeGreaterThan(0);
        expect(text.credits.length).toBeGreaterThan(0);
        for (const credit of text.credits) {
          expect(credit.license).toMatch(/^(CC|Public Domain$)/);
          expect(credit.url).toMatch(/^https:\/\/(www\.sefaria\.org|he\.wikisource\.org)\//);
        }
        for (const segment of text.sections.flatMap((section) => section.segments)) {
          expect(segment.he.length).toBeGreaterThan(0);
          expect(segment.he.flat().some((run) => /[א-ת]/.test(run.t))).toBe(true);
          if (segment.en) expect(segment.en).toMatch(/[A-Za-z]{3,}/);
        }
      }
    }
  });

  it('keeps a text that every nusach shares in one shared asset, which the map gives every nusach', () => {
    expect([...SHARED_SIDDUR_TEXT_IDS]).toEqual(['tikkun_haklali', 'tehillim']);
    const map = fs.readFileSync(path.join(__dirname, '..', 'siddurAssets.generated.ts'), 'utf8');
    for (const id of SHARED_SIDDUR_TEXT_IDS) {
      expect(fs.existsSync(path.join(ASSET_DIR, 'shared', `${id}.siddur`))).toBe(true);
      for (const nusach of NUSCHAOT) {
        expect(fs.existsSync(path.join(ASSET_DIR, nusach, `${id}.siddur`))).toBe(false);
        expect(siddurAssetFolder(nusach, id)).toBe('shared');
      }
      expect(map.split(`${id}: require('../../assets/siddur/shared/${id}.siddur')`)).toHaveLength(NUSCHAOT.length + 1);
    }
  });

  it('registers mitzvah texts only for real mitzvot, and standalone texts for none', () => {
    for (const id of MITZVAH_TEXT_IDS) expect(findMitzvah(id)).toBeDefined();
    for (const id of STANDALONE_IDS) expect(findMitzvah(id)).toBeUndefined();
    expect(MITZVAH_TEXT_IDS.filter((id) => STANDALONE_IDS.includes(id as string as StandaloneTextId))).toEqual([]);
  });

  it('shows exactly the night’s omer count, for all 49 nights, in every nusach', () => {
    const monthName: Record<number, string> = {
      [months.NISAN]: 'ניסן',
      [months.IYYAR]: 'אייר',
      [months.SIVAN]: 'סיון',
    };
    for (const nusach of NUSCHAOT) {
      const text = load(nusach, 'sefirat_haomer');
      for (let day = 1; day <= 49; day++) {
        const resolved = resolveSiddurText(text, { flags: new Set(), omerDay: day });
        const counted = resolved
          .flatMap((section) => section.segments)
          .filter((segment) => segment.when?.omerDay !== undefined);
        expect(counted.length).toBeGreaterThan(0);
        expect(counted.every((segment) => segment.when?.omerDay === day)).toBe(true);
        const hd = new HDate(15, months.NISAN, 5786).add(day);
        const label = letters(`${gematriya(hd.getDate())} ${monthName[hd.getMonth()]}`);
        const shown = letters(counted.flatMap((segment) => segment.he.flat().map((run) => run.t)).join(' '));
        expect(shown).toContain(label);
        expect(shown).toContain('היום');
      }
      const outside = resolveSiddurText(text, { flags: new Set(), omerDay: null });
      expect(
        outside.flatMap((section) => section.segments).some((segment) => segment.when?.omerDay !== undefined),
      ).toBe(false);
    }
  });

  it('lights candles with the right blessing for each kind of evening, in every nusach', () => {
    const regularFriday = new Date(2026, 9, 9);
    const erevPesach = erev(15, months.NISAN, 5786);
    const erevLastDayPesach = erev(21, months.NISAN, 5786);
    const erevYomKippur = erev(10, months.TISHREI, 5787);
    const erevRoshHashanaOnShabbat = erev(1, months.TISHREI, 5787);
    expect([regularFriday, erevPesach, erevLastDayPesach, erevYomKippur].map((d) => d.getDay())).toEqual([5, 3, 2, 0]);
    expect(erevRoshHashanaOnShabbat.getDay()).toBe(5);

    for (const nusach of NUSCHAOT) {
      const shabbat = saidOn(nusach, 'candle_lighting', eveningOf(regularFriday));
      expect(shabbat).toMatch(/נר של שבת/);
      expect(shabbat).not.toMatch(/יום טוב|הכפורים|שהחינו/);

      const pesach = saidOn(nusach, 'candle_lighting', eveningOf(erevPesach));
      expect(pesach).toMatch(/נר של יום טוב/);
      expect(pesach).toMatch(/שהחינו/);
      expect(pesach).not.toMatch(/שבת/);

      const lastDay = saidOn(nusach, 'candle_lighting', eveningOf(erevLastDayPesach));
      expect(lastDay).toMatch(/נר של יום טוב/);
      expect(lastDay).not.toMatch(/שהחינו|שבת/);

      const yomKippur = saidOn(nusach, 'candle_lighting', eveningOf(erevYomKippur));
      expect(yomKippur).toMatch(/נר של יום הכפורים/);
      expect(yomKippur).toMatch(/שהחינו/);
      expect(yomKippur).not.toMatch(/נר של שבת|יום טוב/);

      const both = saidOn(nusach, 'candle_lighting', eveningOf(erevRoshHashanaOnShabbat));
      expect(both).toMatch(/נר של שבת ו(של )?יום טוב/);
      expect(both).toMatch(/שהחינו/);
    }
  });

  it('says only the blessing on the flame when Tisha B’Av begins at havdalah', () => {
    const regularSaturday = new Date(2026, 9, 10);
    const tishaBavOnShabbat = new HDate(9, months.AV, 5782).greg();
    expect(regularSaturday.getDay()).toBe(6);
    expect(tishaBavOnShabbat.getDay()).toBe(6);

    for (const nusach of NUSCHAOT) {
      const regular = saidOn(nusach, 'havdalah', eveningOf(regularSaturday));
      expect(regular).toMatch(/בורא פרי הג[פג]ן/);
      expect(regular).toMatch(/בשמים/);
      expect(regular).toMatch(/מאורי האש/);
      expect(regular).toMatch(/המבדיל בין קדש לחול/);

      const tishaBav = saidOn(nusach, 'havdalah', eveningOf(tishaBavOnShabbat));
      expect(tishaBav).toMatch(/מאורי האש/);
      expect(tishaBav).not.toMatch(/הגפן|הגפן|בשמים|המבדיל/);
    }
  });

  it('fits havdalah to what it closes: spices only after Shabbat, the flame after Shabbat and Yom Kippur', () => {
    const lastDayOfPesachIsrael = new HDate(21, months.NISAN, 5786).greg(); // Wednesday
    const lastDayOfPesachDiaspora = new HDate(22, months.NISAN, 5786).greg(); // Thursday
    const yomKippur = new HDate(10, months.TISHREI, 5787).greg(); // Monday
    const yomKippurOnShabbat = new HDate(10, months.TISHREI, 5785).greg();
    const deferredTishaBav = new HDate(10, months.AV, 5782).greg(); // the fast, pushed to Sunday
    expect(lastDayOfPesachIsrael.getDay()).toBe(3);
    expect(yomKippurOnShabbat.getDay()).toBe(6);
    expect(deferredTishaBav.getDay()).toBe(0);

    for (const nusach of NUSCHAOT) {
      for (const motzaeiYomTov of [eveningOf(lastDayOfPesachIsrael), eveningOf(lastDayOfPesachDiaspora, DIASPORA)]) {
        const said = saidOn(nusach, 'havdalah', motzaeiYomTov);
        expect(said).toMatch(/בורא פרי הג[פג]ן/);
        expect(said).toMatch(/המבדיל בין קדש לחול/);
        expect(said).not.toMatch(/בשמים/);
        expect(said).not.toMatch(/מאורי האש/);
      }

      const afterYomKippur = saidOn(nusach, 'havdalah', eveningOf(yomKippur));
      expect(afterYomKippur).toMatch(/בורא פרי הג[פג]ן/);
      expect(afterYomKippur).toMatch(/מאורי האש/);
      expect(afterYomKippur).toMatch(/המבדיל בין קדש לחול/);
      expect(afterYomKippur).not.toMatch(/בשמים/);
      expect(shownOn(nusach, 'havdalah', eveningOf(yomKippur))).toMatch(/נר ששבת/);

      const afterYomKippurOnShabbat = saidOn(nusach, 'havdalah', eveningOf(yomKippurOnShabbat));
      expect(afterYomKippurOnShabbat).toMatch(/בשמים/);
      expect(afterYomKippurOnShabbat).toMatch(/מאורי האש/);

      const afterTheFast = saidOn(nusach, 'havdalah', eveningOf(deferredTishaBav));
      expect(afterTheFast).toMatch(/בורא פרי הג[פג]ן/);
      expect(afterTheFast).toMatch(/המבדיל בין קדש לחול/);
      expect(afterTheFast).not.toMatch(/בשמים/);
      expect(afterTheFast).not.toMatch(/מאורי האש/);

      // Nothing on screen asks for spices on a night that has none — the Edot HaMizrach source
      // tells the user to hold them in its opening instruction.
      for (const withoutSpices of [
        eveningOf(lastDayOfPesachIsrael),
        eveningOf(yomKippur),
        eveningOf(deferredTishaBav),
      ]) {
        expect(shownOn(nusach, 'havdalah', withoutSpices)).not.toMatch(/בשמים/);
      }
      expect(shownOn(nusach, 'havdalah', eveningOf(new Date(2026, 9, 10)))).toMatch(/בשמים/);

      const tishaBavNight = shownOn(nusach, 'havdalah', eveningOf(new HDate(9, months.AV, 5782).greg()));
      expect(tishaBavNight).toMatch(/בצאת הצום/);
      expect(shownOn(nusach, 'havdalah', eveningOf(new Date(2026, 9, 10)))).not.toMatch(/נר ששבת|בצאת הצום/);
    }
  });

  it('tells Ashkenaz to skip the verses after a weekday Yom Kippur, as its machzor does', () => {
    const weekdayYomKippur = eveningOf(new HDate(10, months.TISHREI, 5787).greg());
    const yomKippurOnShabbat = eveningOf(new HDate(10, months.TISHREI, 5785).greg());
    expect(shownOn('ashkenaz', 'havdalah', weekdayYomKippur)).toMatch(/אין אומרים את הפסוקים/);
    expect(shownOn('ashkenaz', 'havdalah', yomKippurOnShabbat)).not.toMatch(/אין אומרים את הפסוקים/);
    expect(shownOn('ashkenaz', 'havdalah', eveningOf(new Date(2026, 9, 10)))).not.toMatch(/אין אומרים את הפסוקים/);
  });

  it('drops "she’asa li kol tzorki" on Tisha B’Av and Yom Kippur where the nusach does', () => {
    const tishaBav = dayFeatures(new HDate(9, months.AV, 5786), ISRAEL);
    const weekday = dayFeatures(new HDate(12, months.CHESHVAN, 5787), ISRAEL);
    const yomKippur = dayFeatures(new HDate(10, months.TISHREI, 5787), ISRAEL);
    for (const nusach of NUSCHAOT) {
      expect(saidOn(nusach, 'birchot_hashachar', weekday)).toMatch(/שעשה לי כל צרכי/);
      const omits = nusach !== 'ashkenaz';
      for (const day of [tishaBav, yomKippur]) {
        const said = saidOn(nusach, 'birchot_hashachar', day);
        if (omits) expect(said).not.toMatch(/שעשה לי כל צרכי/);
        else expect(said).toMatch(/שעשה לי כל צרכי/);
      }
    }
  });

  it('adds the Rosh Chodesh line to the Edot HaMizrach after-blessing only on Rosh Chodesh', () => {
    const roshChodesh = dayFeatures(new HDate(1, months.CHESHVAN, 5787), ISRAEL);
    const weekday = dayFeatures(new HDate(12, months.CHESHVAN, 5787), ISRAEL);
    expect(saidOn('edot_hamizrach', 'havdalah', roshChodesh)).toMatch(/ביום ראש חדש הזה/);
    expect(saidOn('edot_hamizrach', 'havdalah', weekday)).not.toMatch(/ראש חדש/);
  });
});

describe('weekday mincha', () => {
  const weekday = day(11, months.CHESHVAN, 5787);
  const friday = day(12, months.CHESHVAN, 5787);
  const tenDays = day(5, months.TISHREI, 5787);
  const tzomGedaliah = day(3, months.TISHREI, 5787);
  const tammuzFast = day(17, months.TAMUZ, 5786);
  const tishaBav = day(9, months.AV, 5786);
  const roshChodesh = day(1, months.CHESHVAN, 5787);
  const cholHamoed = day(18, months.NISAN, 5786);
  const chanukah = day(27, months.KISLEV, 5787);
  const purim = day(14, months.ADAR_II, 5787);
  const avinuMalkeinu = /אבינו מלכנו חטאנו לפניך/;

  it('falls on weekdays in its fixtures', () => {
    for (const fixture of [
      weekday,
      friday,
      tenDays,
      tzomGedaliah,
      tammuzFast,
      tishaBav,
      roshChodesh,
      cholHamoed,
      chanukah,
      purim,
    ]) {
      expect(fixture.flags.has('shabbat') || fixture.flags.has('yomTov')).toBe(false);
    }
    expect(friday.flags.has('friday')).toBe(true);
  });

  it('says the Ten Days changes only during the Ten Days, in every nusach', () => {
    for (const nusach of NUSCHAOT) {
      const ten = saidOn(nusach, 'mincha', tenDays);
      expect(ten).toMatch(/המלך הקדוש/);
      expect(ten).toMatch(/המלך המשפט/);
      expect(ten).toMatch(/זכרנו לחיים/);
      expect(ten).not.toMatch(/האל הקדוש|מלך או?הב צדקה ומשפט/);

      const plain = saidOn(nusach, 'mincha', weekday);
      expect(plain).toMatch(/האל הקדוש/);
      expect(plain).toMatch(/מלך או?הב צדקה ומשפט/);
      expect(plain).not.toMatch(/המלך הקדוש|המלך המשפט|זכרנו לחיים/);
    }
  });

  it('says Aneinu only on a public fast', () => {
    for (const nusach of NUSCHAOT) {
      expect(saidOn(nusach, 'mincha', tammuzFast)).toMatch(/עננו \S+ עננו/);
      expect(saidOn(nusach, 'mincha', weekday)).not.toMatch(/עננו \S+ עננו/);
    }
    expect(saidOn('ashkenaz', 'mincha', tammuzFast)).toMatch(/שים שלום/);
    expect(saidOn('ashkenaz', 'mincha', tammuzFast)).not.toMatch(/שלום רב/);
    expect(saidOn('ashkenaz', 'mincha', weekday)).toMatch(/שלום רב/);
    expect(saidOn('ashkenaz', 'mincha', weekday)).not.toMatch(/שים שלום/);
  });

  it('closes Boneh Yerushalayim with Nachem on Tisha B’Av instead of the ordinary ending', () => {
    for (const nusach of NUSCHAOT) {
      const fast = saidOn(nusach, 'mincha', tishaBav);
      expect(fast).toMatch(/אבלי ציון/);
      expect(fast).toMatch(/מנחם ציון/);
      expect(count(fast, /ברוך אתה \S+ בונה ירושלי?ם/)).toBe(0);

      const plain = saidOn(nusach, 'mincha', weekday);
      expect(plain).not.toMatch(/אבלי ציון|מנחם ציון/);
      expect(count(plain, /ברוך אתה \S+ בונה ירושלי?ם/)).toBe(1);
    }
  });

  it('names the day in Yaaleh Veyavo and the festival in Al HaNissim', () => {
    for (const nusach of NUSCHAOT) {
      const newMonth = saidOn(nusach, 'mincha', roshChodesh);
      expect(newMonth).toMatch(/ראש ה?חו?דש הזה/);
      expect(newMonth).not.toMatch(/חג המצות הזה|חג הסכות הזה/);

      const pesach = saidOn(nusach, 'mincha', cholHamoed);
      expect(pesach).toMatch(/חג המצות הזה/);
      expect(pesach).not.toMatch(/ראש ה?חו?דש הזה|חג הסכות הזה/);

      expect(saidOn(nusach, 'mincha', weekday)).not.toMatch(/יעלה ויבא|על הנסים/);

      const lights = saidOn(nusach, 'mincha', chanukah);
      expect(lights).toMatch(/מתתיה/);
      expect(lights).not.toMatch(/מרדכי/);

      const lots = saidOn(nusach, 'mincha', purim);
      expect(lots).toMatch(/מרדכי/);
      expect(lots).not.toMatch(/מתתיה/);
    }
  });

  it('says Tachanun only on days it is said', () => {
    for (const nusach of NUSCHAOT) {
      expect(saidOn(nusach, 'mincha', weekday)).toMatch(/ואנחנו לא נדע/);
      for (const noTachanun of [friday, roshChodesh, tishaBav, chanukah]) {
        expect(saidOn(nusach, 'mincha', noTachanun)).not.toMatch(/ואנחנו לא נדע/);
      }
    }
  });

  it('says Avinu Malkeinu in the Ten Days and on fasts, with the lines that match the day', () => {
    for (const nusach of NUSCHAOT) {
      for (const tenDaysOrBoth of [tenDays, tzomGedaliah]) {
        const said = saidOn(nusach, 'mincha', tenDaysOrBoth);
        expect(said).toMatch(avinuMalkeinu);
        expect(said).toMatch(/כתבנו בספר חיים טובים/);
        expect(said).not.toMatch(/זכרנו לחיים טובים/);
      }
      expect(saidOn(nusach, 'mincha', weekday)).not.toMatch(avinuMalkeinu);
      expect(saidOn(nusach, 'mincha', friday)).not.toMatch(avinuMalkeinu);
      expect(saidOn(nusach, 'mincha', day(7, months.TISHREI, 5787))).not.toMatch(avinuMalkeinu);
      expect(saidOn(nusach, 'mincha', day(9, months.TISHREI, 5787))).not.toMatch(avinuMalkeinu);
    }
    for (const nusach of ['ashkenaz', 'sefard', 'chabad'] as const) {
      const fast = saidOn(nusach, 'mincha', tammuzFast);
      expect(fast).toMatch(avinuMalkeinu);
      expect(fast).toMatch(/זכרנו לחיים טובים/);
      expect(fast).not.toMatch(/כתבנו בספר חיים טובים/);
    }
    expect(saidOn('chabad', 'mincha', tenDays)).toMatch(/אבינו מלכנו חדש עלינו שנה טובה/);
    expect(saidOn('chabad', 'mincha', tzomGedaliah)).toMatch(/אבינו מלכנו חדש עלינו שנה טובה/);
    expect(saidOn('chabad', 'mincha', tammuzFast)).toMatch(/אבינו מלכנו ברך עלינו שנה טובה/);
  });

  it('follows the season and the place for dew and rain', () => {
    const summer = day(20, months.SIVAN, 5786);
    const winterBeforeDiasporaRain = day(11, months.CHESHVAN, 5787, DIASPORA);
    for (const nusach of NUSCHAOT) {
      const winter = saidOn(nusach, 'mincha', weekday);
      expect(winter).toMatch(/משיב הרוח/);
      expect(winter).toMatch(/טל ומטר/);
      expect(winter).not.toMatch(/מוריד הטל/);

      const dry = saidOn(nusach, 'mincha', summer);
      expect(dry).toMatch(/מוריד הטל/);
      expect(dry).not.toMatch(/משיב הרוח|טל ומטר/);

      const abroad = saidOn(nusach, 'mincha', winterBeforeDiasporaRain);
      expect(abroad).toMatch(/משיב הרוח/);
      expect(abroad).not.toMatch(/טל ומטר/);

      const summerAbroad = saidOn(nusach, 'mincha', day(20, months.SIVAN, 5786, DIASPORA));
      if (nusach === 'ashkenaz') expect(summerAbroad).not.toMatch(/מוריד הטל|משיב הרוח/);
      else expect(summerAbroad).toMatch(/מוריד הטל/);
    }
  });
});

describe('weekday maariv', () => {
  const weeknight = day(11, months.CHESHVAN, 5787);
  const afterShabbat = civilDay(new Date(2026, 9, 11));
  const afterShabbatBeforeYomKippur = civilDay(new Date(2026, 8, 20));
  const afterYomTovIntoCholHamoed = day(16, months.NISAN, 5786);
  const tishaBav = day(9, months.AV, 5786);
  const tishaBavAfterShabbat = day(10, months.AV, 5782);
  const viHiNoam = /ישב (תהלים צא )?בסתר עליון/;

  it('opens the nights it claims to', () => {
    expect(afterShabbat.flags.has('viHiNoam')).toBe(true);
    expect(afterShabbatBeforeYomKippur.flags.has('motzaeiShabbat')).toBe(true);
    expect(afterShabbatBeforeYomKippur.flags.has('viHiNoam')).toBe(false);
    expect(afterYomTovIntoCholHamoed.flags.has('motzaei')).toBe(true);
    expect(afterYomTovIntoCholHamoed.omerDay).toBe(1);
    expect(tishaBav.flags.has('motzaei')).toBe(false);
    expect(tishaBavAfterShabbat.flags.has('motzaeiShabbat')).toBe(true);
  });

  it('adds Ata Chonantanu, Vihi Noam and Ve’ata Kadosh after an ordinary Shabbat, with the full Kaddish after them', () => {
    for (const nusach of NUSCHAOT) {
      const said = saidOn(nusach, 'maariv', afterShabbat);
      expect(said).toMatch(/אתה חוננתנו/);
      expect(said).toMatch(viHiNoam);
      expect(said).toMatch(/ואתה קדוש/);
      expect(count(said, /תתקבל/)).toBe(1);
      expect(said.indexOf('תתקבל')).toBeGreaterThan(said.indexOf('ואתה קדוש'));

      const plain = saidOn(nusach, 'maariv', weeknight);
      expect(plain).not.toMatch(/אתה חוננתנו|ואתה קדוש/);
      expect(plain).not.toMatch(viHiNoam);
      expect(count(plain, /תתקבל/)).toBe(1);
    }
  });

  it('keeps Ata Chonantanu but drops Vihi Noam and Ve’ata Kadosh before a week with Yom Kippur', () => {
    for (const nusach of NUSCHAOT) {
      const said = saidOn(nusach, 'maariv', afterShabbatBeforeYomKippur);
      expect(said).toMatch(/אתה חוננתנו/);
      expect(said).not.toMatch(viHiNoam);
      expect(said).not.toMatch(/ואתה קדוש/);
      expect(count(said, /תתקבל/)).toBe(1);
    }
  });

  it('after Yom Tov into Chol HaMoed Pesach says Ata Chonantanu, the festival and the first omer count', () => {
    for (const nusach of NUSCHAOT) {
      const said = saidOn(nusach, 'maariv', afterYomTovIntoCholHamoed);
      expect(said).toMatch(/אתה חוננתנו/);
      expect(said).toMatch(/חג המצות הזה/);
      expect(said).not.toMatch(viHiNoam);
      expect(said).toMatch(/ספירת העמר/);
      expect(said).toMatch(/היום יום אחד/);
    }
  });

  it('counts only the night’s omer day, and counts nothing outside the omer', () => {
    const twentieth = day(5, months.IYYAR, 5786);
    expect(twentieth.omerDay).toBe(20);
    for (const nusach of NUSCHAOT) {
      const counted = resolveSiddurText(load(nusach, 'maariv'), twentieth)
        .flatMap((section) => section.segments)
        .filter((segment) => segment.when?.omerDay !== undefined);
      expect(counted.length).toBeGreaterThan(0);
      expect(counted.every((segment) => segment.when?.omerDay === 20)).toBe(true);
      expect(saidOn(nusach, 'maariv', weeknight)).not.toMatch(/ספירת העמר/);
    }
  });

  it('says Ve’ata Kadosh after Eichah on Tisha B’Av night, without Vihi Noam', () => {
    for (const nusach of NUSCHAOT) {
      for (const night of [tishaBav, tishaBavAfterShabbat]) {
        const shown = shownOn(nusach, 'maariv', night);
        expect(shown).toMatch(/איכה/);
        expect(shown).toMatch(/ואתה קדוש/);
        expect(shown).not.toMatch(viHiNoam);
        expect(shown.indexOf('איכה')).toBeLessThan(shown.indexOf('ואתה קדוש'));
      }
      expect(saidOn(nusach, 'maariv', tishaBavAfterShabbat)).toMatch(/אתה חוננתנו/);
      expect(saidOn(nusach, 'maariv', tishaBav)).not.toMatch(/אתה חוננתנו/);
    }
    for (const nusach of ['ashkenaz', 'sefard', 'chabad'] as const) {
      const said = saidOn(nusach, 'maariv', tishaBav);
      expect(count(said, /תתקבל/)).toBe(1);
      expect(said.indexOf('תתקבל')).toBeLessThan(said.indexOf('ואתה קדוש'));
    }
  });

  it('says the Ten Days changes on their nights', () => {
    const tenDays = day(5, months.TISHREI, 5787);
    for (const nusach of NUSCHAOT) {
      const said = saidOn(nusach, 'maariv', tenDays);
      expect(said).toMatch(/המלך הקדוש/);
      expect(said).toMatch(/המלך המשפט/);
      expect(said).not.toMatch(/האל הקדוש|מלך או?הב צדקה ומשפט/);
      expect(saidOn(nusach, 'maariv', weeknight)).not.toMatch(/המלך הקדוש|המלך המשפט/);
    }
  });

  it('adds what only one place says', () => {
    const blessedForever = /ברוך \S+ לעולם אמן ואמן/;
    expect(saidOn('ashkenaz', 'maariv', day(11, months.CHESHVAN, 5787, DIASPORA))).toMatch(blessedForever);
    expect(saidOn('ashkenaz', 'maariv', weeknight)).not.toMatch(blessedForever);
    expect(saidOn('sefard', 'maariv', weeknight)).toMatch(/שיר למעלות/);
    expect(saidOn('sefard', 'maariv', day(11, months.CHESHVAN, 5787, DIASPORA))).not.toMatch(/שיר למעלות/);
  });
});

describe('weekday shacharit', () => {
  const tuesday = day(9, months.CHESHVAN, 5787);
  const monday = day(8, months.CHESHVAN, 5787);
  const roshChodesh = day(1, months.CHESHVAN, 5787);
  const cholHamoedPesach = day(18, months.NISAN, 5786);
  const cholHamoedSukkot = day(18, months.TISHREI, 5787);
  const cholHamoedSukkotAbroad = day(17, months.TISHREI, 5787, DIASPORA);
  const chanukah = day(27, months.KISLEV, 5787);
  const purim = day(14, months.ADAR_II, 5787);
  const tishaBav = day(9, months.AV, 5786);
  const tzomGedaliah = day(3, months.TISHREI, 5787);
  const tammuzFast = day(17, months.TAMUZ, 5786);
  const tenDays = day(5, months.TISHREI, 5787);
  const erevYomKippur = day(9, months.TISHREI, 5787);
  const erevPesach = day(14, months.NISAN, 5786);
  const titles = (nusach: Nusach, features: DayFeatures) =>
    resolveSiddurText(load(nusach, 'shacharit'), features).map((section) => section.title.he);
  const avinuMalkeinu = /אבינו מלכנו חטאנו לפניך/;

  it('falls on the weekdays its fixtures claim', () => {
    const fixtures = [
      tuesday,
      monday,
      roshChodesh,
      cholHamoedPesach,
      cholHamoedSukkot,
      cholHamoedSukkotAbroad,
      chanukah,
      purim,
    ];
    for (const fixture of [...fixtures, tishaBav, tzomGedaliah, tammuzFast, tenDays, erevYomKippur, erevPesach]) {
      expect(fixture.flags.has('shabbat') || fixture.flags.has('yomTov') || fixture.flags.has('yomKippur')).toBe(false);
    }
    expect(tuesday.flags.has('tuesday')).toBe(true);
    expect(monday.flags.has('monday')).toBe(true);
    expect(erevYomKippur.flags.has('sunday')).toBe(true);
    expect([...cholHamoedSukkotAbroad.flags].filter((flag) => flag.startsWith('sukkotOffering'))).toEqual([
      'sukkotOffering2',
      'sukkotOffering3',
    ]);
  });

  it('says Tachanun on ordinary days only, and the long Monday and Thursday Tachanun on those days', () => {
    const longTachanun: Record<Nusach, RegExp> = {
      ashkenaz: /הבט משמים וראה/,
      sefard: /הבט משמים וראה/,
      edot_hamizrach: /אל מלך יושב על כסא רחמים/,
      chabad: /הבט משמים וראה/,
    };
    for (const nusach of NUSCHAOT) {
      expect(titles(nusach, tuesday)).toContain('תחנון');
      expect(titles(nusach, monday)).toContain('תחנון');
      for (const noTachanun of [roshChodesh, cholHamoedPesach, chanukah, purim, tishaBav, erevYomKippur, erevPesach]) {
        expect(titles(nusach, noTachanun)).not.toContain('תחנון');
      }
      expect(saidOn(nusach, 'shacharit', monday)).toMatch(longTachanun[nusach]);
      expect(saidOn(nusach, 'shacharit', tuesday)).not.toMatch(longTachanun[nusach]);
    }
  });

  it('reads the Torah only on its days, and says Musaf only on Rosh Chodesh and Chol HaMoed', () => {
    for (const nusach of NUSCHAOT) {
      expect(titles(nusach, tuesday)).not.toContain('קריאת התורה');
      for (const reading of [monday, roshChodesh, cholHamoedPesach, chanukah, purim, tishaBav, tzomGedaliah]) {
        expect(titles(nusach, reading)).toContain('קריאת התורה');
      }
      for (const withMusaf of [roshChodesh, cholHamoedPesach, cholHamoedSukkot])
        expect(titles(nusach, withMusaf)).toContain('מוסף');
      for (const withoutMusaf of [tuesday, monday, chanukah, purim])
        expect(titles(nusach, withoutMusaf)).not.toContain('מוסף');
    }
  });

  it('says whole Hallel on Chanukah and Chol HaMoed Sukkot, half Hallel on Rosh Chodesh and Chol HaMoed Pesach, and none on a plain day', () => {
    const notToUs = /לא לנו \S+ לא לנו/;
    const praiseServants = /הללו עבדי \S+ הללו את ?שם/;
    for (const nusach of NUSCHAOT) {
      for (const whole of [chanukah, cholHamoedSukkot]) {
        expect(saidOn(nusach, 'shacharit', whole)).toMatch(praiseServants);
        expect(saidOn(nusach, 'shacharit', whole)).toMatch(notToUs);
      }
      for (const half of [roshChodesh, cholHamoedPesach]) {
        expect(saidOn(nusach, 'shacharit', half)).toMatch(praiseServants);
        expect(saidOn(nusach, 'shacharit', half)).not.toMatch(notToUs);
      }
      expect(titles(nusach, tuesday)).not.toContain('הלל');
      expect(titles(nusach, purim)).not.toContain('הלל');
    }
    expect(saidOn('edot_hamizrach', 'shacharit', chanukah)).toMatch(/לגמור את ההלל/);
    expect(saidOn('edot_hamizrach', 'shacharit', roshChodesh)).not.toMatch(/לגמור את ההלל|לקרוא את ההלל/);
  });

  it('takes the lulav on Chol HaMoed Sukkot only', () => {
    for (const nusach of NUSCHAOT) {
      expect(saidOn(nusach, 'shacharit', cholHamoedSukkot)).toMatch(/על נטילת לולב/);
      expect(saidOn(nusach, 'shacharit', cholHamoedPesach)).not.toMatch(/על נטילת לולב/);
    }
  });

  it('names the day in Musaf, with the Sukkot offerings of the day and of the doubtful day abroad', () => {
    for (const nusach of NUSCHAOT) {
      expect(saidOn(nusach, 'shacharit', roshChodesh)).toMatch(/ראשי חדשים לעמך נתת/);
      expect(saidOn(nusach, 'shacharit', cholHamoedPesach)).toMatch(/מוסף יום \S*\s?חג המצות/);
      expect(saidOn(nusach, 'shacharit', cholHamoedSukkot)).toMatch(/מוסף יום \S*\s?חג הסכות/);
    }
    for (const nusach of ['ashkenaz', 'sefard', 'chabad'] as const) {
      const israel = saidOn(nusach, 'shacharit', cholHamoedSukkot);
      expect(israel).toMatch(/וביום הרביעי פרים/);
      expect(israel).not.toMatch(/וביום השלישי פרים|וביום החמישי פרים/);
      const abroad = saidOn(nusach, 'shacharit', cholHamoedSukkotAbroad);
      expect(abroad).toMatch(/וביום השני פרים/);
      expect(abroad).toMatch(/וביום השלישי פרים/);
      expect(abroad).not.toMatch(/וביום הרביעי פרים/);
    }
    for (const nusach of ['ashkenaz', 'sefard'] as const) {
      expect(saidOn(nusach, 'shacharit', roshChodesh)).toMatch(/ולכפרת פשע/);
      expect(saidOn(nusach, 'shacharit', day(1, months.IYYAR, 5786))).not.toMatch(/ולכפרת פשע/);
    }
  });

  it('says the Song of the Day of the weekday', () => {
    const tuesdaySong = /אלהים נצב בעדת ?אל/;
    const mondaySong = /גדול \S+ ומהלל מאד בעיר אלהינו/;
    for (const nusach of NUSCHAOT) {
      expect(saidOn(nusach, 'shacharit', tuesday)).toMatch(tuesdaySong);
      expect(saidOn(nusach, 'shacharit', tuesday)).not.toMatch(mondaySong);
      expect(saidOn(nusach, 'shacharit', monday)).toMatch(mondaySong);
      expect(saidOn(nusach, 'shacharit', monday)).not.toMatch(tuesdaySong);
    }
    expect(shownOn('edot_hamizrach', 'shacharit', tuesday)).toMatch(/השיר שהיו הלוים/);
    expect(shownOn('edot_hamizrach', 'shacharit', chanukah)).not.toMatch(/השיר שהיו הלוים/);
  });

  it('says Hoshienu after the Song of every day, though Edot HaMizrach and Sefard sources print it only after Friday’s', () => {
    const songOf = (nusach: Nusach, features: DayFeatures) =>
      letters(
        resolveSiddurText(load(nusach, 'shacharit'), features)
          .filter((section) => section.title.he === 'שיר של יום')
          .flatMap((section) =>
            section.segments
              .filter((segment) => !segment.minyan)
              .flatMap((segment) =>
                segment.he
                  .flat()
                  .filter((run) => run.s !== 'n')
                  .map((run) => run.t),
              ),
          )
          .join(' '),
      );
    const fridaySong = /\S+ מלך גאות לבש/;
    const hoshienu: Partial<Record<Nusach, RegExp>> = {
      edot_hamizrach: /הושיענו \S+ אלהינו וקבצנו מן ?הגוים .* אמן ואמן$/,
      sefard: /הושיענו \S+ אלהינו וקבצנו מן ?הגוים .* אמן ואמן$/,
      chabad: /הושיענו \S+ אלהינו וקבצנו מן ?הגוים/,
    };
    for (const [nusach, pattern] of Object.entries(hoshienu) as [Nusach, RegExp][]) {
      for (let date = 7; date <= 12; date++) {
        const song = songOf(nusach, day(date, months.CHESHVAN, 5787));
        expect(song).toMatch(pattern);
        expect(song.match(fridaySong) !== null).toBe(date === 12);
      }
      expect(songOf(nusach, roshChodesh)).toMatch(pattern);
    }
    expect(shownOn('edot_hamizrach', 'shacharit', tuesday)).not.toMatch(/וממשיך הושיענו/);
    expect(shownOn('sefard', 'shacharit', tuesday)).not.toMatch(/הושיענו וכו/);
  });

  it('follows the order and days the user chose where sources disagree', () => {
    const sefardMonday = titles('sefard', monday);
    expect(sefardMonday.indexOf('הכנסת ספר התורה')).toBeGreaterThan(sefardMonday.indexOf('אשרי ובא לציון'));
    expect(sefardMonday.indexOf('הכנסת ספר התורה')).toBeLessThan(sefardMonday.indexOf('קדיש'));
    const tenDaysMincha = resolveSiddurText(load('sefard', 'mincha'), day(5, months.TISHREI, 5787)).map(
      (section) => section.title.he,
    );
    expect(tenDaysMincha.indexOf('תחנון')).toBeLessThan(tenDaysMincha.indexOf('אבינו מלכנו'));
    expect(tenDaysMincha.indexOf('אבינו מלכנו')).toBeLessThan(tenDaysMincha.indexOf('סיום התחנון'));
    const threeFastsAneinu = /סנסן ליאיר/;
    expect(shownOn('edot_hamizrach', 'shacharit', tzomGedaliah)).toMatch(threeFastsAneinu);
    expect(shownOn('edot_hamizrach', 'mincha', tammuzFast)).toMatch(threeFastsAneinu);
    expect(shownOn('edot_hamizrach', 'shacharit', day(13, months.ADAR_II, 5787))).not.toMatch(threeFastsAneinu);
    expect(shownOn('edot_hamizrach', 'mincha', tishaBav)).not.toMatch(threeFastsAneinu);
  });

  it('says Avinu Malkeinu in the Ten Days on days with Tachanun, and on fasts where the nusach does', () => {
    for (const nusach of NUSCHAOT) {
      expect(saidOn(nusach, 'shacharit', tenDays)).toMatch(avinuMalkeinu);
      expect(saidOn(nusach, 'shacharit', tzomGedaliah)).toMatch(avinuMalkeinu);
      expect(saidOn(nusach, 'shacharit', erevYomKippur)).not.toMatch(avinuMalkeinu);
      expect(saidOn(nusach, 'shacharit', tuesday)).not.toMatch(avinuMalkeinu);
    }
    for (const nusach of ['ashkenaz', 'sefard', 'chabad'] as const)
      expect(saidOn(nusach, 'shacharit', tammuzFast)).toMatch(avinuMalkeinu);
    expect(saidOn('edot_hamizrach', 'shacharit', tammuzFast)).not.toMatch(avinuMalkeinu);
  });

  it('skips Lamnatzeach on the days the nusach does', () => {
    const lamnatzeach = /יענך \S+ ביום צרה/;
    for (const nusach of NUSCHAOT) {
      expect(saidOn(nusach, 'shacharit', tuesday)).toMatch(lamnatzeach);
      for (const without of [roshChodesh, chanukah, purim, erevYomKippur, tishaBav]) {
        expect(saidOn(nusach, 'shacharit', without)).not.toMatch(lamnatzeach);
      }
    }
  });

  it('drops the covenant verse and Titkabel on Tisha B’Av', () => {
    for (const nusach of NUSCHAOT) {
      const fast = saidOn(nusach, 'shacharit', tishaBav);
      expect(fast).not.toMatch(/ואני זאת בריתי/);
      expect(fast).not.toMatch(/תתקבל/);
      const plain = saidOn(nusach, 'shacharit', tuesday);
      expect(plain).toMatch(/ואני זאת בריתי/);
      expect(plain).toMatch(/תתקבל/);
    }
  });

  it('says Mizmor LeToda except on erev Pesach and Chol HaMoed Pesach', () => {
    for (const nusach of NUSCHAOT) {
      expect(saidOn(nusach, 'shacharit', tuesday)).toMatch(/מזמור לתודה/);
      expect(saidOn(nusach, 'shacharit', erevPesach)).not.toMatch(/מזמור לתודה/);
      expect(saidOn(nusach, 'shacharit', cholHamoedPesach)).not.toMatch(/מזמור לתודה/);
    }
  });

  it('marks where Edot HaMizrach reads the Megillah on Purim', () => {
    expect(shownOn('edot_hamizrach', 'shacharit', purim)).toMatch(/בפורים קוראים כאן את המגילה/);
    expect(shownOn('edot_hamizrach', 'shacharit', tuesday)).not.toMatch(/בפורים קוראים כאן את המגילה/);
  });
});

describe('tallit and tefillin in shacharit', () => {
  const TITLE = 'עטיפת טלית והנחת תפילין';
  const weekday = day(9, months.CHESHVAN, 5787);
  const weekdayAbroad = day(9, months.CHESHVAN, 5787, DIASPORA);
  const tishaBav = day(9, months.AV, 5786);
  const cholHamoedPesach = day(18, months.NISAN, 5786);
  const cholHamoedPesachAbroad = day(18, months.NISAN, 5786, DIASPORA);
  const cholHamoedSukkot = day(18, months.TISHREI, 5787);
  const cholHamoedSukkotAbroad = day(17, months.TISHREI, 5787, DIASPORA);
  const TALLIT = /וצונו להתעטף בציצית/;
  const TEFILLIN_HAND = /וצונו להניח תפלין/;
  const TEFILLIN_HEAD = /וצונו על מצות תפלין/;
  const BARUCH_SHEM = /ברוך שם כבוד מלכותו לעולם ועד/;
  const TALLIT_KATAN_NOTE = 'הלובש טלית קטן בלי טלית גדול מברך';
  const TALLIT_KATAN_NOTE_EN = 'One who wears a tallit katan without a tallit gadol says:';
  const TALLIT_KATAN_BLESSING = /וצונו על מצות ציצי?ת/;
  const TALLIT_KATAN_SAID_SEGMENTS = { ashkenaz: 2, sefard: 2, chabad: 1 } as const;
  const KATAN_NUSCHAOT = ['ashkenaz', 'sefard', 'chabad'] as const;
  const ASHKENAZ_NOTE = /בחול המועד המניחים תפילין מברכים בלחש/;
  const section = (nusach: Nusach, features: DayFeatures) =>
    resolveSiddurText(load(nusach, 'shacharit'), features).find((candidate) => candidate.title.he === TITLE);
  const wording = (nusach: Nusach, features: DayFeatures, keep: (run: Run) => boolean) =>
    letters(
      (section(nusach, features)?.segments ?? [])
        .flatMap((segment) => segment.he.flat().filter(keep))
        .map((run) => run.t)
        .join(' '),
    );
  const saidIn = (nusach: Nusach, features: DayFeatures) => wording(nusach, features, (run) => run.s !== 'n');
  const shownIn = (nusach: Nusach, features: DayFeatures) => wording(nusach, features, () => true);
  const neighbours = (nusach: Nusach, features: DayFeatures) => {
    const titles = resolveSiddurText(load(nusach, 'shacharit'), features).map((candidate) => candidate.title.he);
    const at = titles.indexOf(TITLE);
    return { titles, before: titles[at - 1], after: titles[at + 1] };
  };

  it('falls on the days its fixtures claim', () => {
    for (const fixture of [weekday, weekdayAbroad, tishaBav, cholHamoedPesach, cholHamoedSukkot]) {
      expect(fixture.flags.has('shabbat') || fixture.flags.has('yomTov') || fixture.flags.has('yomKippur')).toBe(false);
    }
    expect(tishaBav.flags.has('tishaBav')).toBe(true);
    for (const fixture of [cholHamoedPesach, cholHamoedPesachAbroad]) {
      expect(fixture.flags.has('cholHamoedPesach')).toBe(true);
    }
    for (const fixture of [cholHamoedSukkot, cholHamoedSukkotAbroad]) {
      expect(fixture.flags.has('cholHamoedSukkot')).toBe(true);
    }
    expect(cholHamoedPesach.flags.has('inIsrael')).toBe(true);
    expect(cholHamoedPesachAbroad.flags.has('inIsrael')).toBe(false);
    expect(cholHamoedSukkotAbroad.flags.has('inIsrael')).toBe(false);
  });

  it('puts the tallit blessing and both tefillin blessings in every nusach, ahead of the Korbanot', () => {
    for (const nusach of NUSCHAOT) {
      for (const features of [weekday, weekdayAbroad]) {
        const said = saidIn(nusach, features);
        expect(said).toMatch(TALLIT);
        expect(said).toMatch(TEFILLIN_HAND);
        expect(said).toMatch(TEFILLIN_HEAD);
        const { titles } = neighbours(nusach, features);
        expect(titles.filter((title) => title === TITLE)).toHaveLength(1);
        expect(titles.indexOf(TITLE)).toBeLessThan(titles.indexOf('קרבנות'));
        expect(titles.indexOf(TITLE)).toBeLessThan(titles.indexOf('פסוקי דזמרה'));
      }
    }
  });

  it('says Baruch Shem after the head tefillin where the nusach prints it', () => {
    for (const nusach of ['ashkenaz', 'sefard'] as const) expect(saidIn(nusach, weekday)).toMatch(BARUCH_SHEM);
    for (const nusach of ['edot_hamizrach', 'chabad'] as const)
      expect(saidIn(nusach, weekday)).not.toMatch(BARUCH_SHEM);
  });

  it('places the section where each nusach prints it', () => {
    expect(neighbours('ashkenaz', weekday)).toMatchObject({ before: 'ברכות התורה', after: 'מה טובו' });
    expect(neighbours('sefard', weekday)).toMatchObject({ before: 'ברכות התורה', after: 'מה טובו' });
    expect(neighbours('edot_hamizrach', weekday)).toMatchObject({ before: 'פתח אליהו', after: 'תפילת חנה' });
    expect(neighbours('chabad', weekday)).toMatchObject({ before: 'ברכות התורה', after: 'מה טובו' });
  });

  it('leaves both out on Tisha B’Av', () => {
    for (const nusach of NUSCHAOT) {
      expect(neighbours(nusach, tishaBav).titles).not.toContain(TITLE);
      expect(neighbours(nusach, weekday).titles).toContain(TITLE);
    }
  });

  it('drops the tefillin on Chol HaMoed where keepsCholHamoed() does, and keeps the tallit', () => {
    const places = [
      { features: cholHamoedPesach, inIsrael: true },
      { features: cholHamoedSukkot, inIsrael: true },
      { features: cholHamoedPesachAbroad, inIsrael: false },
      { features: cholHamoedSukkotAbroad, inIsrael: false },
    ];
    for (const nusach of NUSCHAOT) {
      for (const { features, inIsrael } of places) {
        const said = saidIn(nusach, features);
        const keeps = keepsCholHamoed({ nusach, inIsrael });
        expect(said).toMatch(TALLIT);
        expect({ nusach, inIsrael, hand: TEFILLIN_HAND.test(said), head: TEFILLIN_HEAD.test(said) }).toEqual({
          nusach,
          inIsrael,
          hand: keeps,
          head: keeps,
        });
      }
    }
    expect(keepsCholHamoed({ nusach: 'ashkenaz', inIsrael: false })).toBe(true);
    expect(keepsCholHamoed({ nusach: 'ashkenaz', inIsrael: true })).toBe(false);
    expect(keepsCholHamoed({ nusach: 'sefard', inIsrael: false })).toBe(false);
  });

  it('shows Ashkenaz abroad its tefillin once, with the quiet-blessing note on Chol HaMoed only', () => {
    for (const features of [weekday, weekdayAbroad, cholHamoedPesachAbroad, cholHamoedSukkotAbroad]) {
      expect(count(saidIn('ashkenaz', features), TEFILLIN_HAND)).toBe(1);
      expect(count(saidIn('ashkenaz', features), TEFILLIN_HEAD)).toBe(1);
    }
    for (const features of [cholHamoedPesachAbroad, cholHamoedSukkotAbroad]) {
      expect(shownIn('ashkenaz', features)).toMatch(ASHKENAZ_NOTE);
    }
    for (const features of [weekday, weekdayAbroad, cholHamoedPesach, cholHamoedSukkot, tishaBav]) {
      expect(shownIn('ashkenaz', features)).not.toMatch(ASHKENAZ_NOTE);
    }
  });

  it('reads the same tefillin passages as the standalone tefillin text, after the tallit', () => {
    const standalone = (nusach: Nusach) =>
      letters(
        resolveSiddurText(load(nusach, 'tefillin'), weekdayAbroad)
          .filter((candidate) => candidate.title.he === 'הנחת תפילין')
          .flatMap((candidate) => candidate.segments)
          .filter((segment) => segment.he.flat().some((run) => run.s !== 'n'))
          .slice(nusach === 'edot_hamizrach' ? 0 : TALLIT_KATAN_SAID_SEGMENTS[nusach])
          .flatMap((segment) => segment.he.flat())
          .filter((run) => run.s !== 'n')
          .map((run) => run.t)
          .join(' '),
      );
    for (const nusach of NUSCHAOT) {
      const inShacharit = saidIn(nusach, weekdayAbroad);
      const tefillin = standalone(nusach);
      expect(tefillin.length).toBeGreaterThan(0);
      expect(inShacharit.endsWith(tefillin)).toBe(true);
      expect(inShacharit.slice(0, inShacharit.length - tefillin.length)).toMatch(TALLIT);
    }
  });

  const noteIn = (segment: SiddurSegment) =>
    letters(
      segment.he
        .flat()
        .map((run) => run.t)
        .join(' '),
    );
  const expectNoteThenBlessing = (segments: SiddurSegment[], nusach: (typeof KATAN_NUSCHAOT)[number]) => {
    const [note, blessing] = segments;
    expect(note.he.flat().every((run) => run.s === 'n')).toBe(true);
    expect(noteIn(note)).toBe(TALLIT_KATAN_NOTE);
    expect(note.en).toBe(TALLIT_KATAN_NOTE_EN);
    expect(blessing.he.flat().some((run) => run.s !== 'n')).toBe(true);
    expect(noteIn(blessing)).toMatch(TALLIT_KATAN_BLESSING);
    for (const segment of segments.slice(0, TALLIT_KATAN_SAID_SEGMENTS[nusach] + 1)) {
      expect(segment.optional).toBeUndefined();
      expect(segment.minyan).toBeUndefined();
    }
  };

  it('opens the standalone tefillin text with the tallit katan blessing unfolded under a line naming who says it, where a source prints it', () => {
    for (const features of [weekday, weekdayAbroad, cholHamoedPesachAbroad]) {
      for (const nusach of KATAN_NUSCHAOT) {
        const [first] = resolveSiddurText(load(nusach, 'tefillin'), features);
        expect(first.title.he).toBe('הנחת תפילין');
        expectNoteThenBlessing(first.segments, nusach);
        expect(first.segments.filter((segment) => TALLIT_KATAN_BLESSING.test(noteIn(segment)))).toHaveLength(1);
        for (const mode of ['minyan', 'alone'] as const) {
          const [opening] = aloneFolds(first, mode).blocks;
          expect(opening.start).toBe(0);
          expect(opening.label).toBeUndefined();
          expect(opening.segments.length).toBeGreaterThan(TALLIT_KATAN_SAID_SEGMENTS[nusach]);
        }
      }
      const edot = resolveSiddurText(load('edot_hamizrach', 'tefillin'), features).flatMap(
        (section) => section.segments,
      );
      expect(edot.map(noteIn).join(' ')).not.toMatch(/טלית קטן/);
      expect(edot.map(noteIn).join(' ')).not.toMatch(TALLIT_KATAN_BLESSING);
    }
  });

  it('folds nothing under the old tallit katan label anywhere in the tefillin or Shacharit texts', () => {
    for (const nusach of NUSCHAOT) {
      for (const id of ['tefillin', 'shacharit'] as const) {
        const labels = load(nusach, id).sections.flatMap((candidate) =>
          candidate.segments.map((segment) => segment.optional?.he ?? ''),
        );
        expect(labels.filter((label) => /טלית קטן/.test(label))).toEqual([]);
      }
    }
  });

  it('says the tallit katan blessing in Shacharit, unfolded and ahead of the tallit gadol blessing, in Ashkenaz, Sefard and Chabad only', () => {
    for (const features of [weekday, weekdayAbroad, cholHamoedPesach, cholHamoedPesachAbroad]) {
      for (const nusach of KATAN_NUSCHAOT) {
        const segments = section(nusach, features)?.segments ?? [];
        expectNoteThenBlessing(segments, nusach);
        const said = saidIn(nusach, features);
        expect(count(said, TALLIT_KATAN_BLESSING)).toBe(1);
        expect(said.search(TALLIT_KATAN_BLESSING)).toBeLessThan(said.search(TALLIT));
        expect(shownIn(nusach, features)).toContain(TALLIT_KATAN_NOTE);
      }
      expect(shownIn('edot_hamizrach', features)).not.toMatch(/טלית קטן/);
      expect(saidIn('edot_hamizrach', features)).not.toMatch(TALLIT_KATAN_BLESSING);
    }
  });

  it('leaves the tallit katan blessing out of Shacharit on Tisha B’Av with the rest of the section', () => {
    for (const nusach of NUSCHAOT) {
      expect(neighbours(nusach, tishaBav).titles).not.toContain(TITLE);
      expect(shownOn(nusach, 'shacharit', tishaBav)).not.toMatch(/טלית קטן/);
      expect(saidOn(nusach, 'shacharit', tishaBav)).not.toMatch(TALLIT_KATAN_BLESSING);
    }
  });

  describe('Kriat Shema at the end of the standalone tefillin text', () => {
    const SHEMA_TITLE = 'קריאת שמע';
    const ALONE_LABEL = 'המתפלל ביחיד אומר';
    const shemaSection = (nusach: Nusach, features: DayFeatures) =>
      resolveSiddurText(load(nusach, 'tefillin'), features).find((candidate) => candidate.title.he === SHEMA_TITLE)!;
    const shemaWords = (nusach: Nusach, features: DayFeatures) =>
      letters(
        shemaSection(nusach, features)
          .segments.flatMap((segment) => segment.he.flat())
          .filter((run) => run.s !== 'n')
          .map((run) => run.t)
          .join(' '),
      );

    it('ends every nusach’s sections with the tefillin and the Shema, Rabbeinu Tam last in Chabad', () => {
      for (const nusach of NUSCHAOT) {
        const titles = (features?: DayFeatures) =>
          (features ? resolveSiddurText(load(nusach, 'tefillin'), features) : load(nusach, 'tefillin').sections).map(
            (candidate) => candidate.title.he,
          );
        const expected =
          nusach === 'chabad' ? ['הנחת תפילין', SHEMA_TITLE, 'תפילין דרבנו תם'] : ['הנחת תפילין', SHEMA_TITLE];
        expect(titles()).toEqual(expected);
        expect(titles(weekday)).toEqual(expected);
        expect(titles(weekdayAbroad)).toEqual(expected);
      }
    });

    it('says all three paragraphs after the first verse and the whispered line, in every nusach', () => {
      for (const nusach of NUSCHAOT) {
        for (const features of [weekday, weekdayAbroad]) {
          const said = shemaWords(nusach, features);
          expect(said).toMatch(/שמע ישראל \S+ אלהינו \S+ (\| )?אחד/);
          expect(said).toMatch(/ברוך שם כבוד מלכותו לעולם ועד/);
          expect(said).toMatch(/ואהבת את \S+ אלהיך בכל לבבך/);
          expect(said).toMatch(/והיה אם שמע תשמעו אל מצותי/);
          expect(said).toMatch(/ויאמר \S+ אל משה לאמר/);
          expect(said.indexOf('שמע ישראל')).toBeLessThan(said.indexOf('ואהבת'));
          expect(said.indexOf('ואהבת')).toBeLessThan(said.indexOf('והיה אם שמע'));
          expect(said.indexOf('והיה אם שמע')).toBeLessThan(said.indexOf('ויאמר'));
        }
      }
    });

    it('stops at the third paragraph, leaving out Emet and the chazzan’s repetition, except where the source ends it with Emet', () => {
      for (const nusach of ['ashkenaz', 'sefard', 'chabad'] as const) {
        expect(shemaWords(nusach, weekday)).toMatch(/אני \S+ אלהיכם$/);
      }
      expect(shemaWords('edot_hamizrach', weekday)).toMatch(/אני \S+ אלהיכם אמת$/);
      for (const nusach of NUSCHAOT) {
        expect(shemaWords(nusach, weekday)).not.toMatch(/ויציב|אמת ויציב|וחוזר החזן/);
      }
    });

    it('folds “El Melech Ne’eman” for one who prays with a minyan in Ashkenaz and Sefard only, and labels no minyan passage anywhere', () => {
      for (const nusach of ['ashkenaz', 'sefard'] as const) {
        const [first, ...rest] = shemaSection(nusach, weekday).segments;
        expect(first.optional).toMatchObject({ he: ALONE_LABEL, alone: true });
        expect(
          letters(
            first.he
              .flat()
              .map((run) => run.t)
              .join(' '),
          ),
        ).toBe('אל מלך נאמן');
        expect(rest.some((segment) => segment.optional)).toBe(false);
      }
      for (const nusach of ['edot_hamizrach', 'chabad'] as const) {
        expect(shemaSection(nusach, weekday).segments.some((segment) => segment.optional)).toBe(false);
        expect(shemaWords(nusach, weekday)).not.toMatch(/אל מלך נאמן/);
      }
      for (const nusach of NUSCHAOT) {
        const resolved = resolveSiddurText(load(nusach, 'tefillin'), weekday);
        expect(resolved.some((candidate) => candidate.minyanOnly)).toBe(false);
        expect(resolved.some((candidate) => candidate.segments.some((segment) => segment.minyan))).toBe(false);
      }
    });

    it('reads the same three paragraphs as the standalone Shema of Shacharit', () => {
      const wordsBetween = (text: string, from: string) => text.slice(text.indexOf(from));
      for (const nusach of NUSCHAOT) {
        const shacharit = letters(
          resolveSiddurText(load(nusach, 'krias_shma_shacharit'), weekday)
            .flatMap((candidate) => candidate.segments)
            .flatMap((segment) => segment.he.flat())
            .filter((run) => run.s !== 'n')
            .map((run) => run.t)
            .join(' '),
        );
        const paragraphs = wordsBetween(shemaWords(nusach, weekday), 'ואהבת');
        expect(paragraphs.length).toBeGreaterThan(200);
        expect(wordsBetween(shacharit, 'ואהבת').startsWith(paragraphs)).toBe(true);
      }
    });
  });
});

describe('passages only some say', () => {
  const weekday = day(9, months.CHESHVAN, 5787);
  const roshChodesh = day(1, months.CHESHVAN, 5787);
  const yomHaatzmaut = day(5, months.IYYAR, 5786);
  const tishaBav = day(9, months.AV, 5786);
  const sections = (nusach: Nusach, id: SiddurTextId, features: DayFeatures) =>
    resolveSiddurText(load(nusach, id), features);
  const foldedSections = (nusach: Nusach, id: SiddurTextId, features: DayFeatures) =>
    sections(nusach, id, features)
      .filter((section) => section.optional)
      .map((section) => section.title.he);
  const blocksOf = (nusach: Nusach, id: SiddurTextId, features: DayFeatures, title: string) =>
    segmentBlocks(
      sections(nusach, id, features).find((section) => section.title.he === title)!.segments,
      'optional',
    ).map((block) => ({
      label: block.label?.he ?? null,
      text: letters(block.segments.flatMap((segment) => segment.he.flat().map((run) => run.t)).join(' ')),
    }));
  const blockAround = (blocks: ReturnType<typeof blocksOf>, label: string) => {
    const index = blocks.findIndex((block) => block.label === label);
    expect(index).toBeGreaterThan(0);
    return { before: blocks[index - 1], folded: blocks[index], after: blocks[index + 1] };
  };

  it('falls on the days its fixtures claim', () => {
    expect(yomHaatzmaut.flags.has('hallelDisputed')).toBe(true);
    expect(roshChodesh.flags.has('hallelHalf')).toBe(true);
    expect(tishaBav.flags.has('tishaBav')).toBe(true);
  });

  it('folds Hallel only on the days some communities say it, and still carries its text', () => {
    for (const nusach of NUSCHAOT) {
      expect(foldedSections(nusach, 'shacharit', yomHaatzmaut)).toContain('הלל');
      expect(saidOn(nusach, 'shacharit', yomHaatzmaut)).toMatch(/הללו עבדי \S+ הללו את ?שם/);
      expect(sections(nusach, 'shacharit', roshChodesh).map((section) => section.title.he)).toContain('הלל');
      expect(foldedSections(nusach, 'shacharit', roshChodesh)).not.toContain('הלל');
    }
  });

  it('folds what only Israel’s congregations add, and shows nothing of it abroad', () => {
    const abroad = day(9, months.CHESHVAN, 5787, DIASPORA);
    expect(foldedSections('ashkenaz', 'shacharit', weekday)).toEqual(['בבית האבל', 'אין כאלהינו']);
    expect(sections('ashkenaz', 'shacharit', abroad).map((section) => section.title.he)).not.toContain('אין כאלהינו');
    expect(foldedSections('sefard', 'maariv', weekday)).toEqual(['שיר למעלות']);
    expect(sections('sefard', 'maariv', abroad).map((section) => section.title.he)).not.toContain('שיר למעלות');
  });

  it('folds the prayer for the sick inside Refaeinu, keeping the blessing itself said', () => {
    for (const [nusach, id] of [
      ['ashkenaz', 'shacharit'],
      ['ashkenaz', 'mincha'],
      ['sefard', 'shacharit'],
    ] as const) {
      const { before, folded, after } = blockAround(
        blocksOf(nusach, id, weekday, 'תפילת העמידה'),
        'מי שרוצה מתפלל כאן על חולה',
      );
      expect(before.label).toBeNull();
      expect(before.text).toMatch(/רפאנו \S+ ונרפא/);
      expect(folded.text).toMatch(/^יהי רצון .* רפואה שלמה מן השמים/);
      expect(after.label).toBeNull();
      expect(after.text).toMatch(/^כי אל מלך רופא נאמן ורחמן אתה ברוך אתה \S+ רופא חולי עמו ישראל/);
    }
  });

  it('folds the Sefard Shacharit prayer for sustenance without its instruction, keeping the Shema Koleinu chatimah said', () => {
    const { before, folded, after } = blockAround(
      blocksOf('sefard', 'shacharit', weekday, 'תפילת העמידה'),
      'יש מוסיפים תפילה על הפרנסה',
    );
    expect(before.label).toBeNull();
    expect(before.text).toMatch(/אב הרחמן שמע קולנו .* חננו ועננו ושמע תפלתנו$/);
    expect(folded.text).toMatch(/^אתה הוא \S+ האלהים הזן ומפרנס .* והוא יכלכך$/);
    expect(shownOn('sefard', 'shacharit', weekday)).not.toMatch(/תפלה שיתפלל על מזונו/);
    expect(folded.text).not.toMatch(/כי אתה שומע/);
    expect(after.label).toBeNull();
    expect(after.text).toMatch(/^כי אתה שומע תפלת כל פה עמך ישראל ברחמים ברוך אתה \S+ שומע תפלה/);
  });

  it('shows the Sefard chatimah of Shema Koleinu outside any fold, with its own English, in every weekday service', () => {
    for (const id of ['shacharit', 'mincha', 'maariv'] as const) {
      const segments = sections('sefard', id, weekday).flatMap((section) => section.segments);
      const holding = segments.filter((segment) =>
        letters(
          segment.he
            .flat()
            .map((run) => run.t)
            .join(' '),
        ).includes('כי אתה שומע תפלת כל פה'),
      );
      expect(holding).toHaveLength(1);
      expect(holding[0].optional).toBeUndefined();
      expect(holding[0].en).toMatch(
        /for You hear the prayers of every mouth of Your people, Israel, with compassion\. Blessed are You, Adonoy, Who hears prayers\.$/,
      );
    }
    const shacharit = sections('sefard', 'shacharit', weekday).flatMap((section) => section.segments);
    const prayer = shacharit.filter((segment) =>
      letters(
        segment.he
          .flat()
          .map((run) => run.t)
          .join(' '),
      ).includes('הזן ומפרנס'),
    );
    expect(prayer).toHaveLength(1);
    expect(prayer[0].optional?.he).toBe('יש מוסיפים תפילה על הפרנסה');
    expect(prayer[0].en).toBeUndefined();
  });

  it('folds Rav’s prayer after Yihyu LeRatzon in Edot HaMizrach, keeping Yihyu LeRatzon and Oseh Shalom said', () => {
    for (const id of ['shacharit', 'mincha', 'maariv'] as const) {
      const { before, folded } = blockAround(
        blocksOf('edot_hamizrach', id, weekday, 'תפילת העמידה'),
        'יש אומרים תפילת רב',
      );
      expect(before.text).toMatch(/יהיו לרצון אמרי ?פי והגיון לבי לפניך \S+ צורי וגאלי$/);
      expect(folded.text).toMatch(/^יהי רצון מלפניך \S+ אלהינו ואלהי אבותינו שתתן לנו חיים ארו?כים/);
      expect(folded.text).not.toMatch(/יש אומרים|עשה שלום/);
    }
    expect(saidOn('edot_hamizrach', 'shacharit', weekday)).toMatch(/עשה שלום במרומיו/);
  });

  it('keeps the long Edot HaMizrach Leshem Yichud before the omer, folding the short one with its own English', () => {
    for (const [id, features] of [
      ['sefirat_haomer', dayFeatures(new HDate(20, months.NISAN, 5786), ISRAEL)],
      ['maariv', dayFeatures(new HDate(20, months.NISAN, 5786), ISRAEL)],
    ] as const) {
      const omer = sections('edot_hamizrach', id, features).find((section) => section.title.he === 'ספירת העומר')!;
      const [long, short] = omer.segments;
      expect(long.optional).toBeUndefined();
      expect(
        letters(
          long.he
            .flat()
            .map((run) => run.t)
            .join(' '),
        ),
      ).toMatch(/^לשם יחוד .* ובשם כל ?הנפשות/);
      expect(long.en).toBeUndefined();
      expect(short.optional?.he).toBe('יש אומרים לשם יחוד בנוסח קצר');
      expect(
        letters(
          short.he
            .flat()
            .map((run) => run.t)
            .join(' '),
        ),
      ).toMatch(/^לשם יחוד .* הנה אנחנו באים לקים מצות עשה של ספירת העמר/);
      expect(short.en).toMatch(/behold we come to observe the Mitzvah of counting the Omer/);
    }
  });

  it('folds Aneinu on the night of Tisha B’Av in Edot HaMizrach, and shows it on no other night', () => {
    const { folded, after } = blockAround(
      blocksOf('edot_hamizrach', 'maariv', tishaBav, 'תפילת העמידה'),
      'בתשעה באב יש אומרים עננו',
    );
    expect(count(folded.text, /עננו אבינו עננו/)).toBe(1);
    expect(folded.text).not.toMatch(/סנסן/);
    expect(after.text).toMatch(/^כי אתה שומע תפלת כל ?פה/);
    expect(saidOn('edot_hamizrach', 'maariv', weekday)).not.toMatch(/עננו אבינו עננו/);
  });

  it('folds what is said only in a circumstance the date cannot tell', () => {
    const labelOf = (nusach: Nusach, id: SiddurTextId, features: DayFeatures, said: RegExp) => {
      const found = sections(nusach, id, features)
        .flatMap((section) => section.segments.map((segment) => ({ section, segment })))
        .find(({ segment }) =>
          said.test(
            letters(
              segment.he
                .flat()
                .filter((run) => run.s !== 'n')
                .map((run) => run.t)
                .join(' '),
            ),
          ),
        );
      expect(found).toBeDefined();
      return found!.segment.optional?.he ?? found!.section.optional?.he ?? null;
    };
    const monday = day(8, months.CHESHVAN, 5787);
    for (const nusach of ['edot_hamizrach', 'ashkenaz', 'sefard'] as const) {
      expect(labelOf(nusach, 'shacharit', monday, /^למנצח לבני ?קרח מזמור שמעו ?זאת/)).toBe('בבית האבל אומרים');
    }
    expect(labelOf('sefard', 'mincha', monday, /^למנצח לבני ?קרח מזמור שמעו ?זאת/)).toBe('בבית האבל אומרים');
    for (const nusach of NUSCHAOT) {
      expect(labelOf(nusach, 'shacharit', monday, /הגומל לחיבים טובות/)).toBe('מי שחייב להודות מברך הגומל');
    }
    for (const nusach of ['edot_hamizrach', 'chabad'] as const) {
      expect(labelOf(nusach, 'tefillin', weekday, /וצונו להניח תפלין/)).toBeNull();
      expect(labelOf(nusach, 'tefillin', weekday, /וצונו על מצות תפלין/)).toBe(
        'אם הפסיק בין תפילין של יד לתפילין של ראש',
      );
    }
    for (const nusach of ['ashkenaz', 'sefard'] as const) {
      expect(labelOf(nusach, 'birchot_hashachar', weekday, /שעשני כרצונו/)).toBe('נשים אומרות');
      expect(labelOf(nusach, 'krias_shma_shacharit', weekday, /^אל מלך נאמן/)).toBe('המתפלל ביחיד אומר');
      expect(labelOf(nusach, 'krias_shma_shacharit', weekday, /^שמע ישראל/)).toBeNull();
    }
    expect(labelOf('ashkenaz', 'shacharit', monday, /^אשמנו בגדנו/)).toBe('יש נוהגים לומר וידוי וי״ג מידות');
    expect(labelOf('ashkenaz', 'mincha', monday, /^אשמנו בגדנו/)).toBe('יש נוהגים לומר וידוי וי״ג מידות');
    expect(labelOf('edot_hamizrach', 'shacharit', monday, /^לדוד \S+ אורי וישעי/)).toBe(
      'יש נוהגים לומר "לדוד ה׳ אורי"',
    );
    const privateFastPrayer = /^רבון העולמים גלוי לפניך בזמן שבית המקדש קים/;
    expect(labelOf('edot_hamizrach', 'mincha', weekday, privateFastPrayer)).toBe('ביום תענית אומרים');
    expect(labelOf('edot_hamizrach', 'mincha', day(10, months.TEVET, 5787), privateFastPrayer)).toBeNull();
  });

  it('keeps every passage the source marks as said by only some behind a label', () => {
    const someSay = /(^|[\s(])(ו?יש\s+(ה?נוהגי[םן]|אומרים|שמוסיפים)|ה?רוצה\s+ל|מי\s+שרוצה)/;
    const notAPassage = [
      /^אין אומרים אאא/,
      /^בערב שבת אין אומרים למנצח/,
      /^בעשרת ימי תשובה יש נוהגים לחתום/,
      /^דרש ר שמלאי/,
      /^יש נוהגים שלא לומר למנצח/,
      /^כשנופל על פניו/,
      /^מה שאנו אומרין הקדיש/,
    ];
    const unfolded: string[] = [];
    for (const nusach of NUSCHAOT) {
      for (const id of TEXT_IDS) {
        for (const section of load(nusach, id).sections) {
          for (const segment of section.segments) {
            if (section.optional || segment.optional) continue;
            for (const run of segment.he.flat()) {
              const note = letters(run.t).trim();
              if (run.s === 'n' && someSay.test(note) && !notAPassage.some((known) => known.test(note))) {
                unfolded.push(`${nusach}/${id}: ${note.slice(0, 60)}`);
              }
            }
          }
        }
      }
    }
    expect(unfolded).toEqual([]);
  });
});

describe('passages said only with a minyan', () => {
  const weekday = day(9, months.CHESHVAN, 5787);
  const tammuzFast = day(17, months.TAMUZ, 5786);
  const said = (segment: { he: Run[][] }) =>
    letters(
      segment.he
        .flat()
        .filter((run) => run.s !== 'n')
        .map((run) => run.t)
        .join(' '),
    ).trim();
  const minyanBlocks = (nusach: Nusach, id: SiddurTextId, features: DayFeatures, title: string) =>
    segmentBlocks(
      resolveSiddurText(load(nusach, id), features).find((section) => section.title.he === title)!.segments,
      'minyan',
    ).map((block) => ({
      label: block.label?.he ?? null,
      first: block.segments.map(said).find(Boolean) ?? '',
      all: block.segments.map(said).join(' '),
    }));

  it('says who says every Kaddish, Barchu, Kedushah, Modim DeRabbanan and Priestly Blessing, in every text', () => {
    const mustBeLabeled = [
      /^(יתגדל ויתקדש|יהא שמה רבא|יתברך וישתבח|תתקבל|יהא שלמא רבא)/,
      /^ברכו את \S+ המברך/,
      /^(נקדש את|נקדישך|כתר יתנו)/,
      /אלהי כל ?בשר יוצרנו/,
      /ברכנו בברכה המשלשת/,
    ];
    const unlabeled: string[] = [];
    for (const nusach of NUSCHAOT) {
      for (const id of TEXT_IDS) {
        for (const section of load(nusach, id).sections) {
          for (const segment of section.segments) {
            const paragraphs = segment.he.map((runs) => said({ he: [runs] }));
            if (!segment.minyan && paragraphs.some((text) => mustBeLabeled.some((pattern) => pattern.test(text)))) {
              unlabeled.push(`${nusach}/${id} [${section.title.he}]: ${paragraphs.join(' ').slice(0, 50)}`);
            }
          }
        }
      }
    }
    expect(unlabeled).toEqual([]);
  });

  it('tells the chazzan’s Kaddish from the mourners’ Kaddish', () => {
    for (const nusach of NUSCHAOT) {
      for (const id of TEXT_IDS) {
        for (const segment of load(nusach, id).sections.flatMap((section) => section.segments)) {
          const text = said(segment);
          if (/תתקבל צלות/.test(text))
            expect({ nusach, id, label: segment.minyan?.he }).toEqual({ nusach, id, label: 'רק שליח הציבור אומר' });
          if (/על ישראל ועל רבנן/.test(text))
            expect({ nusach, id, label: segment.minyan?.he }).toEqual({ nusach, id, label: 'אבלים אומרים' });
        }
      }
    }
  });

  it('sets the repetition’s Kedushah, Modim DeRabbanan and Priestly Blessing apart from what each person says', () => {
    for (const nusach of NUSCHAOT) {
      const blocks = minyanBlocks(nusach, 'shacharit', weekday, 'תפילת העמידה');
      const after = (label: string) => blocks[blocks.findIndex((block) => block.label === label) + 1];
      const before = (label: string) => blocks[blocks.findIndex((block) => block.label === label) - 1];
      expect(after('קדושה — נאמרת רק בחזרת הש״ץ')).toMatchObject({
        label: null,
        first: expect.stringMatching(/^אתה קדוש/),
      });
      expect(before('מודים דרבנן — הקהל אומר בחזרת הש״ץ').all).toMatch(
        /מודים אנחנו לך שאתה הוא \S+ אלהינו ואלהי אבותינו לעולם ועד/,
      );
      expect(after('ברכת כהנים — רק בחזרת הש״ץ')).toMatchObject({
        label: null,
        first: expect.stringMatching(/^שים שלום/),
      });
    }
  });

  it('shows the Priestly Blessing at mincha only on a public fast, where the nusach prints it', () => {
    for (const nusach of NUSCHAOT) {
      const labels = (features: DayFeatures) =>
        minyanBlocks(nusach, 'mincha', features, 'תפילת העמידה').map((block) => block.label);
      expect(labels(tammuzFast)).toContain('ברכת כהנים — רק בחזרת הש״ץ');
      expect(labels(weekday)).not.toContain('ברכת כהנים — רק בחזרת הש״ץ');
      expect(labels(weekday)).toContain('קדושה — נאמרת רק בחזרת הש״ץ');
    }
  });

  it('leaves the congregation’s own Shema and Amidah unlabeled', () => {
    for (const nusach of NUSCHAOT) {
      const shema = resolveSiddurText(load(nusach, 'krias_shma_shacharit'), weekday).flatMap(
        (section) => section.segments,
      );
      expect(shema.filter((segment) => /^שמע ישראל/.test(said(segment))).every((segment) => !segment.minyan)).toBe(
        true,
      );
      const amidah = minyanBlocks(nusach, 'mincha', weekday, 'תפילת העמידה').filter((block) => block.label === null);
      expect(amidah.map((block) => block.all).join(' ')).toMatch(/רפאנו \S+ ונרפא/);
    }
  });
});

describe('sections and passages that depend on praying with or without a minyan', () => {
  const MINYAN_ONLY_TITLES = [
    'חצי קדיש',
    'קדיש',
    'קדיש שלם',
    'קדיש יתום',
    'קדיש דרבנן',
    'ברכו',
    'ברכו לסיום',
    'קריאת התורה',
    'הכנסת ספר התורה',
  ];
  const WITH_MINYAN = 'נאמר רק במניין';
  const ALONE = 'המתפלל ביחיד אומר';
  const monday = day(8, months.CHESHVAN, 5787);
  const tzomGedaliah = day(3, months.TISHREI, 5787);
  const asaraBTevet = day(10, months.TEVET, 5787);
  const taanitEsther = day(13, months.ADAR_II, 5787);
  const tzomTammuz = day(17, months.TAMUZ, 5786);
  const everySection = () =>
    NUSCHAOT.flatMap((nusach) =>
      TEXT_IDS.flatMap((id) => load(nusach, id).sections.map((section) => ({ nusach, id, section }))),
    );
  const VAYAAVOR = /ויעבר \S+ על ?פניו ויקרא/;
  const saidText = (segment: { he: Run[][] }) =>
    letters(
      segment.he
        .flat()
        .filter((run) => run.s !== 'n')
        .map((run) => run.t)
        .join(' '),
    );

  it('flags every Kaddish, Barchu and Torah-reading section as minyan-only, and no other section', () => {
    const wrong = everySection()
      .filter(({ section }) => (section.minyanOnly === true) !== MINYAN_ONLY_TITLES.includes(section.title.he))
      .map(({ nusach, id, section }) => `${nusach}/${id}: ${section.title.he}`);
    expect(wrong).toEqual([]);
    expect(
      everySection().filter(({ section }) => section.minyanOnly !== undefined && section.minyanOnly !== true),
    ).toEqual([]);
  });

  it('flags each of those titles somewhere, so the list cannot go stale', () => {
    const flagged = new Set(
      everySection()
        .filter(({ section }) => section.minyanOnly)
        .map(({ section }) => section.title.he),
    );
    expect([...flagged].sort()).toEqual([...MINYAN_ONLY_TITLES].sort());
  });

  it('keeps the flag through a day’s resolution, on the sections a Monday reads', () => {
    for (const nusach of NUSCHAOT) {
      const resolved = resolveSiddurText(load(nusach, 'shacharit'), monday);
      const flagged = resolved.filter((section) => section.minyanOnly).map((section) => section.title.he);
      expect(flagged).toContain('קריאת התורה');
      expect(flagged).toContain('חצי קדיש');
      expect(resolved.filter((section) => !section.minyanOnly).length).toBeGreaterThan(flagged.length);
    }
  });

  it('marks the praying-alone fold with alone: true, and no other label', () => {
    const labels = everySection().flatMap(({ nusach, id, section }) => [
      ...(section.optional ? [{ nusach, id, label: section.optional }] : []),
      ...section.segments.flatMap((segment) =>
        [segment.optional, segment.minyan].filter(Boolean).map((label) => ({ nusach, id, label: label! })),
      ),
    ]);
    const alone = labels.filter(({ label }) => label.he === ALONE);
    expect(alone.length).toBeGreaterThan(0);
    expect(alone.every(({ label }) => label.alone === true)).toBe(true);
    expect(labels.filter(({ label }) => label.alone !== undefined && label.he !== ALONE)).toEqual([]);
    const where = new Set(alone.map(({ nusach, id }) => `${nusach}/${id}`));
    for (const nusach of ['ashkenaz', 'sefard'] as const) {
      for (const id of ['shacharit', 'maariv', 'krias_shma_shacharit'] as const)
        expect(where).toContain(`${nusach}/${id}`);
    }
  });

  it('labels every 13 Middot verse in every nusach as said only with a minyan', () => {
    const unlabeled = everySection().flatMap(({ nusach, id, section }) =>
      section.segments
        .filter((segment) => VAYAAVOR.test(saidText(segment)) && !segment.minyan)
        .map((segment) => `${nusach}/${id} [${section.title.he}]: ${saidText(segment).slice(0, 40)}`),
    );
    expect(unlabeled).toEqual([]);
  });

  it('labels the 13 Middot of Edot HaMizrach inside the Monday and Thursday Tachanun and every Selichot repetition', () => {
    const verses = (features: DayFeatures, title: string) =>
      resolveSiddurText(load('edot_hamizrach', 'shacharit'), features)
        .filter((section) => section.title.he === title)
        .flatMap((section) => section.segments)
        .filter((segment) => VAYAAVOR.test(saidText(segment)))
        .map((segment) => segment.minyan?.he ?? null);
    expect(verses(monday, 'תחנון')).toEqual(Array(4).fill(WITH_MINYAN));
    expect(verses(day(9, months.CHESHVAN, 5787), 'תחנון')).toEqual([WITH_MINYAN]);
    for (const fast of [tzomGedaliah, asaraBTevet, taanitEsther, tzomTammuz]) {
      expect(verses(fast, 'סליחות')).toEqual(Array(4).fill(WITH_MINYAN));
    }
  });
});

describe('section titles', () => {
  const sampleDays: DayFeatures[] = [
    day(9, months.CHESHVAN, 5787),
    day(8, months.CHESHVAN, 5787),
    day(12, months.CHESHVAN, 5787),
    day(1, months.CHESHVAN, 5787),
    day(30, months.TISHREI, 5787),
    day(1, months.TEVET, 5787),
    day(18, months.NISAN, 5786),
    day(18, months.NISAN, 5786, DIASPORA),
    day(18, months.TISHREI, 5787),
    day(17, months.TISHREI, 5787, DIASPORA),
    day(21, months.TISHREI, 5787),
    day(27, months.KISLEV, 5787),
    day(14, months.ADAR_II, 5787),
    day(15, months.ADAR_II, 5787, { inIsrael: true, jerusalem: true }),
    day(14, months.ADAR_I, 5787),
    day(9, months.AV, 5786),
    day(3, months.TISHREI, 5787),
    day(5, months.TISHREI, 5787),
    day(9, months.TISHREI, 5787),
    day(11, months.TISHREI, 5787),
    day(10, months.TEVET, 5787),
    day(13, months.ADAR_II, 5787),
    day(17, months.TAMUZ, 5786),
    day(14, months.NISAN, 5786),
    day(1, months.ELUL, 5786),
    day(30, months.AV, 5786),
    day(18, months.IYYAR, 5786),
    civilDay(new Date(2026, 3, 22)),
    civilDay(new Date(2026, 9, 11)),
  ];

  it('are unique among the sections shown on any one day, because the reader keys and scrolls by them', () => {
    for (const nusach of NUSCHAOT) {
      for (const id of TEXT_IDS) {
        const text = load(nusach, id);
        for (const features of sampleDays) {
          const sections = resolveSiddurText(text, features);
          for (const language of ['he', 'en'] as const) {
            const shown = sections.map((section) => section.title[language]);
            expect({ nusach, id, shown: shown.filter((title, index) => shown.indexOf(title) !== index) }).toEqual({
              nusach,
              id,
              shown: [],
            });
          }
        }
      }
    }
  });
});

describe('hasSiddurText', () => {
  const tefillin = findMitzvah('tefillin')!;
  const havdalah = findMitzvah('havdalah')!;
  const shacharit = findMitzvah('shacharit')!;
  const custom = (contentBlocks: Mitzvah['contentBlocks']): Mitzvah => ({
    ...tefillin,
    id: 'custom_1_a',
    isCustom: true,
    contentBlocks,
  });

  it('offers a static text in every nusach, and nothing for an id with no text', () => {
    for (const nusach of NUSCHAOT) {
      expect(hasSiddurText(tefillin, nusach, new Date(2026, 9, 9), ISRAEL)).toBe(true);
      expect(hasSiddurText({ ...tefillin, id: 'no_such_text' }, nusach, new Date(2026, 9, 9), ISRAEL)).toBe(false);
    }
  });

  it('withholds havdalah when the night that follows is Yom Tov', () => {
    let saturdayBeforeYomTov: Date | null = null;
    for (
      let d = new Date(2026, 0, 3);
      d.getFullYear() < 2036;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)
    ) {
      if (eveningOf(d).flags.has('yomTov')) {
        saturdayBeforeYomTov = d;
        break;
      }
    }
    expect(saturdayBeforeYomTov).not.toBeNull();
    expect(hasSiddurText(havdalah, 'ashkenaz', saturdayBeforeYomTov!, ISRAEL)).toBe(false);
    expect(hasSiddurText(havdalah, 'ashkenaz', new Date(2026, 9, 10), ISRAEL)).toBe(true);
  });

  it('offers the weekday services only when the day or the night they open is a weekday', () => {
    const mincha = findMitzvah('mincha')!;
    const maariv = findMitzvah('maariv')!;
    const friday = new Date(2026, 9, 9);
    const saturday = new Date(2026, 9, 10);
    const erevPesach = erev(15, months.NISAN, 5786);
    const firstDayPesach = new HDate(15, months.NISAN, 5786).greg();
    const yomKippur = new HDate(10, months.TISHREI, 5787).greg();
    expect([friday.getDay(), saturday.getDay()]).toEqual([5, 6]);
    expect([erevPesach, firstDayPesach, yomKippur].map((d) => d.getDay())).toEqual([3, 4, 1]);

    const cholHamoed = new HDate(18, months.NISAN, 5786).greg();
    for (const nusach of NUSCHAOT) {
      expect(hasSiddurText(shacharit, nusach, friday, ISRAEL)).toBe(true);
      expect(hasSiddurText(shacharit, nusach, cholHamoed, ISRAEL)).toBe(true);
      expect(hasSiddurText(shacharit, nusach, saturday, ISRAEL)).toBe(false);
      expect(hasSiddurText(shacharit, nusach, firstDayPesach, ISRAEL)).toBe(false);
      expect(hasSiddurText(shacharit, nusach, yomKippur, ISRAEL)).toBe(false);
      expect(hasSiddurText(mincha, nusach, friday, ISRAEL)).toBe(true);
      expect(hasSiddurText(mincha, nusach, saturday, ISRAEL)).toBe(false);
      expect(hasSiddurText(mincha, nusach, firstDayPesach, ISRAEL)).toBe(false);
      expect(hasSiddurText(mincha, nusach, yomKippur, ISRAEL)).toBe(false);
      expect(hasSiddurText(maariv, nusach, friday, ISRAEL)).toBe(false);
      expect(hasSiddurText(maariv, nusach, saturday, ISRAEL)).toBe(true);
      expect(hasSiddurText(maariv, nusach, erevPesach, ISRAEL)).toBe(false);
      expect(hasSiddurText(maariv, nusach, firstDayPesach, ISRAEL)).toBe(true);
      expect(hasSiddurText(maariv, nusach, firstDayPesach, DIASPORA)).toBe(false);
    }
  });

  it('offers a custom mitzvah’s own text, but not a link alone', () => {
    const blessing = custom([{ type: 'blessing', he: 'ברוך אתה', en: 'Blessed are You' }]);
    expect(hasSiddurText(blessing, 'sefard', new Date(), ISRAEL)).toBe(true);
    expect(
      hasSiddurText(custom([{ type: 'link', he: 'קישור', url: 'https://example.org' }]), 'sefard', new Date(), ISRAEL),
    ).toBe(false);
    expect(hasSiddurText(custom(undefined), 'sefard', new Date(), ISRAEL)).toBe(false);
    expect(customSiddurText(blessing, 'sefard')?.sections[0].segments).toEqual([
      { he: [[{ t: 'ברוך אתה', s: 'b' }]], en: 'Blessed are You' },
    ]);
  });

  it('keeps a siddur block out of the custom text, so it neither offers nor fills the reader', () => {
    const siddurOnly = custom([{ type: 'siddur', he: 'x', textId: 'asher_yatzar' }]);
    expect(customSiddurText(siddurOnly, 'sefard')).toBeNull();
    expect(hasSiddurText(siddurOnly, 'sefard', new Date(), ISRAEL)).toBe(false);

    const mixed = custom([
      { type: 'text', he: 'שלום' },
      { type: 'siddur', he: 'x', textId: 'asher_yatzar' },
    ]);
    expect(customSiddurText(mixed, 'sefard')?.sections[0].segments).toEqual([{ he: [[{ t: 'שלום' }]] }]);
  });
});

describe('standalone texts', () => {
  const weekday = day(3, months.CHESHVAN, 5787);
  const roshChodesh = day(1, months.CHESHVAN, 5787);
  const afterRoshChodesh = day(2, months.CHESHVAN, 5787);
  const cholHamoedSukkot = day(18, months.TISHREI, 5787);
  const chanukah = day(27, months.KISLEV, 5787);
  const afterChanukah = day(3, months.TEVET, 5787);
  const purim = day(14, months.ADAR_II, 5787);
  const afterPurim = day(15, months.ADAR_II, 5787);
  const sections = (nusach: Nusach, id: SiddurTextId, features: DayFeatures) =>
    resolveSiddurText(load(nusach, id), features);
  const saidIn = (segments: SiddurText['sections'][number]['segments']) =>
    letters(
      segments
        .flatMap((segment) =>
          segment.he
            .flat()
            .filter((run) => run.s !== 'n')
            .map((run) => run.t),
        )
        .join(' '),
    ).trim();
  const foldedText = (nusach: Nusach, id: SiddurTextId, features: DayFeatures, label: string) =>
    saidIn(
      sections(nusach, id, features)
        .flatMap((section) => section.segments)
        .filter((segment) => segment.optional?.he === label),
    );
  const openText = (nusach: Nusach, id: SiddurTextId, features: DayFeatures) =>
    saidIn(
      sections(nusach, id, features)
        .filter((section) => !section.optional)
        .flatMap((section) => section.segments)
        .filter((segment) => !segment.optional),
    );
  const MEAL_BEGAN_YV = 'אם התחילו לאכול לפני השקיעה בראש חודש או בחול המועד';
  const MEAL_BEGAN_AH = 'אם התחילו לאכול לפני השקיעה בחנוכה או בפורים';

  it('falls on the days its fixtures claim', () => {
    expect(roshChodesh.flags.has('roshChodesh')).toBe(true);
    expect(afterRoshChodesh.flags.has('roshChodeshYesterday')).toBe(true);
    expect(cholHamoedSukkot.flags.has('cholHamoedSukkot')).toBe(true);
    expect(chanukah.flags.has('chanukah')).toBe(true);
    expect(afterChanukah.flags.has('chanukahYesterday')).toBe(true);
    expect(purim.flags.has('purim')).toBe(true);
    expect(afterPurim.flags.has('purimYesterday')).toBe(true);
    for (const flag of ['roshChodesh', 'roshChodeshYesterday', 'chanukah', 'purim', 'cholHamoedSukkot'] as const) {
      expect(weekday.flags.has(flag)).toBe(false);
    }
  });

  it('names, groups and tells the two kinds of id apart', () => {
    for (const id of STANDALONE_IDS) {
      const entry = STANDALONE_TEXTS[id];
      expect(entry.name.he).toMatch(/[א-ת]/);
      expect(entry.name.en).toMatch(/[A-Za-z]{3,}/);
      expect(SIDDUR_GROUPS).toContain(entry.group);
      expect(standaloneTextsIn(entry.group)).toContain(id);
      expect(standaloneTextId(id)).toBe(id);
      expect(mitzvahTextId(id)).toBeNull();
      if (entry.available) {
        expect(entry.availableLabel?.he).toMatch(/[א-ת]/);
        expect(entry.availableLabel?.en).toMatch(/[A-Za-z]{2,}/);
      }
    }
    expect(mitzvahTextId('mincha')).toBe('mincha');
    expect(standaloneTextId('mincha')).toBeNull();
    expect(standaloneTextId('no_such_text')).toBeNull();
    expect(isSiddurTextId('tzitzit')).toBe(false);
    expect(SIDDUR_TEXT_IDS.every(isSiddurTextId)).toBe(true);
    expect(SIDDUR_GROUPS.flatMap((group) => standaloneTextsIn(group)).sort()).toEqual([...STANDALONE_IDS].sort());
  });

  it('files the blessings, the night texts and Tikkun HaKlali in one general group, in the catalog order', () => {
    expect(SIDDUR_GROUPS).toEqual(['meals', 'general', 'occasions']);
    for (const id of ['tefilat_haderech', 'kriat_shema_al_hamita', 'kiddush_levana', 'tikkun_haklali'] as const) {
      expect(STANDALONE_TEXTS[id].group).toBe('general');
    }
    expect(standaloneTextsIn('general')).toEqual([
      'tikkun_haklali',
      'tehillim',
      'kriat_shema_al_hamita',
      'tefilat_haderech',
      'asher_yatzar',
      'birchot_hanehenin',
      'birchot_hareiya',
      'mezuzah',
      'kiddush_levana',
    ]);
    expect(standaloneTextsIn('meals')).toEqual(['birkat_hamazon', 'al_hamichya', 'borei_nefashot']);
    expect(standaloneTextsIn('occasions')).toEqual(['sheva_berachot', 'chanukah_candles']);
  });

  it('offers every standalone text in every nusach on the days its condition allows', () => {
    for (const nusach of NUSCHAOT) {
      for (const id of STANDALONE_IDS) {
        const { available } = STANDALONE_TEXTS[id];
        expect(hasStandaloneText(id, nusach, weekday)).toBe(matchesCondition(available, weekday));
        if (!available) expect(hasStandaloneText(id, nusach, weekday)).toBe(true);
      }
    }
  });

  it('resolves a text opened with no date for the day in effect, and a night text for the night in effect or coming next', () => {
    const jerusalem = { name: 'Jerusalem', lat: 31.7683, lng: 35.2137, tz: 'Asia/Jerusalem', inIsrael: true };
    const noon = new Date('2026-10-08T09:00:00Z');
    for (const id of STANDALONE_IDS) {
      const expected = STANDALONE_TEXTS[id].evening
        ? HebcalService.hebrewNightAt(noon, jerusalem)
        : HebcalService.hebrewDayAt(noon, jerusalem);
      expect(standaloneTextDay(id, noon, jerusalem).abs()).toBe(expected.abs());
    }
    expect(HebcalService.hebrewNightAt(noon, jerusalem).abs()).toBe(
      HebcalService.hebrewDayAt(noon, jerusalem).abs() + 1,
    );
  });

  it('says Yaaleh Veyavo in Birkat HaMazon on Rosh Chodesh and Chol HaMoed, and never Retzei', () => {
    for (const nusach of NUSCHAOT) {
      const onRoshChodesh = openText(nusach, 'birkat_hamazon', roshChodesh);
      expect(onRoshChodesh).toMatch(/יעלה ויבא/);
      expect(onRoshChodesh).toMatch(/ראש ה?חדש הזה/);
      expect(onRoshChodesh).not.toMatch(/חג המצות|חג הסכות/);
      expect(onRoshChodesh).toMatch(/יחדש עלינו את החדש הזה/);

      const onCholHamoed = openText(nusach, 'birkat_hamazon', cholHamoedSukkot);
      expect(onCholHamoed).toMatch(/יעלה ויבא/);
      expect(onCholHamoed).toMatch(/חג הסכות הזה/);
      expect(onCholHamoed).not.toMatch(/ראש ה?חדש הזה|חג המצות/);

      const onWeekday = openText(nusach, 'birkat_hamazon', weekday);
      expect(onWeekday).not.toMatch(/יעלה ויבא|על הנסים|ראש ה?חדש הזה/);
      for (const features of [weekday, roshChodesh, cholHamoedSukkot, chanukah]) {
        expect(shownOn(nusach, 'birkat_hamazon', features)).not.toMatch(/רצה והחליצנו|יום שכלו שבת/);
      }
    }
  });

  it('says Al HaNissim in Birkat HaMazon on Chanukah and Purim, with the right story', () => {
    for (const nusach of NUSCHAOT) {
      const onChanukah = openText(nusach, 'birkat_hamazon', chanukah);
      expect(onChanukah).toMatch(/על הנסים/);
      expect(onChanukah).toMatch(/בימי מתתיה/);
      expect(onChanukah).not.toMatch(/בימי מרדכי/);
      const onPurim = openText(nusach, 'birkat_hamazon', purim);
      expect(onPurim).toMatch(/על הנסים/);
      expect(onPurim).toMatch(/בימי מרדכי/);
      expect(onPurim).not.toMatch(/בימי מתתיה/);
    }
  });

  it('folds yesterday’s inserts the day after, under a label naming the meal, and shows them open on the day itself', () => {
    for (const nusach of NUSCHAOT) {
      expect(foldedText(nusach, 'birkat_hamazon', afterRoshChodesh, MEAL_BEGAN_YV)).toMatch(/יעלה ויבא/);
      expect(foldedText(nusach, 'birkat_hamazon', afterRoshChodesh, MEAL_BEGAN_YV)).toMatch(/ראש ה?חדש הזה/);
      expect(openText(nusach, 'birkat_hamazon', afterRoshChodesh)).not.toMatch(/יעלה ויבא/);
      expect(foldedText(nusach, 'birkat_hamazon', roshChodesh, MEAL_BEGAN_YV)).toBe('');
      expect(foldedText(nusach, 'birkat_hamazon', weekday, MEAL_BEGAN_YV)).toBe('');

      expect(foldedText(nusach, 'birkat_hamazon', afterChanukah, MEAL_BEGAN_AH)).toMatch(/בימי מתתיה/);
      expect(foldedText(nusach, 'birkat_hamazon', afterPurim, MEAL_BEGAN_AH)).toMatch(/בימי מרדכי/);
      expect(openText(nusach, 'birkat_hamazon', afterPurim)).not.toMatch(/על הנסים/);
      expect(foldedText(nusach, 'birkat_hamazon', chanukah, MEAL_BEGAN_AH)).toBe('');

      expect(foldedText(nusach, 'al_hamichya', afterRoshChodesh, MEAL_BEGAN_YV)).toMatch(/ראש ה?חדש הזה/);
      expect(openText(nusach, 'al_hamichya', afterRoshChodesh)).not.toMatch(/ראש ה?חדש הזה/);
    }
  });

  it('labels who says each line of the zimun, in every nusach', () => {
    for (const nusach of NUSCHAOT) {
      const zimun = sections(nusach, 'birkat_hamazon', weekday).find((section) => /זימון/.test(section.title.he))!;
      const labels = zimun.segments.map((segment) => segment.minyan?.he ?? null).filter(Boolean);
      expect(labels).toContain('המזמן אומר');
      expect(labels).toContain('המסובים עונים');
      expect(letters(zimun.segments.flatMap((segment) => segment.he.flat().map((run) => run.t)).join(' '))).toMatch(
        /נברך/,
      );
    }
  });

  describe('birkat_hamazon extras for a guest, a wedding meal and a brit milah meal', () => {
    const GUEST = 'אורח אומר';
    const SHEVA_BERACHOT = 'בסעודת שבע ברכות';
    const BRIT_MILAH = 'בסעודת ברית מילה';
    const foldedSections = (nusach: Nusach) =>
      sections(nusach, 'birkat_hamazon', weekday)
        .filter((section) => section.optional)
        .map((section) => [section.title.he, section.optional!.he]);
    const section = (nusach: Nusach, title: string) =>
      sections(nusach, 'birkat_hamazon', weekday).find((candidate) => candidate.title.he === title)!;
    const guestSegments = (nusach: Nusach) =>
      sections(nusach, 'birkat_hamazon', weekday)
        .flatMap((candidate) => candidate.segments)
        .filter((segment) => segment.optional?.he === GUEST);

    it('folds the sections said only at a wedding meal or a brit milah meal, closed, beside the zimun and the Harachaman', () => {
      expect(foldedSections('ashkenaz')).toEqual([
        ['זימון בסעודת שבע ברכות', SHEVA_BERACHOT],
        ['זימון בסעודת ברית מילה', BRIT_MILAH],
        ['הרחמן לברית מילה', BRIT_MILAH],
      ]);
      expect(foldedSections('sefard')).toEqual([
        ['זימון בסעודת שבע ברכות', SHEVA_BERACHOT],
        ['הרחמן לברית מילה', BRIT_MILAH],
      ]);
      expect(foldedSections('edot_hamizrach')).toEqual([]);
      expect(foldedSections('chabad')).toEqual([['הרחמן לברית מילה', BRIT_MILAH]]);
      const titles = (nusach: Nusach) => sections(nusach, 'birkat_hamazon', weekday).map((entry) => entry.title.he);
      expect(titles('ashkenaz')).toEqual([
        'לפני ברכת המזון',
        'זימון',
        'זימון בסעודת שבע ברכות',
        'זימון בסעודת ברית מילה',
        'ברכת המזון',
        'הרחמן',
        'הרחמן לברית מילה',
      ]);
      expect(titles('sefard').slice(-2)).toEqual(['הרחמן', 'הרחמן לברית מילה']);
      expect(titles('chabad').slice(-2)).toEqual(['הרחמן', 'הרחמן לברית מילה']);
    });

    it('says the brit milah lines in the father, the sandak, the child, the mohel and the Messiah order', () => {
      for (const nusach of ['ashkenaz', 'sefard', 'chabad'] as Nusach[]) {
        const said = saidIn(section(nusach, 'הרחמן לברית מילה').segments);
        const order = ['אבי הילד', 'בעל ברית המילה', 'רך הנמול', 'המל בשר הערלה', 'ישלח לנו משיחו', 'כהן צדק'].map(
          (phrase) => said.indexOf(phrase),
        );
        expect(order.every((index) => index >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
      }
    });

    it('keeps the wedding and brit zimun wordings out of the regular text, and labels who says each line of them', () => {
      for (const nusach of NUSCHAOT) {
        const regular = openText(nusach, 'birkat_hamazon', weekday);
        expect(regular).not.toMatch(/דוי הסר|נודה לשמך|ברית המילה|שהשמחה במעונו/);
      }
      const wedding = section('ashkenaz', 'זימון בסעודת שבע ברכות');
      expect(saidIn(wedding.segments)).toMatch(/^רבותי נברך.*דוי הסר.*שהשמחה במעונו/);
      const brit = section('ashkenaz', 'זימון בסעודת ברית מילה');
      expect(saidIn(brit.segments)).toMatch(/^רבותי נברך.*נודה לשמך.*אפתח פי בשיר/);
      for (const zimun of [wedding, brit]) {
        const labels = zimun.segments.map((segment) => segment.minyan?.he);
        expect(labels[0]).toBe('המזמן אומר');
        expect(labels).toContain('המסובים עונים');
        expect(labels.every(Boolean)).toBe(true);
      }
    });

    it('folds what a guest says on its own: Ashkenaz keeps its instruction line inside the fold, Sefard replaces it with the label, Edot HaMizrach cuts it from the shared segment', () => {
      const ashkenaz = guestSegments('ashkenaz');
      expect(ashkenaz).toHaveLength(2);
      expect(ashkenaz[0].he.flat().every((run) => run.s === 'n')).toBe(true);
      expect(
        letters(
          ashkenaz[0].he
            .flat()
            .map((run) => run.t)
            .join(' '),
        ),
      ).toMatch(
        /^אם אוכל על שלחן אחרים יברך לבעהב ואפילו בנים הסמוכים על שלחן אביהם וגם האב הנסמך על שלחן בניו וגם אשתו תאמר כן/,
      );
      expect(saidIn(ashkenaz)).toMatch(/^יהי רצון שלא יבוש ולא יכלם בעל הבית הזה/);
      const openShown = letters(
        sections('ashkenaz', 'birkat_hamazon', weekday)
          .filter((candidate) => !candidate.optional)
          .flatMap((candidate) => candidate.segments)
          .filter((segment) => !segment.optional)
          .flatMap((segment) => segment.he.flat().map((run) => run.t))
          .join(' '),
      );
      expect(openShown).not.toMatch(/שלחן אחרים|בניו|יבוש/);

      const sefard = guestSegments('sefard');
      expect(sefard).toHaveLength(1);
      expect(saidIn(sefard)).toMatch(/^הרחמן הוא יברך את בעל הבית הזה ואת אשתו בעלת הבית הזה/);
      expect(shownOn('sefard', 'birkat_hamazon', weekday)).not.toMatch(/אורח אומר/);

      expect(guestSegments('chabad')).toHaveLength(0);
      const edot = guestSegments('edot_hamizrach');
      expect(edot).toHaveLength(1);
      expect(saidIn(edot)).toMatch(/^הרחמן הוא יברך את השלחן הזה.*בעל הבית הזה ובעל הסעודה הזאת/);
      for (const nusach of ['ashkenaz', 'sefard'] as Nusach[]) {
        const regular = openText(nusach, 'birkat_hamazon', weekday);
        expect(regular).not.toMatch(/יבוש/);
        expect(regular).toMatch(/במרום ילמדו עליהם ועלינו זכות/);
      }
    });

    it('folds the Edot HaMizrach guest, wedding and brit milah blessings as three separate folds in a row, each opening on its Harachaman with no bracketed heading', () => {
      const harachaman = section('edot_hamizrach', 'הרחמן');
      const folds = segmentBlocks(harachaman.segments, 'optional').filter((block) => block.label);
      expect(folds.map((fold) => fold.label!.he)).toEqual([GUEST, SHEVA_BERACHOT, BRIT_MILAH]);
      expect(folds.map((fold) => fold.segments.length)).toEqual([1, 1, 1]);
      expect(folds.map((fold) => fold.start)).toEqual([folds[0].start, folds[0].start + 1, folds[0].start + 2]);
      expect(harachaman.segments.filter((segment) => !segment.optional)).toHaveLength(harachaman.segments.length - 3);

      const [guest, wedding, brit] = folds.map((fold) => saidIn(fold.segments));
      expect(guest).toMatch(/את השלחן הזה.*בעל הבית הזה ובעל הסעודה הזאת/);
      expect(guest).not.toMatch(/החתן|הסנדק|אבי הבן/);
      expect(wedding).toMatch(/^הרחמן הוא יברך את החתן והכלה/);
      expect(wedding).not.toMatch(/בעל הסעודה|הסנדק|אבי הבן/);
      expect(brit).toMatch(/אבי הבן.*הסנדק/);
      expect(brit).not.toMatch(/בעל הסעודה|החתן/);

      for (const fold of folds) {
        expect(fold.segments[0].he).toHaveLength(1);
        expect(fold.segments[0].he.flat().every((run) => run.s !== 'n')).toBe(true);
        expect(letters(fold.segments[0].he[0][0].t)).toMatch(/^הרחמן הוא יברך/);
      }
      const shownRuns = sections('edot_hamizrach', 'birkat_hamazon', weekday)
        .flatMap((candidate) => candidate.segments)
        .flatMap((segment) => segment.he.flat())
        .map((run) => run.t.trim());
      expect(shownRuns.filter((text) => ['אורח אומר', 'בסעודת חתן', 'בסעודת מילה'].includes(text))).toEqual([]);
      expect(shownOn('edot_hamizrach', 'birkat_hamazon', weekday)).not.toMatch(/אורח אומר|בסעודת חתן/);

      const regular = openText('edot_hamizrach', 'birkat_hamazon', weekday);
      expect(regular).not.toMatch(/החתן|הסנדק|אבי הבן|בעל הסעודה|את השלחן הזה/);
      expect(regular).toMatch(/יטע תורתו ואהבתו בלבנו/);
      expect(regular).toMatch(/יחינו ויזכנו ויקרבנו לימות המשיח/);
    });

    it('aligns the Edot HaMizrach English with its fold', () => {
      const harachaman = section('edot_hamizrach', 'הרחמן');
      const folds = segmentBlocks(harachaman.segments, 'optional').filter((block) => block.label);
      const [guest, wedding, brit] = folds.map((fold) => fold.segments[0]);
      expect(guest.en).toMatch(/^The Merciful One, He will bless this table/);
      expect(guest.en).not.toMatch(/give us life|Seduat|groom/);
      expect(wedding.en).toBe(
        'The merciful one, bless the groom and bride, with male children for his blessed service:',
      );
      expect(brit.en).toBeUndefined();
      const messiah = harachaman.segments.find(
        (segment) =>
          !segment.optional &&
          letters(
            segment.he
              .flat()
              .map((run) => run.t)
              .join(' '),
          ).startsWith('הרחמן הוא יחינו'),
      )!;
      expect(messiah.en).toMatch(/^The Merciful One, He will give us life/);
    });

    it('leaves the regular Harachaman lines of every nusach unlabeled, with the Messiah line and the closing verses open', () => {
      for (const nusach of NUSCHAOT) {
        const harachaman = section(nusach, 'הרחמן');
        expect(harachaman.optional).toBeUndefined();
        const open = harachaman.segments.filter((segment) => !segment.optional);
        const openSaid = saidIn(open);
        expect(openSaid).toMatch(/הרחמן הוא (יזכנו|יחינו ויזכנו ויקרבנו) לימות המשיח/);
        expect(openSaid).not.toMatch(/אבי הילד|בעל ברית המילה|יבוש/);
        expect(open.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  it('closes Me’ein Shalosh for the Land of Israel or for abroad, and adds the day on Rosh Chodesh and Chol HaMoed', () => {
    for (const nusach of NUSCHAOT) {
      const inIsrael = openText(nusach, 'al_hamichya', weekday);
      const abroad = openText(nusach, 'al_hamichya', dayFeatures(new HDate(3, months.CHESHVAN, 5787), DIASPORA));
      if (nusach === 'chabad') {
        expect(inIsrael).toBe(abroad);
      } else {
        expect(inIsrael).toMatch(/פרי גפנה/);
        expect(inIsrael).not.toMatch(/על הפרות/);
        expect(abroad).toMatch(/על הפרות/);
        expect(abroad).not.toMatch(/פרי גפנה|פרותיה/);
      }
      expect(openText(nusach, 'al_hamichya', roshChodesh)).toMatch(/ראש ה?חדש הזה/);
      expect(openText(nusach, 'al_hamichya', cholHamoedSukkot)).toMatch(/הסכות הזה/);
      expect(inIsrael).not.toMatch(/ראש ה?חדש הזה|הסכות הזה|המצות הזה|השבת הזה|הזכרון הזה/);
    }
  });

  it('says Borei Nefashot and opens the Traveler’s Prayer with "Yehi Ratzon" in every nusach', () => {
    for (const nusach of NUSCHAOT) {
      expect(saidOn(nusach, 'borei_nefashot', weekday)).toMatch(/בורא נפשות רבות וחסרונן/);
      const derech = saidOn(nusach, 'tefilat_haderech', weekday).trim();
      expect(derech).toMatch(/^יהי רצון מלפניך/);
      expect(derech).toMatch(/שומע תפלה/);
      expect(sections(nusach, 'tefilat_haderech', weekday)[0].title.he).toBe('תפילת הדרך');
    }
    const sefardFolded = sections('sefard', 'tefilat_haderech', weekday)
      .filter((section) => section.optional)
      .map((section) => section.optional!.he);
    expect(sefardFolded).toEqual(['בכניסה לעיר וביציאה ממנה', 'לעוברי ימים ונהרות', 'לטסים במטוס']);
    expect(foldedText('edot_hamizrach', 'tefilat_haderech', weekday, 'ויש מוסיפים פסוקים אלה לשמירה')).toMatch(
      /ויעקב הלך לדרכו/,
    );
  });
});

describe('asher_yatzar', () => {
  const weekday = day(3, months.CHESHVAN, 5787);
  const blessing = /אשר יצר את האדם בחכמה/;
  const morningBlessing = (nusach: Nusach) => {
    const segment = resolveSiddurText(load(nusach, 'birchot_hashachar'), weekday)
      .flatMap((section) => section.segments)
      .find((candidate) =>
        blessing.test(
          letters(
            candidate.he
              .flat()
              .map((run) => run.t)
              .join(' '),
          ),
        ),
      )!;
    return letters(
      segment.he
        .flat()
        .filter((run) => run.s !== 'n')
        .map((run) => run.t)
        .join(' '),
    ).trim();
  };

  it('says the very blessing of the morning blessings, letter for letter, in every nusach', () => {
    for (const nusach of NUSCHAOT) {
      const said = saidOn(nusach, 'asher_yatzar', weekday).trim();
      expect(said).toBe(morningBlessing(nusach));
      expect(said).toMatch(blessing);
      expect(said).toMatch(/רופא כל בשר ומפליא לעשות/);
      expect(count(said, blessing)).toBe(1);
    }
  });

  it('is one section titled Asher Yatzar, with neither the washing nor Elokai Neshama, and the source English where the source has one', () => {
    for (const nusach of NUSCHAOT) {
      const sections = resolveSiddurText(load(nusach, 'asher_yatzar'), weekday);
      expect(sections.map((section) => section.title.he)).toEqual(['אשר יצר']);
      expect(shownOn(nusach, 'asher_yatzar', weekday)).not.toMatch(/נטילת ידים|נשמה שנתת/);
      const english = sections[0].segments.map((segment) => segment.en ?? '').join(' ');
      if (nusach !== 'chabad') expect(english).toMatch(/Who formed man with wisdom/);
    }
  });

  it('shows the Edot HaMizrach timing note as an instruction, never as said text', () => {
    expect(shownOn('edot_hamizrach', 'asher_yatzar', weekday)).toMatch(/יברך תוך חצי שעה/);
    expect(saidOn('edot_hamizrach', 'asher_yatzar', weekday)).not.toMatch(/חצי שעה/);
  });

  it('leaves the Edot HaMizrach timing note without English, because the source English drops the half hour and adds a hand washing', () => {
    const [note, blessingSegment] = resolveSiddurText(load('edot_hamizrach', 'asher_yatzar'), weekday)[0].segments;
    expect(note.he.flat().every((run) => run.s === 'n')).toBe(true);
    expect(note.en).toBeUndefined();
    expect(blessingSegment.en).toMatch(/Who formed man with wisdom/);
    expect(JSON.stringify(load('edot_hamizrach', 'asher_yatzar'))).not.toMatch(/wash hands/);
  });

  it('reads the same on every day, in Israel and abroad, because nothing in it depends on the date', () => {
    for (const place of [ISRAEL, DIASPORA]) {
      const days: [DayFlag, DayFeatures][] = [
        ['shabbat', civilDay(new Date(2026, 9, 10), place)],
        ['roshChodesh', day(1, months.CHESHVAN, 5787, place)],
        ['yomTov', day(15, months.TISHREI, 5787, place)],
        ['yomKippur', day(10, months.TISHREI, 5787, place)],
        ['cholHamoedSukkot', day(18, months.TISHREI, 5787, place)],
        ['chanukah', day(27, months.KISLEV, 5787, place)],
        ['publicFast', day(10, months.TEVET, 5787, place)],
        ['purim', day(14, months.ADAR_II, 5787, place)],
        ['tishaBav', day(9, months.AV, 5786, place)],
      ];
      for (const [flag, features] of days) {
        expect(features.flags.has(flag)).toBe(true);
        for (const nusach of NUSCHAOT) {
          expect(shownOn(nusach, 'asher_yatzar', features)).toBe(shownOn(nusach, 'asher_yatzar', weekday));
          expect(resolveSiddurText(load(nusach, 'asher_yatzar'), features)).toEqual(
            resolveSiddurText(load(nusach, 'asher_yatzar'), weekday),
          );
        }
      }
    }
  });
});

describe('birchot_hanehenin', () => {
  const weekday = day(3, months.CHESHVAN, 5787);
  const TITLES = [
    'נטילת ידיים לסעודה',
    'המוציא',
    'בורא מיני מזונות',
    'בורא פרי הגפן',
    'בורא פרי העץ',
    'בורא פרי האדמה',
    'שהכל נהיה בדברו',
    'ברכות הריח',
    'שהחיינו',
  ];
  const FORMULAS: [string, RegExp][] = [
    ['המוציא', /המוציא לחם מן הארץ/],
    ['בורא מיני מזונות', /בורא מיני מזונות/],
    ['בורא פרי הגפן', /בורא פרי הגפן/],
    ['בורא פרי העץ', /בורא פרי העץ/],
    ['בורא פרי האדמה', /בורא פרי האדמה/],
    ['שהכל נהיה בדברו', /שהכל נהיה בדברו/],
  ];
  const WASHING_INTENTION = 'יש אומרים לשם יחוד ותפילה לפני נטילת ידיים';
  const BREAD_VERSES = 'יש נוהגים לומר "עיני כל" לפני ברכת המוציא';
  const PATACH = 0x05b7;
  const HIRIQ = 0x05b4;
  const lamedZayin = (vowel: number) => String.fromCodePoint(0x05dc, vowel, 0x05d6);
  const lazman = (vowel: number) =>
    `${lamedZayin(vowel)}${String.fromCodePoint(0x05b0, 0x05bc, 0x05de, 0x05b7, 0x05df)}`;
  const pointed = (nusach: Nusach, id: SiddurTextId) =>
    load(nusach, id)
      .sections.flatMap((section) => section.segments.flatMap((segment) => segment.he.flat().map((run) => run.t)))
      .join(' ');
  const sectionsOf = (nusach: Nusach, features: DayFeatures = weekday) =>
    resolveSiddurText(load(nusach, 'birchot_hanehenin'), features);
  const sectionTitled = (nusach: Nusach, title: string) =>
    sectionsOf(nusach).find((section) => section.title.he === title)!;
  const saidInSection = (nusach: Nusach, title: string) =>
    letters(
      sectionTitled(nusach, title)
        .segments.flatMap((segment) =>
          segment.he
            .flat()
            .filter((run) => run.s !== 'n')
            .map((run) => run.t),
        )
        .join(' '),
    );
  const englishInSection = (nusach: Nusach, title: string) =>
    sectionTitled(nusach, title)
      .segments.map((segment) => segment.en ?? '')
      .filter(Boolean)
      .join(' ');

  it('carries the blessings over bread and over each kind of food, each under its own title, in every nusach', () => {
    for (const nusach of NUSCHAOT) {
      for (const [title, formula] of FORMULAS) expect(saidInSection(nusach, title)).toMatch(formula);
    }
  });

  it('lists the sections in a fixed order, and never repeats a title', () => {
    for (const nusach of NUSCHAOT) {
      const sections = sectionsOf(nusach);
      expect(sections.map((section) => section.title.he)).toEqual(TITLES);
      expect(new Set(sections.map((section) => section.title.en)).size).toBe(TITLES.length);
    }
  });

  it('says each food blessing once, with no day condition or minyan label, and folds only the two Edot HaMizrach customs', () => {
    for (const nusach of NUSCHAOT) {
      const said = saidOn(nusach, 'birchot_hanehenin', weekday);
      for (const [, formula] of FORMULAS) expect(count(said, formula)).toBe(1);
      const folded = new Set<string>();
      for (const segment of load(nusach, 'birchot_hanehenin').sections.flatMap((section) => section.segments)) {
        expect(segment.when).toBeUndefined();
        expect(segment.minyan).toBeUndefined();
        if (segment.optional) folded.add(segment.optional.he);
      }
      expect([...folded]).toEqual(nusach === 'edot_hamizrach' ? [WASHING_INTENTION, BREAD_VERSES] : []);
    }
  });

  it('says Borei Minei Besamim in every nusach, and Atzei and Isvei Besamim wherever the nusach has them', () => {
    for (const nusach of NUSCHAOT) expect(saidInSection(nusach, 'ברכות הריח')).toMatch(/בורא מיני בשמים/);
    for (const nusach of ['ashkenaz', 'sefard', 'edot_hamizrach'] as Nusach[]) {
      expect(count(saidInSection(nusach, 'ברכות הריח'), /בורא עצי בשמים/)).toBe(1);
      expect(count(saidInSection(nusach, 'ברכות הריח'), /בורא עשבי בשמים/)).toBe(1);
    }
    expect(saidInSection('ashkenaz', 'ברכות הריח')).toMatch(/בורא מיני בשמים.*בורא עצי בשמים.*בורא עשבי בשמים/);
    expect(saidInSection('sefard', 'ברכות הריח')).toMatch(/הנותן ריח טוב בפירות/);
    expect(saidInSection('sefard', 'ברכות הריח')).toMatch(/בורא שמן ערב/);
    expect(
      load('ashkenaz', 'birchot_hanehenin')
        .sections.map((section) => JSON.stringify(section))
        .join(''),
    ).not.toContain('\u05E9\u05B9');
  });

  it('ends with Shehecheyanu in every nusach', () => {
    for (const nusach of NUSCHAOT) expect(saidInSection(nusach, 'שהחיינו')).toMatch(/שהחינו וקימנו והגיענו לזמן הזה/);
  });

  it('writes the divine name as each nusach does', () => {
    for (const nusach of ['ashkenaz', 'sefard', 'edot_hamizrach'] as Nusach[]) {
      expect(saidOn(nusach, 'birchot_hanehenin', weekday)).toMatch(/ברוך אתה יהוה אלהינו/);
      expect(saidOn(nusach, 'birchot_hanehenin', weekday)).not.toMatch(/(^| )יי( |$)|\u2011/);
    }
    expect(saidOn('chabad', 'birchot_hanehenin', weekday)).toMatch(/ברוך אתה יי אלהינו/);
    expect(saidOn('chabad', 'birchot_hanehenin', weekday)).not.toMatch(/יהוה/);
  });

  it('keeps each source’s note on what takes the blessing as an instruction, never as said text', () => {
    const notes: [Nusach, RegExp][] = [
      ['ashkenaz', /על היין מברך/],
      ['ashkenaz', /הלובש מלבוש חדש/],
      ['sefard', /על ריח טוב שבעצים ושיחים מברך/],
      ['edot_hamizrach', /על ריח טוב שבעצים מברך/],
      ['chabad', /לשאר כל אוכלין ומשקין חוץ מן היין והפת/],
    ];
    for (const [nusach, note] of notes) {
      expect(shownOn(nusach, 'birchot_hanehenin', weekday)).toMatch(note);
      expect(saidOn(nusach, 'birchot_hanehenin', weekday)).not.toMatch(note);
    }
  });

  it('shows nothing that Edot HaMizrach says only at the Shabbat meal', () => {
    expect(shownOn('edot_hamizrach', 'birchot_hanehenin', weekday)).not.toMatch(
      /ככרות|אחר הקידוש|סעודה ראשונה|של שבת|במלח|ויש נוהגים|ויש אומרים/,
    );
  });

  it('folds the Edot HaMizrach washing intention and the verses before bread under the label the source gives each, open on every day', () => {
    const labelsOf = (title: string) =>
      sectionTitled('edot_hamizrach', title).segments.map((segment) => segment.optional?.he ?? null);
    expect(labelsOf('נטילת ידיים לסעודה')).toEqual([WASHING_INTENTION, WASHING_INTENTION, null]);
    expect(labelsOf('המוציא')).toEqual([BREAD_VERSES, null]);

    const days = [
      weekday,
      day(1, months.CHESHVAN, 5787),
      day(18, months.TISHREI, 5787),
      civilDay(new Date(2026, 9, 10)),
    ];
    for (const features of days) {
      const washing = resolveSiddurText(load('edot_hamizrach', 'birchot_hanehenin'), features)[0].segments;
      expect(washing.map((segment) => segment.optional?.he ?? null)).toEqual([
        WASHING_INTENTION,
        WASHING_INTENTION,
        null,
      ]);
    }

    const folded = (title: string) =>
      letters(
        sectionTitled('edot_hamizrach', title)
          .segments.filter((segment) => segment.optional)
          .flatMap((segment) => segment.he.flat().map((run) => run.t))
          .join(' '),
      ).trim();
    expect(folded('נטילת ידיים לסעודה')).toMatch(
      /^לשם יחוד קדשא בריך הוא.*ויהי רצון מלפניך יהוה אלהינו ואלהי אבותינו שבזכות מצות הברכה.*ורב דגן ותירש יעבדוך עמים וישתחוו לך לאמים/,
    );
    expect(folded('נטילת ידיים לסעודה')).not.toMatch(/ברוך אתה/);
    expect(folded('המוציא')).toMatch(/^עיני כל אליך ישברו.*לכל חי רצון$/);
    expect(saidInSection('edot_hamizrach', 'נטילת ידיים לסעודה')).not.toMatch(/[[\]]|וישתחו וישתחוו/);
  });

  it('shows the Sefard verses before the washing blessing', () => {
    expect(saidInSection('sefard', 'נטילת ידיים לסעודה')).toMatch(/שאו ידיכם קודש וברכו את יהוה.*על נטילת ידים/);
  });

  it('vowels the Chabad Shehecheyanu "lazman" with a patach under the lamed, as the Chabad candle lighting does', () => {
    expect(pointed('chabad', 'birchot_hanehenin')).toContain(lazman(PATACH));
    for (const id of ['birchot_hanehenin', 'candle_lighting'] as const) {
      expect(pointed('chabad', id)).toContain(lamedZayin(PATACH));
      expect(pointed('chabad', id)).not.toContain(lamedZayin(HIRIQ));
    }
    expect(saidInSection('chabad', 'שהחיינו')).toMatch(/שהחינו וקימנו והגיענו לזמן הזה/);
  });

  it('reads the same on every day, because nothing in it depends on the date', () => {
    const days = [
      day(1, months.CHESHVAN, 5787),
      day(18, months.TISHREI, 5787),
      day(27, months.KISLEV, 5787),
      civilDay(new Date(2026, 9, 10)),
    ];
    for (const nusach of NUSCHAOT) {
      for (const features of days) {
        expect(shownOn(nusach, 'birchot_hanehenin', features)).toBe(shownOn(nusach, 'birchot_hanehenin', weekday));
      }
    }
  });

  it('carries the source English where it aligns, and the Metsudah English of an identical blessing where it does not', () => {
    expect(englishInSection('ashkenaz', 'נטילת ידיים לסעודה')).toMatch(/washing of hands/);
    expect(englishInSection('ashkenaz', 'המוציא')).toMatch(/brings forth bread from the earth/);
    expect(englishInSection('ashkenaz', 'שהחיינו')).toMatch(/permitted us to reach this season/);
    expect(englishInSection('ashkenaz', 'ברכות הריח')).toMatch(
      /various kinds of fragrances.*fragrant trees.*fragrant herbs/,
    );
    expect(englishInSection('edot_hamizrach', 'המוציא')).toMatch(/brings forth bread from the earth/);
    expect(englishInSection('edot_hamizrach', 'בורא מיני מזונות')).toMatch(/varieties of foods/);
    expect(englishInSection('edot_hamizrach', 'שהכל נהיה בדברו')).toMatch(/all was \(made\) by His word/);
    expect(englishInSection('sefard', 'בורא פרי הגפן')).toMatch(/fruit of the vine/);
    expect(englishInSection('chabad', 'בורא פרי הגפן')).toMatch(/fruit of the vine/);
    expect(englishInSection('chabad', 'המוציא')).toBe('');
  });
});

describe('kriat_shema_al_hamita', () => {
  const ID = 'kriat_shema_al_hamita';
  const weekday = day(3, months.CHESHVAN, 5787);
  const tenDays = day(5, months.TISHREI, 5787);
  const roshChodesh = day(1, months.CHESHVAN, 5787);
  const afterRoshChodesh = day(2, months.CHESHVAN, 5787);
  const shabbat = day(6, months.CHESHVAN, 5787);
  const motzaeiShabbat = day(7, months.CHESHVAN, 5787);
  const chanukah = day(27, months.KISLEV, 5787);
  const purim = day(14, months.ADAR_II, 5787);
  const roshHashana = day(1, months.TISHREI, 5787);
  const yomKippur = day(10, months.TISHREI, 5787);
  const cholHamoed = day(18, months.TISHREI, 5787);
  const disputedTachanun = day(24, months.TISHREI, 5787);
  const secondDayYomTovAbroad = day(16, months.TISHREI, 5787, DIASPORA);
  const isruChagAbroad = day(24, months.TISHREI, 5787, DIASPORA);
  const isruChagPesachAbroad = day(23, months.NISAN, 5787, DIASPORA);
  const nightsWithoutTachanun = [roshChodesh, chanukah, purim, shabbat, roshHashana, yomKippur, cholHamoed];
  const sections = (nusach: Nusach, features: DayFeatures) => resolveSiddurText(load(nusach, ID), features);
  const OPEN_SHEMA = /והיה אם שמע תשמעו[\s\S]*ויאמר \S+ אל משה לאמר/;
  const VEHAYA_LABEL = 'מי שלא קרא קריאת שמע בזמנה, ויש נוהגים בכל לילה: גם פרשת "והיה אם שמוע"';
  const VAYOMER_LABEL = 'יש נוהגים בכל לילה לומר גם פרשת "ויאמר"';
  const openText = (nusach: Nusach, features: DayFeatures) =>
    letters(
      sections(nusach, features)
        .filter((section) => !section.optional)
        .flatMap((section) => section.segments)
        .filter((segment) => !segment.optional)
        .flatMap((segment) =>
          segment.he
            .flat()
            .filter((run) => run.s !== 'n')
            .map((run) => run.t),
        )
        .join(' '),
    );

  it('falls on the nights its fixtures claim', () => {
    expect(roshChodesh.flags.has('roshChodesh')).toBe(true);
    expect(afterRoshChodesh.flags.has('roshChodeshYesterday')).toBe(true);
    expect(shabbat.flags.has('shabbat')).toBe(true);
    expect(motzaeiShabbat.flags.has('motzaei')).toBe(true);
    expect(chanukah.flags.has('chanukah')).toBe(true);
    expect(purim.flags.has('purim')).toBe(true);
    expect(roshHashana.flags.has('yomTov')).toBe(true);
    expect(yomKippur.flags.has('yomKippur')).toBe(true);
    expect(cholHamoed.flags.has('cholHamoedSukkot')).toBe(true);
    for (const features of [weekday, tenDays, afterRoshChodesh, motzaeiShabbat, disputedTachanun]) {
      expect(features.flags.has('tachanunShacharit')).toBe(true);
    }
    for (const features of nightsWithoutTachanun) expect(features.flags.has('tachanunShacharit')).toBe(false);
    expect(disputedTachanun.flags.has('tachanunDisputed')).toBe(true);
    expect(motzaeiShabbat.flags.has('sunday')).toBe(true);
    expect(motzaeiShabbat.flags.has('motzaeiShabbat')).toBe(true);
    expect(afterRoshChodesh.flags.has('motzaeiShabbat')).toBe(false);
    expect(secondDayYomTovAbroad.flags.has('yomTov')).toBe(true);
    expect(day(16, months.TISHREI, 5787).flags.has('yomTov')).toBe(false);
    for (const features of [secondDayYomTovAbroad, isruChagAbroad, isruChagPesachAbroad]) {
      expect(features.flags.has('tachanunShacharit')).toBe(false);
    }
  });

  it('says the Hamapil blessing and the three paragraphs of the Shema in every nusach', () => {
    for (const nusach of NUSCHAOT) {
      const said = saidOn(nusach, ID, weekday);
      expect(said).toMatch(/המפיל חבלי שנה/);
      expect(said).toMatch(/שמע ישראל \S+ אלהינו \S+ (\| )?אחד/);
      expect(said).toMatch(/ואהבת את \S+ אלהיך/);
      expect(said).toMatch(OPEN_SHEMA);
    }
  });

  it('puts Hamapil before the Shema, except in Chabad, which opens with Ribbono Shel Olam and says Hamapil last', () => {
    for (const nusach of NUSCHAOT) {
      const titles = sections(nusach, weekday).map((section) => section.title.he);
      if (nusach === 'chabad') {
        expect(titles[0]).toBe('רבונו של עולם');
        expect(titles[titles.length - 1]).toBe('ברכת המפיל');
      } else {
        expect(titles).toContain('ברכת המפיל');
        expect(titles.indexOf('ברכת המפיל')).toBeLessThan(titles.indexOf('קריאת שמע'));
      }
    }
  });

  it('folds the second paragraph in Sefard for the late reader and the Ri"u custom, the third for the Ri"u custom alone, and says them in the other nusachot', () => {
    expect(openText('sefard', weekday)).not.toMatch(OPEN_SHEMA);
    const foldedText = (label: string) =>
      sections('sefard', weekday)
        .flatMap((section) => section.segments)
        .filter((segment) => segment.optional?.he === label)
        .map((segment) =>
          letters(
            segment.he
              .flat()
              .map((run) => run.t)
              .join(' '),
          ),
        );
    const vehaya = foldedText(VEHAYA_LABEL);
    const vayomer = foldedText(VAYOMER_LABEL);
    expect(vehaya).toHaveLength(1);
    expect(vehaya[0]).toMatch(/^והיה אם שמע תשמעו[\s\S]*ושמתם את דברי אלה/);
    expect(vehaya[0]).not.toMatch(/ויאמר \S+ אל משה/);
    expect(vayomer).toHaveLength(1);
    expect(vayomer[0]).toMatch(/^ויאמר \S+ אל משה לאמר[\s\S]*אמת$/);
    expect(vehaya.join(' ') + ' ' + vayomer.join(' ')).toMatch(OPEN_SHEMA);
    for (const nusach of ['ashkenaz', 'edot_hamizrach', 'chabad'] as const)
      expect(openText(nusach, weekday)).toMatch(OPEN_SHEMA);
  });

  it('drops the Sefard note on who says the other paragraphs, whose English tells the late reader to repeat all of it against its Hebrew', () => {
    const shown = shownOn('sefard', ID, weekday);
    expect(shown).not.toMatch(/מדקדק|שתי פרשיות|רמח/);
    expect(JSON.stringify(load('sefard', ID))).not.toMatch(/repeat all of it|all three paragraphs here/);
  });

  it('says the confession in Edot HaMizrach only on a night after which Tachanun is said, and tells where it waits until midnight', () => {
    const vidui = /אשמנו בגדנו גזלנו/;
    const midnight = /במוצש עד חצות הלילה/;
    for (const features of [weekday, tenDays, afterRoshChodesh, motzaeiShabbat, disputedTachanun]) {
      expect(saidOn('edot_hamizrach', ID, features)).toMatch(vidui);
    }
    for (const features of nightsWithoutTachanun) {
      expect(saidOn('edot_hamizrach', ID, features)).not.toMatch(vidui);
      expect(shownOn('edot_hamizrach', ID, features)).not.toMatch(midnight);
    }
    expect(shownOn('edot_hamizrach', ID, motzaeiShabbat)).toMatch(midnight);
    expect(shownOn('edot_hamizrach', ID, afterRoshChodesh)).toMatch(midnight);
    expect(shownOn('edot_hamizrach', ID, weekday)).not.toMatch(midnight);
    expect(shownOn('edot_hamizrach', ID, disputedTachanun)).toMatch(/יש קהילות שאינן אומרות תחנון בבוקר/);
    expect(shownOn('edot_hamizrach', ID, disputedTachanun)).not.toMatch(/תחנון היום/);
    expect(shownOn('edot_hamizrach', ID, weekday)).not.toMatch(/יש קהילות שאינן אומרות תחנון/);
    for (const features of [isruChagAbroad, secondDayYomTovAbroad, isruChagPesachAbroad]) {
      expect(saidOn('edot_hamizrach', ID, features)).not.toMatch(/אשמנו בגדנו גזלנו/);
    }
  });

  it('prints no confession in Ashkenaz and Sefard, and says Ana BeKoach every night in Edot HaMizrach and Chabad', () => {
    for (const nusach of ['ashkenaz', 'sefard'] as const)
      expect(saidOn(nusach, ID, weekday)).not.toMatch(/אשמנו בגדנו/);
    for (const nusach of ['edot_hamizrach', 'chabad'] as const) {
      for (const features of [weekday, ...nightsWithoutTachanun]) {
        expect(saidOn(nusach, ID, features)).toMatch(/אנא בכח[\s\S]*תתיר צרורה/);
      }
    }
  });

  it('follows the Chabad Sefer HaMinhagim: no Ribbono Shel Olam or Psalm 51 on Shabbat and Yom Tov, and Hashkivenu ends at the shelter of peace', () => {
    const ribbono = /רבונו של עולם הריני מוחל/;
    const psalm51 = /חנני אלהים כחסדך/;
    const hashkivenuEnd = /ופרוש עלינו סכת שלומך/;
    const hashkivenuRest = /והגן בעדנו והסר מעלינו אויב/;
    for (const features of [weekday, tenDays, roshChodesh, chanukah, purim, cholHamoed, isruChagAbroad]) {
      expect(saidOn('chabad', ID, features)).toMatch(ribbono);
      expect(saidOn('chabad', ID, features)).toMatch(psalm51);
      expect(saidOn('chabad', ID, features)).toMatch(hashkivenuRest);
    }
    for (const features of [shabbat, roshHashana, yomKippur, secondDayYomTovAbroad]) {
      const said = saidOn('chabad', ID, features);
      expect(said).not.toMatch(ribbono);
      expect(said).not.toMatch(psalm51);
      expect(said).toMatch(hashkivenuEnd);
      expect(said).not.toMatch(hashkivenuRest);
    }
  });

  it('says the Chabad confession on every night after which Tachanun is said, and omits it before a day without Tachanun', () => {
    const vidui = /אשמנו בגדנו גזלנו/;
    for (const features of [weekday, tenDays, afterRoshChodesh, motzaeiShabbat, disputedTachanun]) {
      expect(saidOn('chabad', ID, features)).toMatch(vidui);
      expect(sections('chabad', features).map((section) => section.title.he)).toContain('וידוי');
    }
    for (const features of [...nightsWithoutTachanun, secondDayYomTovAbroad, isruChagAbroad, isruChagPesachAbroad]) {
      expect(saidOn('chabad', ID, features)).not.toMatch(vidui);
      expect(sections('chabad', features).map((section) => section.title.he)).not.toContain('וידוי');
    }
  });

  it('tells where the Chabad confession waits until midnight, only where it is shown', () => {
    const midnight = /במוצאי שבת נוהגים שלא לומר וידוי עד חצות הלילה/;
    expect(shownOn('chabad', ID, motzaeiShabbat)).toMatch(midnight);
    expect(saidOn('chabad', ID, motzaeiShabbat)).not.toMatch(midnight);
    for (const features of [
      weekday,
      tenDays,
      afterRoshChodesh,
      disputedTachanun,
      ...nightsWithoutTachanun,
      secondDayYomTovAbroad,
    ]) {
      expect(shownOn('chabad', ID, features)).not.toMatch(midnight);
    }
    const yomTovAfterShabbat = day(2, months.TISHREI, 5787, DIASPORA);
    expect(yomTovAfterShabbat.flags.has('motzaeiShabbat')).toBe(true);
    expect(yomTovAfterShabbat.flags.has('yomTov')).toBe(true);
    expect(shownOn('chabad', ID, yomTovAfterShabbat)).not.toMatch(midnight);
  });

  it('keeps the acceptance of the four court penalties on every night, pending a rav on whether it follows the confession', () => {
    const penalties = /מקבל עלי סקילה[\s\S]*מקבל עלי שריפה[\s\S]*מקבל עלי הרג[\s\S]*מקבל עלי חנק/;
    for (const features of [
      weekday,
      afterRoshChodesh,
      motzaeiShabbat,
      ...nightsWithoutTachanun,
      secondDayYomTovAbroad,
      isruChagAbroad,
    ]) {
      expect(saidOn('chabad', ID, features)).toMatch(penalties);
    }
  });

  it('writes the Name in the unvocalized Chabad passages abbreviated, never spelled out', () => {
    const runs = load('chabad', ID)
      .sections.flatMap((section) => section.segments.flatMap((segment) => segment.he.flat().map((run) => run.t)))
      .join(' ');
    expect(runs).not.toMatch(/יהוה/);
    expect(runs).toContain('יהו״ה');
    expect(count(runs, /יהו״ה/)).toBe(10);
  });

  it('gives Psalm 51 as it is read, without the written form of "harev" beside the one read', () => {
    const psalm = saidOn('chabad', ID, weekday);
    expect(psalm).toMatch(/מחה פשעי הרב כבסני מעוני/);
    expect(psalm).not.toMatch(/הרבה/);
    for (const nusach of NUSCHAOT) {
      const said = load(nusach, ID).sections.flatMap((section) =>
        section.segments.flatMap((segment) =>
          segment.he
            .flat()
            .filter((run) => run.s !== 'n')
            .map((run) => run.t),
        ),
      );
      expect(said.join(' ')).not.toMatch(/[[\]]/);
    }
  });

  it('folds the passage Chabad says before marital relations, under its circumstance', () => {
    const label = 'בלילה שיש בו תשמיש המטה';
    const folded = sections('chabad', weekday).filter((section) => section.optional?.he === label);
    expect(folded.map((section) => section.title.he)).toEqual(['לפני תשמיש המטה']);
    expect(letters(folded[0].segments.flatMap((segment) => segment.he.flat().map((run) => run.t)).join(' '))).toMatch(
      /עטיפא בקיטפא/,
    );
    expect(openText('chabad', weekday)).not.toMatch(/עטיפא בקיטפא/);
  });

  it('flags the passage before marital relations as married-only, on that one label in every text', () => {
    const flagged: string[] = [];
    for (const nusach of NUSCHAOT) {
      for (const id of TEXT_IDS) {
        for (const candidate of load(nusach, id).sections) {
          if (candidate.optional?.marriedOnly)
            flagged.push(`${nusach}/${id}/${candidate.title.he}/${candidate.optional.he}`);
          for (const segment of candidate.segments) {
            for (const label of [segment.optional, segment.minyan]) {
              if (label?.marriedOnly) flagged.push(`${nusach}/${id}/${candidate.title.he}#segment/${label.he}`);
            }
          }
        }
      }
    }
    expect(flagged).toEqual(['chabad/kriat_shema_al_hamita/לפני תשמיש המטה/בלילה שיש בו תשמיש המטה']);
  });

  it('hides that passage from a single reader and folds it for a married one or one who has not answered', () => {
    const all = sections('chabad', weekday);
    const titlesOf = (list: typeof all) => list.map((candidate) => candidate.title.he);
    expect(titlesOf(all)).toContain('לפני תשמיש המטה');
    const single = forMaritalStatus(all, 'single');
    expect(titlesOf(single)).toEqual(titlesOf(all).filter((title) => title !== 'לפני תשמיש המטה'));
    expect(JSON.stringify(single)).not.toMatch(/עטיפא בקיטפא/);
    for (const status of ['married', null] as const) {
      expect(forMaritalStatus(all, status)).toEqual(all);
      expect(titlesOf(forMaritalStatus(all, status))).toContain('לפני תשמיש המטה');
    }
    for (const nusach of ['ashkenaz', 'sefard', 'edot_hamizrach'] as const) {
      const others = sections(nusach, weekday);
      expect(forMaritalStatus(others, 'single')).toEqual(others);
    }
  });

  it('shows nothing that is said only on Shabbat or Yom Tov', () => {
    for (const nusach of NUSCHAOT) {
      for (const features of [weekday, tenDays, roshChodesh, chanukah, purim, shabbat, motzaeiShabbat]) {
        expect(shownOn(nusach, ID, features)).not.toMatch(/ויכלו השמים|שיר ליום השבת|לכה דודי|מקדש השבת|שבת קדש/);
      }
    }
  });

  it('carries the source English only where it lines up, without the footnotes or the other order of the Edot HaMizrach translation', () => {
    const english = (nusach: Nusach) =>
      load(nusach, ID).sections.flatMap((section) => section.segments.map((segment) => segment.en ?? ''));
    for (const nusach of ['ashkenaz', 'sefard'] as const) {
      expect(english(nusach).join(' ')).not.toMatch(/Iyun|Then he prays|harmed by it|actual endeavors/);
      expect(english(nusach).filter(Boolean).length).toBe(english(nusach).length);
    }
    expect(english('sefard').join(' ')).not.toMatch(/— —|—is true—/);
    expect(english('sefard').join(' ')).toMatch(/I am Adonoy, your God— is true/);
    const edot = sections('edot_hamizrach', weekday).flatMap((section) => section.segments);
    const plain = (segment: SiddurText['sections'][number]['segments'][number]) =>
      letters(
        segment.he
          .flat()
          .map((run) => run.t)
          .join(' '),
      );
    expect(JSON.stringify(load('edot_hamizrach', ID))).not.toMatch(/Lay us down/);
    expect(edot.find((segment) => /בברכה זו לא יאמר/.test(plain(segment)))?.en).toBeUndefined();
    expect(edot.find((segment) => /המפיל חבלי שנה/.test(plain(segment)))?.en).toMatch(/^Blessed \[are You/);
    expect(edot.find((segment) => /^רבונו של עולם הריני מוחל/.test(plain(segment)))?.en).toMatch(
      /^Master of the Universe, behold I forgive/,
    );
    expect(JSON.stringify(load('chabad', ID).credits.map((credit) => credit.title))).not.toMatch(
      /Community Translation/,
    );
  });
});

describe('birchot_hareiya', () => {
  const weekday = day(3, months.CHESHVAN, 5787);
  const TITLES = ['ברק ורעם', 'הקשת', 'הים הגדול', 'ברכת האילנות', 'ברכות שבח והודאה'];
  const WITHOUT_SEA = TITLES.filter((title) => title !== 'הים הגדול');
  const TITLES_OF: Record<Nusach, string[]> = {
    ashkenaz: TITLES,
    sefard: TITLES,
    edot_hamizrach: WITHOUT_SEA,
    chabad: WITHOUT_SEA,
  };
  const sectionsOf = (nusach: Nusach, features: DayFeatures = weekday) =>
    resolveSiddurText(load(nusach, 'birchot_hareiya'), features);
  const sectionTitled = (nusach: Nusach, title: string) =>
    sectionsOf(nusach).find((section) => section.title.he === title)!;
  const runsOf = (nusach: Nusach, title: string, keep: (run: Run) => boolean) =>
    letters(
      sectionTitled(nusach, title)
        .segments.flatMap((segment) =>
          segment.he
            .flat()
            .filter(keep)
            .map((run) => run.t),
        )
        .join(' '),
    );
  const saidInSection = (nusach: Nusach, title: string) => runsOf(nusach, title, (run) => run.s !== 'n');
  const shownInSection = (nusach: Nusach, title: string) => runsOf(nusach, title, () => true);
  const englishInSection = (nusach: Nusach, title: string) =>
    sectionTitled(nusach, title)
      .segments.map((segment) => segment.en ?? '')
      .filter(Boolean)
      .join(' ');
  const rawIn = (nusach: Nusach, title: string) =>
    sectionTitled(nusach, title)
      .segments.flatMap((segment) => segment.he.flat().map((run) => run.t))
      .join(' ');
  const marks = (...codes: number[]) => String.fromCharCode(...codes);

  it('lists the sections in a fixed order, never repeats a title, and shows a section only where the nusach has its blessing', () => {
    for (const nusach of NUSCHAOT) {
      const sections = sectionsOf(nusach);
      expect(sections.map((section) => section.title.he)).toEqual(TITLES_OF[nusach]);
      expect(new Set(sections.map((section) => section.title.en)).size).toBe(sections.length);
    }
    expect(sectionsOf('sefard').map((section) => section.title.en)).toEqual([
      'Lightning and Thunder',
      'A Rainbow',
      'The Great Sea',
      'Trees in Blossom',
      'Further Blessings of Praise',
    ]);
  });

  it('says the lightning, thunder, rainbow and tree blessings once each, in every nusach', () => {
    for (const nusach of NUSCHAOT) {
      const lightning = saidInSection(nusach, 'ברק ורעם');
      expect(count(lightning, /עושה מעשה בראשית/)).toBe(1);
      expect(count(lightning, /שכחו וגבורתו מלא עולם/)).toBe(1);
      expect(count(saidInSection(nusach, 'הקשת'), /זוכר הברית/)).toBe(1);
      expect(
        count(saidInSection(nusach, 'ברכת האילנות'), /שלא חסר בעולמו כלום וברא בו בריות טובות ואילנות טובות/),
      ).toBe(1);
    }
  });

  it('says the great sea blessing in Ashkenaz and Sefard, and shows no such section where the nusach has no blessing for it', () => {
    expect(saidInSection('ashkenaz', 'הים הגדול')).toMatch(/שעשה את הים הגדול/);
    expect(saidInSection('sefard', 'הים הגדול')).toMatch(/עשה את הים הגדול/);
    for (const nusach of ['edot_hamizrach', 'chabad'] as Nusach[]) {
      expect(sectionsOf(nusach).some((section) => section.title.he === 'הים הגדול')).toBe(false);
      expect(shownOn(nusach, 'birchot_hareiya', weekday)).not.toMatch(/הים הגדול/);
    }
  });

  it('keeps the rainbow wording of each nusach: "ונאמן" in Ashkenaz and Chabad, none in Sefard and Edot HaMizrach', () => {
    for (const nusach of ['ashkenaz', 'chabad'] as Nusach[])
      expect(saidInSection(nusach, 'הקשת')).toMatch(/זוכר הברית ונאמן בבריתו וקים במאמרו/);
    for (const nusach of ['sefard', 'edot_hamizrach'] as Nusach[]) {
      expect(saidInSection(nusach, 'הקשת')).toMatch(/זוכר הברית נאמן בבריתו וקים במאמרו/);
      expect(saidInSection(nusach, 'הקשת')).not.toMatch(/ונאמן/);
    }
  });

  it('keeps each source’s note on what takes the blessing as an instruction, never as said text', () => {
    const notes: [Nusach, string, RegExp][] = [
      ['ashkenaz', 'ברק ורעם', /על הברקים מברך/],
      ['ashkenaz', 'ברק ורעם', /על הרעמים מברך/],
      ['ashkenaz', 'הקשת', /ואסור להסתכל/],
      ['ashkenaz', 'ברכות שבח והודאה', /על שמועות רעות מברך/],
      ['sefard', 'ברק ורעם', /על הרעמים מברך/],
      ['sefard', 'הים הגדול', /הרואה את הים הגדול מברך/],
      ['sefard', 'ברכות שבח והודאה', /הרואה חבירו החביב לו אחר ל יום/],
      ['sefard', 'ברכות שבח והודאה', /הרואה ימים גדולים או הרים גבוהים המפורסמים בגובהם מברך/],
      ['edot_hamizrach', 'ברכת האילנות', /הרואה בימי ניסן עצי פרי פורחים אומר/],
      ['edot_hamizrach', 'ברק ורעם', /המנהג לברך בלי שם ומלכות/],
      ['edot_hamizrach', 'הקשת', /ואסור להסתכל בה אלא בראיה קצרה/],
      ['chabad', 'ברק ורעם', /על הברקים מברך/],
      ['chabad', 'ברכות שבח והודאה', /על שמועות שהם טובות לו ולאחרים מברך/],
    ];
    for (const [nusach, title, note] of notes) {
      expect(shownInSection(nusach, title)).toMatch(note);
      expect(saidInSection(nusach, title)).not.toMatch(note);
    }
  });

  it('tells of Nisan and the fruit trees in an instruction that is always shown, and says the verse and the request around the blessing as the source prints them', () => {
    for (const nusach of NUSCHAOT) {
      const trees = sectionTitled(nusach, 'ברכת האילנות');
      expect(trees.optional).toBeUndefined();
      expect(shownInSection(nusach, 'ברכת האילנות')).toMatch(/ניסן/);
      expect(saidInSection(nusach, 'ברכת האילנות')).not.toMatch(/ניסן/);
    }
    expect(saidInSection('ashkenaz', 'ברכת האילנות')).toMatch(/ויהי נעם אדני אלהינו.*כוננהו.*שלא חסר בעולמו/);
    expect(saidInSection('edot_hamizrach', 'ברכת האילנות')).toMatch(
      /הבו ליהוה.*ויהי נעם אדני אלהינו.*שלא חסר בעולמו.*שתעלנו בשמחה לארצנו/,
    );
    expect(saidInSection('edot_hamizrach', 'ברכת האילנות')).not.toMatch(/סדר ברכת האילנות/);
    expect(saidInSection('edot_hamizrach', 'ברכת האילנות')).toMatch(/את שביתנו כאפיקים בנגב/);
    expect(saidInSection('edot_hamizrach', 'ברכת האילנות')).toMatch(/יוצאים והיה פריו למאכל/);
    expect(JSON.stringify(load('edot_hamizrach', 'birchot_hareiya').sections)).not.toContain('שבותנו');
    expect(saidInSection('sefard', 'ברכת האילנות')).not.toMatch(/ויהי נעם/);
    expect(saidInSection('chabad', 'ברכת האילנות')).not.toMatch(/ויהי נעם/);
  });

  it('says Hatov Vehametiv and Dayan Ha’emet under their instructions in every nusach, and the further blessings only where a source has them', () => {
    for (const nusach of NUSCHAOT) {
      expect(count(saidInSection(nusach, 'ברכות שבח והודאה'), /הטוב והמטיב/)).toBe(1);
      expect(count(saidInSection(nusach, 'ברכות שבח והודאה'), /דין האמת/)).toBe(1);
      expect(shownInSection(nusach, 'ברכות שבח והודאה')).toMatch(/על שמועות רעות מברך/);
    }
    for (const nusach of ['ashkenaz', 'sefard'] as Nusach[]) {
      expect(saidInSection(nusach, 'ברכות שבח והודאה')).toMatch(/אשר יצר אתכם בדין.*ברוך אתה יהוה מחיה המתים/);
      expect(shownInSection(nusach, 'ברכות שבח והודאה')).toMatch(/קברי ישראל שלשים יום/);
    }
    expect(saidInSection('ashkenaz', 'ברכות שבח והודאה')).not.toMatch(/קברי ישראל/);
    const sefard = saidInSection('sefard', 'ברכות שבח והודאה');
    expect(sefard).toMatch(/שחלק מחכמתו/);
    expect(sefard).toMatch(/שנתן מכבודו לבשר ודם/);
    expect(sefard).toMatch(/מודים אנחנו לך יהוה אלהינו על כל טפה וטפה/);
    expect(sefard).not.toMatch(/פדיון פטר חמור/);
    for (const nusach of ['ashkenaz', 'edot_hamizrach', 'chabad'] as Nusach[]) {
      expect(saidInSection(nusach, 'ברכות שבח והודאה')).not.toMatch(/שחלק מחכמתו|מודים אנחנו/);
    }
    for (const nusach of ['edot_hamizrach', 'chabad'] as Nusach[]) {
      expect(saidInSection(nusach, 'ברכות שבח והודאה')).not.toMatch(/יצר אתכם בדין|מחיה המתים/);
    }
  });

  it('tells a Sefard reader to bless Oseh Maaseh Bereshit on tall mountains and great seas, with the Metsudah English of that instruction', () => {
    const [instruction, blessing] = sectionTitled('sefard', 'ברכות שבח והודאה').segments;
    expect(instruction.he.flat().every((run) => run.s === 'n')).toBe(true);
    expect(
      letters(
        instruction.he
          .flat()
          .map((run) => run.t)
          .join(' '),
      ),
    ).toBe('הרואה ימים גדולים או הרים גבוהים המפורסמים בגובהם מברך');
    expect(instruction.en).toBe(
      'When seeing great seas, or tall mountains which are famous for their great height, say:',
    );
    expect(
      letters(
        blessing.he
          .flat()
          .map((run) => run.t)
          .join(' '),
      ),
    ).toBe('ברוך אתה יהוה אלהינו מלך העולם עושה מעשה בראשית');
    expect(blessing.en).toBe('Blessed are You, Adonoy our God, King of the Universe, Who makes the work of Creation.');
    expect(count(saidInSection('sefard', 'ברק ורעם'), /עושה מעשה בראשית/)).toBe(1);
  });

  it('prints Dayan Ha’emet in Edot HaMizrach as its own source does and in Sefard as the Metsudah siddur does, with English only where a source has it', () => {
    const dayan = (nusach: Nusach) =>
      sectionTitled(nusach, 'ברכות שבח והודאה').segments.find((segment) =>
        /דין האמת/.test(
          letters(
            segment.he
              .flat()
              .map((run) => run.t)
              .join(' '),
          ),
        ),
      )!;
    const text = (nusach: Nusach) =>
      dayan(nusach)
        .he.flat()
        .map((run) => run.t)
        .join('');
    const withQamats = marks(0x5d3, 0x5b7, 0x5bc, 0x5d9, 0x5b8, 0x5bc, 0x5df);
    const withPatach = marks(0x5d3, 0x5b7, 0x5bc, 0x5d9, 0x5b7, 0x5bc, 0x5df);
    expect(text('edot_hamizrach')).toContain(withQamats);
    expect(text('edot_hamizrach')).not.toContain(withPatach);
    expect(text('sefard')).toContain(withPatach);
    expect(dayan('edot_hamizrach').en).toBeUndefined();
    expect(dayan('sefard').en).toMatch(/the true Judge/);
  });

  it('repairs the source’s missing vowels and its fused word in the Edot HaMizrach trees, and Mechayeh in Sefard, pinned to the code points', () => {
    const repairs: [string, string][] = [
      [marks(0x5d1, 0x5bc, 0x5db, 0x5b8, 0x5dc, 0x5be), marks(0x5d1, 0x5b0, 0x5bc, 0x5db, 0x5b8, 0x5dc, 0x5be)],
      [marks(0x5d8, 0x5d5, 0x5bc, 0x5d1, 0x5da, 0x5b8), marks(0x5d8, 0x5d5, 0x5bc, 0x5d1, 0x5b0, 0x5da, 0x5b8)],
      [marks(0x5e1, 0x5b0, 0x5d3, 0x5bc, 0x5da), marks(0x5e1, 0x5b0, 0x5d3, 0x5b0, 0x5bc, 0x5da)],
      [marks(0x5d9, 0x5e7, 0x5bb, 0x5d9), marks(0x5d9, 0x5b0, 0x5e7, 0x5bb, 0x5d9)],
      [marks(0x5be, 0x5d9, 0x5d3, 0x5b5, 0x5d9), marks(0x5be, 0x5d9, 0x5b0, 0x5d3, 0x5b5, 0x5d9)],
      [marks(0x5db, 0x5bc, 0x5d1, 0x5b7, 0x5ea), marks(0x5db, 0x5b0, 0x5bc, 0x5d1, 0x5b7, 0x5ea)],
    ];
    const trees = rawIn('edot_hamizrach', 'ברכת האילנות');
    for (const [broken, repaired] of repairs) {
      expect(trees).not.toContain(broken);
      expect(trees).toContain(repaired);
    }
    expect(saidInSection('edot_hamizrach', 'ברכת האילנות')).toMatch(/ולשוננו רנה אז יאמרו בגוים/);
    expect(saidInSection('edot_hamizrach', 'ברכת האילנות')).not.toMatch(/רנהאז/);
    const praise = rawIn('sefard', 'ברכות שבח והודאה');
    expect(praise).not.toContain(marks(0x5de, 0x5b0, 0x5d7, 0x5b7, 0x5d9, 0x5b6, 0x5d4));
    expect(count(praise, new RegExp(marks(0x5de, 0x5b0, 0x5d7, 0x5b7, 0x5d9, 0x5b5, 0x5bc, 0x5d4)))).toBe(2);
  });

  it('writes the divine name as each nusach does, and no sin dot as a holam', () => {
    for (const nusach of ['ashkenaz', 'sefard', 'edot_hamizrach'] as Nusach[]) {
      expect(saidOn(nusach, 'birchot_hareiya', weekday)).toMatch(/ברוך אתה יהוה אלהינו/);
      expect(saidOn(nusach, 'birchot_hareiya', weekday)).not.toMatch(
        new RegExp(`(^| )יי( |$)|${String.fromCharCode(0x2011)}`),
      );
    }
    expect(saidOn('chabad', 'birchot_hareiya', weekday)).toMatch(/ברוך אתה יי אלהינו/);
    expect(saidOn('chabad', 'birchot_hareiya', weekday)).not.toMatch(/יהוה/);
    expect(JSON.stringify(load('ashkenaz', 'birchot_hareiya').sections)).not.toContain(
      String.fromCharCode(0x5e9, 0x5b9),
    );
  });

  it('says nothing optional, conditional or minyan-labelled, and reads the same on every day', () => {
    const days = [
      day(1, months.CHESHVAN, 5787),
      day(18, months.TISHREI, 5787),
      day(27, months.KISLEV, 5787),
      civilDay(new Date(2026, 9, 10)),
    ];
    for (const nusach of NUSCHAOT) {
      for (const section of load(nusach, 'birchot_hareiya').sections) {
        expect(section.optional).toBeUndefined();
        for (const segment of section.segments) {
          expect(segment.when).toBeUndefined();
          expect(segment.optional).toBeUndefined();
          expect(segment.minyan).toBeUndefined();
        }
      }
      for (const features of days)
        expect(shownOn(nusach, 'birchot_hareiya', features)).toBe(shownOn(nusach, 'birchot_hareiya', weekday));
    }
  });

  it('carries the source English where it aligns, and nowhere else', () => {
    expect(englishInSection('sefard', 'ברק ורעם')).toMatch(/Who makes the work of Creation/);
    expect(englishInSection('sefard', 'ברק ורעם')).toMatch(/for His strength and His power fill the universe\./);
    expect(englishInSection('sefard', 'ברכות שבח והודאה')).toMatch(/Who is good and does good/);
    expect(englishInSection('sefard', 'ברכות שבח והודאה')).toMatch(/King of the Universe, the true Judge/);
    expect(englishInSection('edot_hamizrach', 'ברק ורעם')).toMatch(/Maker of the works of creation/);
    expect(englishInSection('edot_hamizrach', 'ברכת האילנות')).toMatch(/has not left out anything from His world/);
    expect(englishInSection('edot_hamizrach', 'ברכות שבח והודאה')).toMatch(/Who is good and does good/);
    expect(englishInSection('edot_hamizrach', 'ברכות שבח והודאה')).not.toMatch(/the true Judge|tragic news/);
    expect(englishInSection('edot_hamizrach', 'ברכת האילנות')).toMatch(
      /Those who sow in tears will reap with joyous song/,
    );
    expect(englishInSection('sefard', 'הקשת')).toBe('');
    expect(englishInSection('edot_hamizrach', 'הקשת')).toBe('');
    for (const title of TITLES_OF.chabad) expect(englishInSection('chabad', title)).toBe('');
    for (const title of ['ברק ורעם', 'הקשת', 'הים הגדול', 'ברכות שבח והודאה'])
      expect(englishInSection('ashkenaz', title)).toBe('');
  });
});

describe('kiddush_levana', () => {
  const thirdOfMonth = day(3, months.CHESHVAN, 5787);
  const fifteenthOfMonth = day(15, months.CHESHVAN, 5787);
  const secondOfMonth = day(2, months.CHESHVAN, 5787);
  const sixteenthOfMonth = day(16, months.CHESHVAN, 5787);
  const saturdayNight = day(7, months.CHESHVAN, 5787);
  const tenDays = day(5, months.TISHREI, 5787);
  const avBeforeTishaBav = day(5, months.AV, 5786);
  const avAfterTishaBav = day(12, months.AV, 5786);
  const TISHREI_NOTE = /במוצאי יום הכיפורים/;
  const AV_NOTE = /אחר תשעה באב/;
  const sections = (nusach: Nusach, features: DayFeatures) =>
    resolveSiddurText(load(nusach, 'kiddush_levana'), features);
  const kaddishSection = (nusach: Nusach) =>
    sections(nusach, thirdOfMonth).find((section) => /^קדיש (יתום|דרבנן)$/.test(section.title.he))!;
  const segmentsOf = (nusach: Nusach) => load(nusach, 'kiddush_levana').sections.flatMap((section) => section.segments);
  const plainOf = (segment: SiddurText['sections'][number]['segments'][number]) =>
    letters(
      segment.he
        .flat()
        .map((run) => run.t)
        .join(' '),
    ).trim();
  const segmentWith = (nusach: Nusach, pattern: RegExp) =>
    segmentsOf(nusach).find((segment) => pattern.test(plainOf(segment)))!;
  const pointed = (nusach: Nusach) =>
    segmentsOf(nusach)
      .flatMap((segment) => segment.he.map((runs) => runs.map((run) => run.t).join('')))
      .join(' ')
      .normalize('NFC');

  it('falls on the days its fixtures claim', () => {
    for (const features of [
      thirdOfMonth,
      fifteenthOfMonth,
      saturdayNight,
      tenDays,
      avBeforeTishaBav,
      avAfterTishaBav,
    ]) {
      expect(features.flags.has('kiddushLevana')).toBe(true);
    }
    for (const features of [secondOfMonth, sixteenthOfMonth]) expect(features.flags.has('kiddushLevana')).toBe(false);
    expect(saturdayNight.flags.has('motzaeiShabbat')).toBe(true);
    expect(tenDays.flags.has('aseretYemeiTeshuva')).toBe(true);
    expect(avBeforeTishaBav.flags.has('avBeforeTishaBav')).toBe(true);
    expect(avAfterTishaBav.flags.has('avBeforeTishaBav')).toBe(false);
  });

  it('is offered from the 3rd to the 15th of the month, in every nusach', () => {
    for (const nusach of NUSCHAOT) {
      expect(hasStandaloneText('kiddush_levana', nusach, thirdOfMonth)).toBe(true);
      expect(hasStandaloneText('kiddush_levana', nusach, fifteenthOfMonth)).toBe(true);
      expect(hasStandaloneText('kiddush_levana', nusach, secondOfMonth)).toBe(false);
      expect(hasStandaloneText('kiddush_levana', nusach, sixteenthOfMonth)).toBe(false);
    }
  });

  it('is not offered for the night of Shabbat, Yom Tov or Yom Kippur, though it falls in the window', () => {
    const shabbat = day(6, months.CHESHVAN, 5787);
    const sukkot = day(15, months.TISHREI, 5787);
    const yomKippur = day(10, months.TISHREI, 5787);
    expect(shabbat.flags.has('shabbat')).toBe(true);
    expect(sukkot.flags.has('yomTov')).toBe(true);
    expect(yomKippur.flags.has('yomKippur')).toBe(true);
    for (const features of [shabbat, sukkot, yomKippur]) expect(features.flags.has('kiddushLevana')).toBe(true);
    for (const nusach of NUSCHAOT) {
      for (const features of [shabbat, sukkot, yomKippur])
        expect(hasStandaloneText('kiddush_levana', nusach, features)).toBe(false);
    }
  });

  it('says the blessing that renews the months in every nusach, on a Saturday night too', () => {
    for (const nusach of NUSCHAOT) {
      for (const features of [thirdOfMonth, fifteenthOfMonth, saturdayNight]) {
        expect(saidOn(nusach, 'kiddush_levana', features)).toMatch(/מחדש חדשים/);
      }
    }
  });

  it('tells in every nusach when Kiddush Levana is said, as that nusach prints it', () => {
    const shown = (nusach: Nusach) => shownOn(nusach, 'kiddush_levana', thirdOfMonth);
    expect(shown('ashkenaz')).toMatch(/מליל ג למולד ויש הממתינים עד שיעברו שבעה ימים ואין מקדשים אחר חצי החודש/);
    expect(shown('edot_hamizrach')).toMatch(/מליל ג למולד ויש הממתינים עד שיעברו שבעה ימים ואין מקדשים אחר חצי החודש/);
    expect(shown('sefard')).toMatch(/משיעברו עליה שבעת ימים מהמולד/);
    expect(shown('sefard')).not.toMatch(/מליל ג למולד/);
    expect(shown('chabad')).toMatch(/אין לקדש הלבנה עד אחר ז ימים למולד/);
    expect(shown('chabad')).not.toMatch(/מליל ג למולד/);
  });

  it('adds the Tishrei note on the Ten Days of Repentance only, and the Av note before Tisha B’Av only, in every nusach', () => {
    for (const nusach of NUSCHAOT) {
      expect(shownOn(nusach, 'kiddush_levana', tenDays)).toMatch(TISHREI_NOTE);
      for (const features of [thirdOfMonth, saturdayNight, avBeforeTishaBav, avAfterTishaBav]) {
        expect(shownOn(nusach, 'kiddush_levana', features)).not.toMatch(TISHREI_NOTE);
      }
      expect(shownOn(nusach, 'kiddush_levana', avBeforeTishaBav)).toMatch(AV_NOTE);
      for (const features of [thirdOfMonth, saturdayNight, tenDays, avAfterTishaBav]) {
        expect(shownOn(nusach, 'kiddush_levana', features)).not.toMatch(AV_NOTE);
      }
    }
  });

  it('opens with the notes, ahead of the psalm', () => {
    const first = (nusach: Nusach, features: DayFeatures) =>
      letters(
        sections(nusach, features)[0]
          .segments[0].he.flat()
          .map((run) => run.t)
          .join(' '),
      );
    expect(first('ashkenaz', thirdOfMonth)).toMatch(/מליל ג למולד/);
    expect(first('edot_hamizrach', thirdOfMonth)).toMatch(/מליל ג למולד/);
    for (const nusach of ['sefard', 'chabad'] as const) {
      expect(first(nusach, tenDays)).toMatch(TISHREI_NOTE);
      expect(first(nusach, avBeforeTishaBav)).toMatch(AV_NOTE);
    }
  });

  it('labels every line of the Kaddish after it as said by mourners, in every nusach', () => {
    for (const nusach of NUSCHAOT) {
      const kaddish = kaddishSection(nusach);
      expect(kaddish.segments.length).toBeGreaterThan(0);
      expect(
        letters(
          kaddish.segments
            .flatMap((segment) =>
              segment.he
                .flat()
                .filter((run) => run.s !== 'n')
                .map((run) => run.t),
            )
            .join(' '),
        ),
      ).toMatch(/יהא שלמא רבא/);
      for (const segment of kaddish.segments)
        expect({ nusach, label: segment.minyan?.he }).toEqual({ nusach, label: 'אבלים אומרים' });
    }
    expect(kaddishSection('edot_hamizrach').title.he).toBe('קדיש דרבנן');
    expect(saidOn('edot_hamizrach', 'kiddush_levana', thirdOfMonth)).toMatch(/על ישראל ועל רבנן/);
  });

  it('ends Ashkenaz, Sefard and Chabad with Aleinu and the mourners’ Kaddish, and Edot HaMizrach with Kaddish DeRabbanan', () => {
    const titles = (nusach: Nusach) => sections(nusach, thirdOfMonth).map((section) => section.title.he);
    expect(titles('ashkenaz')).toEqual([
      'פתיחה',
      'לשם יחוד',
      'ברכת הלבנה',
      'פסוקים ומזמורים',
      'עלינו לשבח',
      'קדיש יתום',
    ]);
    expect(titles('sefard')).toEqual(['פתיחה', 'לשם יחוד', 'ברכת הלבנה', 'פסוקים ומזמורים', 'עלינו לשבח', 'קדיש יתום']);
    expect(titles('edot_hamizrach')).toEqual([
      'פתיחה',
      'לשם יחוד',
      'ברכת הלבנה',
      'פסוקים ומזמורים',
      'קדיש דרבנן',
      'סיום',
    ]);
    expect(titles('chabad')).toEqual(['פתיחה', 'ברכת הלבנה', 'פסוקים ומזמורים', 'עלינו לשבח', 'קדיש יתום', 'אל תירא']);
    for (const nusach of ['ashkenaz', 'sefard', 'chabad'] as const)
      expect(saidOn(nusach, 'kiddush_levana', thirdOfMonth)).toMatch(/עלינו לשבח לאדון הכל/);
  });

  it('says HaShalom, and in Sefard also ulea, in the Kaddish during the Ten Days of Repentance only', () => {
    for (const nusach of ['ashkenaz', 'sefard', 'chabad'] as const) {
      expect(saidOn(nusach, 'kiddush_levana', tenDays)).toMatch(/עו?שה השלום במרומיו/);
      expect(saidOn(nusach, 'kiddush_levana', thirdOfMonth)).toMatch(/עו?שה שלום במרומיו/);
      expect(saidOn(nusach, 'kiddush_levana', thirdOfMonth)).not.toMatch(/עו?שה השלום במרומיו/);
    }
    expect(saidOn('sefard', 'kiddush_levana', tenDays)).toMatch(/לעלא ולעלא מכל ברכתא/);
    expect(saidOn('sefard', 'kiddush_levana', thirdOfMonth)).toMatch(/לעלא מן כל ברכתא/);
    expect(saidOn('sefard', 'kiddush_levana', thirdOfMonth)).not.toMatch(/ולעלא מכל/);
  });

  it('folds "Vehaya Or HaLevana" in Edot HaMizrach under the label of those who say it after the Kaddish, with the qere and not the ketiv', () => {
    const label = 'יש אומרים אחר הקדיש "והיה אור הלבנה"';
    const segments = sections('edot_hamizrach', thirdOfMonth).flatMap((section) => section.segments);
    const folded = segments.filter((segment) => segment.optional?.he === label);
    expect(folded).toHaveLength(1);
    const text = letters(
      folded[0].he
        .flat()
        .map((run) => run.t)
        .join(' '),
    );
    expect(text).toMatch(/^והיה אור הלבנה כאור החמה/);
    expect(text).toMatch(/ומלבושך שש ומשי ורקמה סלת ודבש ושמן אכלת ותיפי/);
    expect(text).not.toMatch(/ששי|אכלתי|[[\]]/);
    expect(
      segments.filter(
        (segment) =>
          !segment.optional &&
          /והיה אור הלבנה/.test(
            letters(
              segment.he
                .flat()
                .map((run) => run.t)
                .join(' '),
            ),
          ),
      ),
    ).toEqual([]);
  });

  it('gives the Ashkenaz instruction about seeing the moon no English, because the Metsudah English at that place is another note', () => {
    const instruction = sections('ashkenaz', thirdOfMonth)
      .flatMap((section) => section.segments)
      .find((segment) =>
        /אין לקדש החדש אלא בלילה/.test(
          segment.he
            .flat()
            .map((run) => run.t)
            .join(' '),
        ),
      )!;
    expect(instruction.en).toBeUndefined();
    expect(instruction.he.flat().every((run) => run.s === 'n')).toBe(true);
    for (const segment of sections('ashkenaz', thirdOfMonth).flatMap((section) => section.segments)) {
      expect(segment.en ?? '').not.toMatch(/see p\. 000/);
    }
  });

  it('opens each nusach with the wording of its own source', () => {
    expect(saidOn('ashkenaz', 'kiddush_levana', thirdOfMonth)).toMatch(/הנני מוכן ומזומן לקים המצוה/);
    expect(saidOn('sefard', 'kiddush_levana', thirdOfMonth)).toMatch(/הריני מוכן ומזמן לקים המצוה/);
    expect(saidOn('chabad', 'kiddush_levana', thirdOfMonth)).toMatch(/את יי מן השמים/);
    expect(saidOn('edot_hamizrach', 'kiddush_levana', thirdOfMonth)).toMatch(/כי אראה שמיך מעשה אצבעתיך/);
  });

  it('carries no commentary from the source footnotes in any English', () => {
    for (const nusach of NUSCHAOT) {
      const english = segmentsOf(nusach)
        .map((segment) => segment.en ?? '')
        .join(' ');
      expect(english).not.toMatch(/Hirsch|Avudraham|Mishnah Berurah|Vilna Gaon|Levush|Siddur HaGra|Baalach|\.\./);
    }
    expect(segmentWith('ashkenaz', /^יתגדל ויתקדש שמה רבא/).en).toBe('Exalted and sanctified be His great Name');
    expect(segmentWith('ashkenaz', /ברכתא ושירתא/).en).toBe(
      'above (Ten Days of Penitence: far above) all the blessings and hymns, praises and consolations which we utter in the world—and say Amein.',
    );
  });

  it('says the last verse of Psalm 150 in Ashkenaz once in the English, as the Hebrew prints it', () => {
    const psalm = segmentWith('ashkenaz', /הללו אל בקדשו/);
    expect(psalm.en?.match(/Let every soul praise God/g)).toHaveLength(1);
    expect(psalm.en).toMatch(/Praise Him with stringed instruments and flute\./);
    expect(psalm.en).toMatch(/Let every soul praise God\. Praise God\.$/);
  });

  it('ships Chabad Psalm 150 in two paragraphs without English, because the only English for that Hebrew is a Metsudah leaf that carries commentary', () => {
    const all = segmentsOf('chabad');
    const body = all.findIndex((segment) => /הללו אל בקדשו/.test(plainOf(segment)));
    expect(body).toBeGreaterThan(-1);
    expect(plainOf(all[body])).toMatch(/הללו אל בקדשו.*בצלצלי תרועה$/);
    expect(plainOf(all[body])).not.toMatch(/כל הנשמה/);
    expect(plainOf(all[body + 1])).toBe('כל הנשמה תהלל יה הללויה כל הנשמה תהלל יה הללויה');
    expect(all[body].en).toBeUndefined();
    expect(all[body + 1].en).toBeUndefined();
  });

  it('gives the Edot HaMizrach passages whose English does not say what the Hebrew says none, and trims the rest to the Hebrew', () => {
    const edot = (pattern: RegExp) => segmentWith('edot_hamizrach', pattern);
    expect(edot(/השמים מספרים כבוד אל/).en).toBeUndefined();
    expect(edot(/ברוך יוצריך ברוך עושיך ברוך קוניך/).en).toBeUndefined();
    expect(edot(/^יאמר מבסימן טוב עד עליהם תפל שלש פעמים$/).en).toBeUndefined();
    expect(JSON.stringify(load('edot_hamizrach', 'kiddush_levana'))).not.toMatch(
      /The heavens declare|prays over them|your Redeemer, blessed be your Creator/,
    );
    expect(edot(/^צורי בעולם הזה וגואלי לעולם הבא/).en).toBe(
      'My Rock in this world and my Redeemer in the world to come. I will cut off all the horns of the wicked, but the horns of the righteous will be exalted.',
    );
    expect(edot(/^כשיאמר כי אראה שמיך/).en).toBe(
      'When he says, "For I will see your heavens, the work of your fingers," he will look at the moon, but when he begins to recite the blessing, he will no longer look at it at all.',
    );
    const omens = segmentsOf('edot_hamizrach').filter((segment) => plainOf(segment) === 'בסימן טוב תהי לנו ולכל ישראל');
    expect(omens.map((segment) => segment.en)).toEqual(
      Array(3).fill('May it be a good omen for us and for all of Yisrael.'),
    );
  });

  it('prints the Sefard blessing and psalms with every vowel the source left out or wrote as a dagesh, without a changed letter', () => {
    const text = pointed('sefard');
    const corrected = [
      'הַמִּצְוָה',
      'שֶׁלֹּא יְשַׁנּוּ',
      'כְּבוֹד מַלְכוּתוֹ',
      'בָּרוּךְ יוֹצְרֵךְ',
      'קוֹל דּוֹדִי',
      'שֶׁבַּשָּׁמַיִם',
      'דַּיָּם',
      'אַבַּיֵּי',
      'מִי זֹאת עוֹלָה',
      'כְּמוֹ שֶׁהָיְתָה',
      'הַמְּאֹרוֹת',
    ];
    for (const form of corrected) expect(text).toContain(form.normalize('NFC'));
    const typos = [
      'הַמִצְוָה',
      'שֶׁלּא',
      'מַלְכוּתו(?!ֹ)',
      'יוצְרֵךְ',
      'דּודִי',
      'שֶׁבַּשָׁמַיִם',
      'דַּיָם',
      'אַבַּיֵי',
      'עולָה',
      'כְּמו ',
      'הַמְּארוֹת',
    ];
    for (const typo of typos) expect(text).not.toMatch(new RegExp(typo.normalize('NFC')));
  });

  it('ends each Hebrew note with a full stop and spells Tisha B’Av in the Av note as the other notes do', () => {
    for (const nusach of NUSCHAOT) {
      const notes = segmentsOf(nusach).filter(
        (segment) =>
          segment.he.flat().every((run) => run.s === 'n') && /לקדש את הלבנה|מקדשים את הלבנה/.test(plainOf(segment)),
      );
      expect(notes.length).toBeGreaterThan(0);
      for (const note of notes)
        expect(
          note.he
            .flat()
            .map((run) => run.t)
            .join(''),
        ).toMatch(/\.$/);
    }
    expect(segmentWith('sefard', /^בחודש אב נוהגים/).en).toBe("In Av the custom is to say it after Tisha B'Av.");
  });
});

describe('mezuzah', () => {
  const weekday = day(3, months.CHESHVAN, 5787);
  const nameOf = (nusach: Nusach) => (nusach === 'chabad' ? 'יי' : 'יהוה');
  const sectionsOf = (nusach: Nusach, features: DayFeatures = weekday) =>
    resolveSiddurText(load(nusach, 'mezuzah'), features);
  const englishOf = (nusach: Nusach) =>
    sectionsOf(nusach)
      .flatMap((section) => section.segments.map((segment) => segment.en ?? ''))
      .filter(Boolean)
      .join(' ');
  const OTHER_MITZVOT =
    /מעקה|טבילת כלי|להפריש חלה|פטר חמור|שהחיינו|מעשה בראשית|שכחו וגבורתו|זוכר הברית|הטוב והמטיב|דיין האמת|מיני בשמים|אילנות|תפילין|ציצית|נטילת ידי|המוציא|פרי הגפן|פרי העץ|פרי האדמה|שהכל/;

  it('says the blessing on affixing a mezuzah once in every nusach, with the divine name as that nusach spells it', () => {
    for (const nusach of NUSCHAOT) {
      const said = saidOn(nusach, 'mezuzah', weekday);
      expect(said).toMatch(
        new RegExp(`ברוך אתה ${nameOf(nusach)} אלהינו מלך העולם אשר קדשנו במצותיו וצונו לקבו?ע מזוזה`),
      );
      expect(count(said, /ברוך אתה/)).toBe(1);
      expect(count(said, /וצונו לקבו?ע מזוזה/)).toBe(1);
      expect(shownOn(nusach, 'mezuzah', weekday)).toMatch(/לקבו?ע מזוזה/);
    }
  });

  it('is one section named for affixing a mezuzah, with nothing from the mitzvot that neighbour it in the sources', () => {
    for (const nusach of NUSCHAOT) {
      const sections = sectionsOf(nusach);
      expect(sections.map((section) => section.title.he)).toEqual(['קביעת מזוזה']);
      expect(sections.map((section) => section.title.en)).toEqual(['Affixing a Mezuzah']);
      expect(shownOn(nusach, 'mezuzah', weekday)).not.toMatch(OTHER_MITZVOT);
    }
  });

  it('shows the instruction around the blessing as an instruction, never as said text', () => {
    for (const nusach of ['ashkenaz', 'edot_hamizrach'] as const) {
      expect(shownOn(nusach, 'mezuzah', weekday)).toMatch(/מזוזת ימין הנכנס.*שליש העליון.*זקופה/);
      expect(saidOn(nusach, 'mezuzah', weekday)).not.toMatch(/מזוזת ימין|שליש העליון|זקופה|ינשקנה/);
    }
    for (const nusach of ['sefard', 'chabad'] as const) {
      expect(shownOn(nusach, 'mezuzah', weekday)).toMatch(/הקובע מזוזה מברך/);
      expect(saidOn(nusach, 'mezuzah', weekday)).not.toMatch(/הקובע/);
    }
  });

  it('adds the kiss and "Zeh HaShaar" only where the source prints them, with the Ashkenaz name spelled as everywhere else', () => {
    for (const nusach of ['ashkenaz', 'edot_hamizrach'] as const) {
      expect(shownOn(nusach, 'mezuzah', weekday)).toMatch(/ואחר שיקבענה ינשקנה ויאמר/);
      expect(saidOn(nusach, 'mezuzah', weekday).trim()).toMatch(/זה השער ליהוה צדיקים יבאו בו$/);
    }
    for (const nusach of ['sefard', 'chabad'] as const) {
      expect(shownOn(nusach, 'mezuzah', weekday)).not.toMatch(/השער|ינשקנה/);
    }
  });

  it('says the Edot HaMizrach Leshem Yichud, which the source prints in small print, before the blessing', () => {
    const said = saidOn('edot_hamizrach', 'mezuzah', weekday).trim();
    expect(said).toMatch(/^לשם יחוד קדשא בריך הוא.*הריני בא לקים מצות עשה דאוריתא לקבע מזוזה.*ברוך אתה יהוה/);
  });

  it('carries the source English of Ashkenaz and Edot HaMizrach only, and none for Sefard and Chabad', () => {
    for (const nusach of ['ashkenaz', 'edot_hamizrach'] as const) {
      expect(englishOf(nusach)).toMatch(/commanded us to affix (?:the|a) mezuzah/);
    }
    expect(sectionsOf('ashkenaz')[0].segments[0].en).toBeUndefined();
    expect(englishOf('ashkenaz')).toMatch(/kiss it and say/);
    expect(englishOf('edot_hamizrach')).toMatch(/\(Deuteronomy 6:9\)/);
    expect(englishOf('edot_hamizrach')).not.toMatch(/6:19/);
    expect(englishOf('edot_hamizrach')).toMatch(/to unite the Name of/);
    expect(englishOf('edot_hamizrach')).not.toMatch(/the name the Name/);
    expect(englishOf('sefard')).toBe('');
    expect(englishOf('chabad')).toBe('');
  });

  it('reads the same on every day, in Israel and abroad, because nothing in it depends on the date', () => {
    for (const nusach of NUSCHAOT) {
      const segments = load(nusach, 'mezuzah').sections.flatMap((section) => section.segments);
      expect(segments.length).toBeGreaterThan(0);
      for (const segment of segments) {
        expect(segment.when).toBeUndefined();
        expect(segment.optional).toBeUndefined();
        expect(segment.minyan).toBeUndefined();
      }
    }
    for (const place of [ISRAEL, DIASPORA]) {
      const days: [DayFlag, DayFeatures][] = [
        ['shabbat', civilDay(new Date(2026, 9, 10), place)],
        ['roshChodesh', day(1, months.CHESHVAN, 5787, place)],
        ['yomTov', day(15, months.TISHREI, 5787, place)],
        ['yomKippur', day(10, months.TISHREI, 5787, place)],
        ['cholHamoedSukkot', day(18, months.TISHREI, 5787, place)],
        ['chanukah', day(27, months.KISLEV, 5787, place)],
        ['publicFast', day(10, months.TEVET, 5787, place)],
        ['purim', day(14, months.ADAR_II, 5787, place)],
        ['tishaBav', day(9, months.AV, 5786, place)],
      ];
      for (const [flag, features] of days) {
        expect(features.flags.has(flag)).toBe(true);
        for (const nusach of NUSCHAOT) {
          expect(sectionsOf(nusach, features)).toEqual(sectionsOf(nusach));
        }
      }
    }
  });
});

describe('sheva_berachot', () => {
  const weekday = day(3, months.CHESHVAN, 5787);
  const roshChodesh = day(1, months.CHESHVAN, 5787);
  const WITH_MINYAN = 'נאמר רק במניין';
  const HAGAFEN = /בורא פרי הגפן/;
  const WEDDING = [/שהכל ברא לכבודו/, /יוצר האדם/, /משמח ה?חתן עם הכלה/];
  const SEVEN = [...WEDDING, HAGAFEN];
  const marks = (...codes: number[]) => String.fromCodePoint(...codes).normalize('NFC');
  const BETZELEM_DAGESH = marks(0x5d1, 0x5b0, 0x5bc, 0x5e6, 0x5b6, 0x5bc, 0x5bd, 0x5dc, 0x5b6, 0x5dd);
  const TSADE_DAGESH = marks(0x5e6, 0x5b6, 0x5bc);
  const BETZELEM_START = marks(0x5d1, 0x5b0, 0x5bc, 0x5e6, 0x5b6);
  const NAME_ON_VAV = marks(0x5d9, 0x5b0, 0x5d4, 0x5d5, 0x5b8, 0x5b9, 0x5d4);
  const NAME_ON_HE = marks(0x5d9, 0x5b0, 0x5d4, 0x5b9, 0x5d5, 0x5b8, 0x5d4);
  const IN_ORDER = [
    /שהכל ברא לכבודו/,
    /יוצר האדם/,
    /אשר יצר את האדם/,
    /משמח ציון בבניה/,
    /משמח חתן וכלה/,
    /אשר ברא ששון ושמחה/,
    /משמח ה?חתן עם הכלה/,
  ];
  const segmentsOf = (nusach: Nusach) => load(nusach, 'sheva_berachot').sections.flatMap((section) => section.segments);
  const saidBy = (segment: { he: Run[][] }) =>
    letters(
      segment.he
        .flat()
        .filter((run) => run.s !== 'n')
        .map((run) => run.t)
        .join(' '),
    ).trim();
  const shownBy = (segment: { he: Run[][] }) =>
    letters(
      segment.he
        .flat()
        .map((run) => run.t)
        .join(' '),
    ).trim();
  const printed = (nusach: Nusach) =>
    segmentsOf(nusach)
      .flatMap((segment) => segment.he.flat().map((run) => run.t))
      .join(' ')
      .normalize('NFC');
  const occurrences = (text: string, part: string) => text.split(part).length - 1;

  it('says the seven blessings in every nusach, in the order that nusach prints them', () => {
    for (const nusach of NUSCHAOT) {
      const said = saidOn(nusach, 'sheva_berachot', weekday);
      for (const blessing of SEVEN) expect(said).toMatch(blessing);
      expect(count(said, /ברוך אתה/)).toBe(9);
      expect(count(said, /בורא פרי הגפן/)).toBe(1);
      const positions = IN_ORDER.map((pattern) => said.search(pattern));
      expect(positions[0]).toBeGreaterThanOrEqual(0);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      const hagafen = said.search(/בורא פרי הגפן/);
      if (nusach === 'edot_hamizrach') expect(hagafen).toBeLessThan(positions[0]);
      else expect(hagafen).toBeGreaterThan(positions[6]);
    }
  });

  it('says the six wedding blessings only with a minyan, and not the wine blessing or the call before it', () => {
    for (const nusach of NUSCHAOT) {
      const segments = segmentsOf(nusach);
      const blessings = segments.filter((segment) => /ברוך אתה/.test(saidBy(segment)));
      expect(blessings).toHaveLength(7);
      const wine = blessings.filter((segment) => HAGAFEN.test(saidBy(segment)));
      const wedding = blessings.filter((segment) => !HAGAFEN.test(saidBy(segment)));
      expect(wine).toHaveLength(1);
      expect(wine[0].minyan).toBeUndefined();
      expect(wedding).toHaveLength(6);
      expect(wedding.map((segment) => segment.minyan?.he)).toEqual(wedding.map(() => WITH_MINYAN));
      for (const blessing of WEDDING) {
        const carriers = segments.filter((segment) => blessing.test(saidBy(segment)));
        expect(carriers.length).toBeGreaterThan(0);
        expect(carriers.map((segment) => segment.minyan?.he)).toEqual(carriers.map(() => WITH_MINYAN));
      }
      expect(segments.filter((segment) => segment.minyan)).toHaveLength(6);
    }
  });

  it('keeps the instructions each nusach prints, the call before the wine and the wine blessing outside the minyan label', () => {
    const unlabeled = (nusach: Nusach) =>
      segmentsOf(nusach)
        .filter((segment) => !segment.minyan)
        .map(shownBy);
    const wine = expect.stringMatching(/^ברוך אתה .*בורא פרי הגפן$/);
    expect(unlabeled('ashkenaz')).toEqual(['אחר ברכת המזון מברכים שבע ברכות על כוס שני', 'המזמן מברך', wine]);
    expect(unlabeled('sefard')).toEqual(['בשבע ברכות שלאחר ברכת המזון מתחילים כאן ומסיימים בבורא פרי הגפן', wine]);
    expect(unlabeled('edot_hamizrach')).toEqual([expect.stringMatching(/^סברי מרנן/), wine]);
    expect(unlabeled('chabad')).toEqual([wine]);
  });

  it('is the same on every day, and leaves out the wedding ceremony and the zimun', () => {
    for (const nusach of NUSCHAOT) {
      const shown = shownOn(nusach, 'sheva_berachot', weekday);
      expect(shownOn(nusach, 'sheva_berachot', roshChodesh)).toBe(shown);
      expect(shown).not.toMatch(/נברך|שאכלנו משלו|מקודשת לי|מקדש עמו ישראל/);
      expect(shown).not.toMatch(/וטועמים|שובר|לזכרון ירושלם|אם אשכחך/);
    }
  });

  it('prints betzelem without the dagesh the Metsudah leaves add, and the Sefard divine name with the holam on the he', () => {
    for (const nusach of NUSCHAOT) {
      expect(printed(nusach)).not.toContain(TSADE_DAGESH);
      expect(printed(nusach)).toContain(BETZELEM_START);
    }
    for (const nusach of ['ashkenaz', 'sefard'] as const) {
      expect(printed(nusach)).not.toContain(BETZELEM_DAGESH);
    }
    const sefard = printed('sefard');
    expect(occurrences(sefard, NAME_ON_VAV)).toBe(0);
    expect(occurrences(sefard, NAME_ON_HE)).toBe(count(saidOn('sefard', 'sheva_berachot', weekday), /יהוה/));
    expect(occurrences(sefard, NAME_ON_HE)).toBe(10);
  });

  it('translates the blessings without list numbers or the source typo', () => {
    for (const nusach of NUSCHAOT) {
      expect(
        segmentsOf(nusach)
          .map((segment) => segment.en ?? '')
          .filter((en) => /^\d|King of the verse/.test(en)),
      ).toEqual([]);
    }
    for (const nusach of ['ashkenaz', 'sefard'] as const) {
      const segments = segmentsOf(nusach);
      expect(segments.every((segment) => segment.en)).toBe(true);
      expect(count(segments.map((segment) => segment.en).join(' '), /King of the Universe/)).toBe(5);
    }
  });
});

describe('chanukah_candles', () => {
  const ID = 'chanukah_candles';
  const first = new HDate(25, months.KISLEV, 5787);
  const eightNights = Array.from({ length: 8 }, (_, index) => dayFeatures(first.add(index), ISRAEL));
  const firstNight = day(25, months.KISLEV, 5787);
  const afterShabbat = day(26, months.KISLEV, 5787);
  const plainNight = day(27, months.KISLEV, 5787);
  const lastNight = day(2, months.TEVET, 5787);
  const beforeChanukah = day(24, months.KISLEV, 5787);
  const afterChanukah = day(3, months.TEVET, 5787);
  const otherNights = eightNights.slice(1);
  const jerusalem = { name: 'Jerusalem', lat: 31.7683, lng: 35.2137, tz: 'Asia/Jerusalem', inIsrael: true };
  const nightIn = (iso: string) => dayFeatures(standaloneTextDay(ID, new Date(iso), jerusalem), ISRAEL);
  const sections = (nusach: Nusach, features: DayFeatures) => resolveSiddurText(load(nusach, ID), features);
  const sectionNamed = (nusach: Nusach, features: DayFeatures, title: string) =>
    sections(nusach, features).find((section) => section.title.he === title)!;
  const saidInSection = (nusach: Nusach, features: DayFeatures, title: string) =>
    letters(
      sectionNamed(nusach, features, title)
        .segments.flatMap((segment) =>
          segment.he.map((runs) =>
            runs
              .filter((run) => run.s !== 'n')
              .map((run) => run.t)
              .join(''),
          ),
        )
        .join(' '),
    ).trim();
  const TITLES: Record<Nusach, string[]> = {
    ashkenaz: ['ברכות הדלקת נרות חנוכה', 'הנרות הללו', 'מעוז צור'],
    sefard: [
      'הנחת הנרות',
      'לשם יחוד',
      'ברכות הדלקת נרות חנוכה',
      'הנרות הללו',
      'מעוז צור',
      'מזמור שיר חנוכת הבית',
      'מזמור קיא',
      'מזמור קיב',
      'ויהי נועם ויושב בסתר',
      'מזמור סז',
      'אנא בכח',
      'מזמור לג',
      'מזמור קלג',
    ],
    edot_hamizrach: [
      'לשם יחוד',
      'ברכות הדלקת נרות חנוכה',
      'הנרות הללו',
      'מזמור שיר חנוכת הבית',
      'ויהי נועם ויושב בסתר',
      'מעוז צור',
    ],
    chabad: ['ברכות הדלקת נרות חנוכה', 'הנרות הללו'],
  };
  const SHEHECHEYANU = /שהחי+נו וקימנו והגיענו לזמן הזה/;
  const FIRST_NIGHT_NOTE: Record<Nusach, RegExp> = {
    ashkenaz: /בלילה הראשון מוסיפים/,
    sefard: /ובערב הראשון מוסיפים ברכת שהחיינו[\s\S]*רק בלילה הראשון/,
    edot_hamizrach: /בליל ראשון מברך גם ברכה זו/,
    chabad: /ובלילה ראשונה יברך גם כן שהחיינו/,
  };
  const LIGHTING_NOTE: Record<Nusach, RegExp> = {
    ashkenaz: /לפני ההדלקה מברכים/,
    sefard: /אחרי שהדליק הנר הראשון משמאל יאמר זאת/,
    edot_hamizrach: /אחר שידליק נר אחד יאמר/,
    chabad: /המנהג הנכון לדבק הנרות או לתלות המנורה בעובי המזוזה בחלל הפתח/,
  };
  const CHABAD_PLACING =
    'ואין להדליק עד שיגמור כל הברכות. המנהג הנכון לדבק הנרות או לתלות המנורה בעובי המזוזה בחלל הפתח.';
  const paragraphsOf = (nusach: Nusach, features: DayFeatures) =>
    sections(nusach, features).flatMap((section) =>
      section.segments.flatMap((segment) => segment.he.map((runs) => runs.map((run) => run.t).join(''))),
    );

  it('falls on the nights its fixtures claim', () => {
    expect(first.add(7).abs()).toBe(new HDate(2, months.TEVET, 5787).abs());
    for (const night of eightNights) expect(night.flags.has('chanukah')).toBe(true);
    expect(eightNights.filter((night) => night.flags.has('chanukahFirstNight'))).toEqual([firstNight]);
    expect(firstNight.flags.has('shabbat')).toBe(true);
    expect(lastNight.flags.has('shabbat')).toBe(true);
    expect(afterShabbat.flags.has('motzaeiShabbat')).toBe(true);
    expect(plainNight.flags.has('shabbat') || plainNight.flags.has('motzaeiShabbat')).toBe(false);
    for (const features of [beforeChanukah, afterChanukah]) expect(features.flags.has('chanukah')).toBe(false);
  });

  it('is filed under the occasions, said at night, and offered from the first night to the last in every nusach', () => {
    expect(STANDALONE_TEXTS[ID]).toMatchObject({ group: 'occasions', evening: true, available: { all: ['chanukah'] } });
    expect(standaloneTextsIn('occasions')).toContain(ID);
    for (const nusach of NUSCHAOT) {
      for (const night of eightNights) expect(hasStandaloneText(ID, nusach, night)).toBe(true);
      for (const features of [beforeChanukah, afterChanukah])
        expect(hasStandaloneText(ID, nusach, features)).toBe(false);
      expect(hasStandaloneText(ID, nusach, day(25, months.KISLEV, 5787, DIASPORA))).toBe(true);
    }
  });

  it('opens on the afternoon before the first night and closes after the last night', () => {
    expect(nightIn('2026-12-04T10:00:00Z').flags.has('chanukahFirstNight')).toBe(true);
    expect(nightIn('2026-12-03T10:00:00Z').flags.has('chanukah')).toBe(false);
    expect(nightIn('2026-12-11T10:00:00Z').flags.has('chanukah')).toBe(true);
    expect(nightIn('2026-12-12T10:00:00Z').flags.has('chanukah')).toBe(false);
  });

  it('lists the sections of each nusach in order, never repeating a title', () => {
    for (const nusach of NUSCHAOT) {
      for (const night of eightNights) {
        expect(sections(nusach, night).map((section) => section.title.he)).toEqual(TITLES[nusach]);
      }
    }
  });

  it('says the blessing to light and the blessing for the miracles on every night, in every nusach', () => {
    for (const nusach of NUSCHAOT) {
      for (const night of eightNights) {
        const said = saidOn(nusach, ID, night);
        expect(said).toMatch(/אשר קדשנו במצותיו וצונו להדליק נר חנכה/);
        expect(said).toMatch(/שעשה נסים לאבותינו בימים ההם בזמן הזה/);
        expect(count(said, /ברוך אתה/)).toBe(night === eightNights[0] ? 3 : 2);
      }
    }
  });

  it('says Shehecheyanu on the first night only, with its instruction', () => {
    for (const nusach of NUSCHAOT) {
      expect(count(saidOn(nusach, ID, firstNight), SHEHECHEYANU)).toBe(1);
      expect(shownOn(nusach, ID, firstNight)).toMatch(FIRST_NIGHT_NOTE[nusach]);
      expect(saidOn(nusach, ID, firstNight)).not.toMatch(FIRST_NIGHT_NOTE[nusach]);
      for (const night of otherNights) {
        expect(shownOn(nusach, ID, night)).not.toMatch(/שהחי/);
        expect(shownOn(nusach, ID, night)).not.toMatch(FIRST_NIGHT_NOTE[nusach]);
      }
    }
  });

  it('says Hanerot Hallalu on every night, in every nusach', () => {
    for (const nusach of NUSCHAOT) {
      for (const night of eightNights) {
        const said = saidInSection(nusach, night, 'הנרות הללו');
        expect(said).toMatch(/^הנרות הללו (שאנו|אנו|אנחנו) מדליקין על /);
        expect(said).toMatch(/שעשית לאבותינו[\s\S]*על ידי כהניך הקדושים/);
        expect(said).toMatch(/אין לנו רשות להשתמש ב(הם|הן) אלא לראות(ם|ן) בלבד/);
        expect(count(said, /הנרות הללו/)).toBe(2);
      }
    }
  });

  it('keeps each source’s note on how to light as an instruction, never as said text', () => {
    for (const nusach of NUSCHAOT) {
      for (const night of eightNights) {
        expect(shownOn(nusach, ID, night)).toMatch(LIGHTING_NOTE[nusach]);
        expect(saidOn(nusach, ID, night)).not.toMatch(LIGHTING_NOTE[nusach]);
      }
    }
  });

  it('names the order of lighting only for the night it is read on', () => {
    expect(paragraphsOf('chabad', firstNight)[0]).toBe(
      `יברך בכל לילה להדליק נר חנוכה ושעשה נסים ובלילה ראשונה יברך גם כן שהחיינו. ${CHABAD_PLACING} ויתחיל להדליק בליל ראשון מנר הימין:`,
    );
    for (const night of otherNights) {
      expect(paragraphsOf('chabad', night)[0]).toBe(
        `יברך בכל לילה להדליק נר חנוכה ושעשה נסים. ${CHABAD_PLACING} ומליל שני ואילך יברך על הנוסף וילך משמאל לימין:`,
      );
    }
    const sefardNote = (features: DayFeatures) =>
      paragraphsOf('sefard', features).find((paragraph) => paragraph.startsWith('אחרי שהדליק'));
    expect(sefardNote(firstNight)).toBe('אחרי שהדליק הנר הראשון משמאל יאמר זאת:');
    for (const night of otherNights)
      expect(sefardNote(night)).toBe('אחרי שהדליק הנר הראשון משמאל יאמר זאת כשמדליק השאר:');
  });

  it('leaves no doubled space and no space before punctuation in what the reader shows', () => {
    for (const nusach of NUSCHAOT) {
      for (const night of eightNights) {
        for (const paragraph of paragraphsOf(nusach, night)) expect(paragraph).not.toMatch(/\s{2}|\s[.,:;)]/);
      }
    }
    const closing = paragraphsOf('sefard', plainNight).filter((paragraph) => paragraph.includes('ובני"ו)'));
    expect(closing).toHaveLength(1);
    expect(closing[0]).toContain('ובני"ו). ');
  });

  it('sings Maoz Tzur in every nusach whose source prints it, all six stanzas, and in Chabad none', () => {
    const stanzas = [
      /מעוז צור ישועתי לך נאה לשבח/,
      /רעות שבעה נפשי/,
      /דביר קדשו הביאני/,
      /כרות קומת ברוש/,
      /יונים נקבצו עלי/,
      /חשוף זרוע קדשך[\s\S]*דחה אדמון בצל צלמון הקם לנו רועה שבעה/,
    ];
    for (const nusach of ['ashkenaz', 'sefard', 'edot_hamizrach'] as const) {
      for (const night of eightNights) {
        const said = saidInSection(nusach, night, 'מעוז צור');
        for (const stanza of stanzas) expect(said).toMatch(stanza);
      }
    }
    for (const night of eightNights) expect(shownOn('chabad', ID, night)).not.toMatch(/מעוז צור/);
  });

  it('says the psalms and verses Sefard and Edot HaMizrach print after the lights, and none in Ashkenaz and Chabad', () => {
    for (const night of eightNights) {
      for (const nusach of ['sefard', 'edot_hamizrach'] as const) {
        expect(saidOn(nusach, ID, night)).toMatch(/מזמור שיר חנכת הבית לדוד ארוממך \S+ כי דליתני[\s\S]*לעולם אודך/);
        expect(saidOn(nusach, ID, night)).toMatch(/ויהי נעם אדני אלהינו עלינו[\s\S]*ישב בסתר עליון בצל שדי יתלונן/);
      }
      for (const nusach of ['ashkenaz', 'chabad'] as const)
        expect(saidOn(nusach, ID, night)).not.toMatch(/ארוממך|ישב בסתר/);
      expect(saidOn('sefard', ID, night)).toMatch(/הללויה אודה \S+ בכל לבב[\s\S]*הללויה אשרי איש ירא את \S+/);
      expect(saidOn('sefard', ID, night)).toMatch(
        /למנצח בנגינות מזמור שיר[\s\S]*אנא בכח גדלת ימינך תתיר צרורה[\s\S]*רננו צדיקים ב\S+[\s\S]*שיר המעלות לדוד הנה מה טוב ומה נעים/,
      );
    }
  });

  it('reads the same on Shabbat, after Shabbat and on a weekday, because no source tells them apart', () => {
    for (const nusach of NUSCHAOT) {
      for (const features of [lastNight, afterShabbat, ...otherNights]) {
        expect(sections(nusach, features)).toEqual(sections(nusach, plainNight));
      }
    }
  });

  it('drops the song for Shabbat Chanukah, which is said only on Shabbat', () => {
    for (const nusach of NUSCHAOT) {
      const everything = load(nusach, ID)
        .sections.flatMap((section) => section.segments.flatMap((segment) => segment.he.flat().map((run) => run.t)))
        .join(' ');
      expect(letters(everything)).not.toMatch(/אכלו משמנים|בית כור|שבת וחנכה/);
    }
  });

  it('writes the divine name as each nusach does', () => {
    for (const nusach of ['ashkenaz', 'sefard', 'edot_hamizrach'] as const) {
      expect(saidOn(nusach, ID, firstNight)).toMatch(/ברוך אתה יהוה אלהינו מלך העולם/);
      expect(saidOn(nusach, ID, firstNight)).not.toMatch(/(^| )יי( |$)/);
    }
    expect(saidOn('chabad', ID, firstNight)).toMatch(/ברוך אתה יי אלהינו מלך העולם/);
    expect(saidOn('chabad', ID, firstNight)).not.toMatch(/יהוה/);
  });

  it('shows no raw markup, Psalm 30 in Edot HaMizrach only as it is read, and Ana BeKoach in Sefard with only its opening word bold', () => {
    for (const nusach of NUSCHAOT) {
      for (const night of eightNights) expect(shownOn(nusach, ID, night)).not.toMatch(/[\[\]<>]/);
    }
    expect(shownOn('edot_hamizrach', ID, plainNight)).not.toMatch(/מיורדי/);
    expect(saidOn('edot_hamizrach', ID, plainNight)).toMatch(/נפשי חייתני מירדי בור זמרו ל\S+ חסידיו/);
    const bold = sectionNamed('sefard', plainNight, 'אנא בכח')
      .segments.flatMap((segment) => segment.he.flat())
      .filter((run) => run.s === 'b');
    expect(bold.map((run) => run.t)).toEqual(['אָנָּא']);
  });

  it('carries the source English only where it lines up', () => {
    const englishOf = (nusach: Nusach, features: DayFeatures, title: string) =>
      sectionNamed(nusach, features, title).segments.map((segment) => segment.en ?? '');
    const [note, light, miracles, firstNote, shehecheyanu] = englishOf(
      'ashkenaz',
      firstNight,
      'ברכות הדלקת נרות חנוכה',
    );
    expect(note).toBe('Before lighting, we bless:');
    expect(light).toMatch(/commanded us to light the Chanukah candles/);
    expect(miracles).toMatch(/who made miracles for our ancestors/);
    expect(firstNote).toBe('On the first night:');
    expect(shehecheyanu).toMatch(/who has kept us alive, sustained us/);
    expect(englishOf('ashkenaz', plainNight, 'הנרות הללו')).toEqual(['']);
    expect(englishOf('ashkenaz', plainNight, 'מעוז צור').map(Boolean)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(englishOf('ashkenaz', plainNight, 'מעוז צור')[5]).toMatch(/^Bare Your holy arm/);
    for (const night of eightNights) {
      const segments = sections('edot_hamizrach', night).flatMap((section) => section.segments);
      expect(segments.every((segment) => segment.en)).toBe(true);
    }
    expect(englishOf('edot_hamizrach', plainNight, 'ברכות הדלקת נרות חנוכה')[0]).toMatch(
      /commanded us to kindle the Hanukkah light/,
    );
    expect(
      sections('chabad', plainNight)
        .flatMap((section) => section.segments)
        .every((segment) => !segment.en),
    ).toBe(true);
    for (const title of ['הנרות הללו', 'מעוז צור']) {
      expect(sectionNamed('sefard', plainNight, title).segments.every((segment) => !segment.en)).toBe(true);
    }
  });
});

function wordsOf(segments: SiddurSegment[], keep: (run: Run) => boolean): string {
  return letters(
    segments
      .flatMap((segment) =>
        segment.he.map((runs) =>
          runs
            .filter(keep)
            .map((run) => run.t)
            .join(''),
        ),
      )
      .join(' '),
  ).trim();
}

function said(section: SiddurSection): string {
  return wordsOf(section.segments, (run) => run.s !== 'n');
}

describe('tikkun_haklali', () => {
  const ID = 'tikkun_haklali';
  const weekday = day(3, months.CHESHVAN, 5787);
  const shabbat = civilDay(new Date(2026, 9, 17));
  const OPENING = 'תפילה לפני התיקון';
  const CLOSING = 'תפילה אחרי התיקון';
  const PSALMS = [
    { title: 'מזמור טז', verses: 11, begins: 'מכתם לדוד שמרני אל', ends: 'נעמות בימינך נצח' },
    { title: 'מזמור לב', verses: 11, begins: 'לדוד משכיל אשרי נשוי פשע', ends: 'והרנינו כל ישרי לב' },
    { title: 'מזמור מא', verses: 14, begins: 'למנצח מזמור לדוד', ends: 'מהעולם ועד העולם אמן ואמן' },
    { title: 'מזמור מב', verses: 12, begins: 'למנצח משכיל לבני קרח', ends: 'ישועת פני ואלהי' },
    { title: 'מזמור נט', verses: 18, begins: 'למנצח אל תשחת לדוד מכתם', ends: 'כי אלהים משגבי אלהי חסדי' },
    { title: 'מזמור עז', verses: 21, begins: 'למנצח על ידותון לאסף מזמור', ends: 'ביד משה ואהרן' },
    { title: 'מזמור צ', verses: 17, begins: 'תפלה למשה איש האלהים', ends: 'ומעשה ידינו כוננהו' },
    { title: 'מזמור קה', verses: 45, begins: 'הודו ליהוה קראו בשמו', ends: 'ותורתיו ינצרו הללו יה' },
    { title: 'מזמור קלז', verses: 9, begins: 'על נהרות בבל שם ישבנו', ends: 'ונפץ את עלליך אל הסלע' },
    { title: 'מזמור קנ', verses: 6, begins: 'הללו יה הללו אל בקדשו', ends: 'כל הנשמה תהלל יה הללו יה' },
  ];
  const sections = (nusach: Nusach, features: DayFeatures) => resolveSiddurText(load(nusach, ID), features);
  const section = (nusach: Nusach, title: string, features = weekday) =>
    sections(nusach, features).find((candidate) => candidate.title.he === title)!;

  it('falls on the days its fixtures claim', () => {
    expect(shabbat.flags.has('shabbat')).toBe(true);
    for (const flag of ['shabbat', 'yomTov', 'yomKippur'] as const) expect(weekday.flags.has(flag)).toBe(false);
  });

  it('is filed in the general group, first, and offered in every nusach on every day', () => {
    expect(STANDALONE_TEXTS[ID]).toMatchObject({ name: { he: 'תיקון הכללי', en: 'Tikkun HaKlali' }, group: 'general' });
    expect(STANDALONE_TEXTS[ID].evening).toBeUndefined();
    expect(STANDALONE_TEXTS[ID].available).toBeUndefined();
    expect(standaloneTextsIn('general').slice(0, 1)).toEqual([ID]);
    for (const nusach of NUSCHAOT) {
      for (const features of [weekday, shabbat]) expect(hasStandaloneText(ID, nusach, features)).toBe(true);
    }
  });

  it('opens with the prayers, then the ten psalms in the Rebbe’s order, then the closing prayer, in 12 sections', () => {
    for (const nusach of NUSCHAOT) {
      expect(sections(nusach, weekday).map((entry) => entry.title.he)).toEqual([
        OPENING,
        ...PSALMS.map((psalm) => psalm.title),
        CLOSING,
      ]);
      expect(sections(nusach, weekday).map((entry) => entry.title.en)).toEqual([
        'Prayer Before the Tikkun',
        'Psalm 16',
        'Psalm 32',
        'Psalm 41',
        'Psalm 42',
        'Psalm 59',
        'Psalm 77',
        'Psalm 90',
        'Psalm 105',
        'Psalm 137',
        'Psalm 150',
        'Prayer After the Tikkun',
      ]);
    }
  });

  it('says the same text in every nusach, in Hebrew only', () => {
    const bodies = NUSCHAOT.map((nusach) => JSON.stringify(load(nusach, ID).sections));
    expect(new Set(bodies).size).toBe(1);
    for (const nusach of NUSCHAOT) {
      for (const entry of load(nusach, ID).sections) {
        expect(entry.segments.every((segment) => segment.en === undefined)).toBe(true);
      }
    }
  });

  it('gives each psalm as one segment per verse, from its first verse to its last', () => {
    for (const psalm of PSALMS) {
      const entry = section('ashkenaz', psalm.title);
      expect(entry.segments).toHaveLength(psalm.verses);
      expect(entry.segments.every((segment) => !segment.optional && !segment.minyan && !segment.when)).toBe(true);
      expect(said(entry).startsWith(psalm.begins)).toBe(true);
      expect(said(entry).endsWith(psalm.ends)).toBe(true);
      expect(said(entry)).not.toMatch(/\[|\]/);
    }
    expect(PSALMS.map((psalm) => psalm.verses)).toEqual([11, 11, 14, 12, 18, 21, 17, 45, 9, 6]);
  });

  it('begins Psalm 16 with “Michtam LeDavid” and ends Psalm 150 with Halleluyah', () => {
    const psalm16 = section('sefard', 'מזמור טז').segments;
    expect(wordsOf(psalm16.slice(0, 1), () => true)).toBe('מכתם לדוד שמרני אל כי חסיתי בך');
    const psalm150 = section('chabad', 'מזמור קנ').segments;
    expect(wordsOf(psalm150.slice(-1), () => true)).toBe('כל הנשמה תהלל יה הללו יה');
  });

  it('reads each psalm as it is read aloud: the qere in place of the ketiv, no joiners, the divine name spelled as the siddur does', () => {
    expect(said(section('ashkenaz', 'מזמור מא'))).toMatch(/ואשר בארץ ואל תתנהו בנפש איביו/);
    expect(said(section('ashkenaz', 'מזמור מא'))).not.toMatch(/יאשר/);
    expect(said(section('ashkenaz', 'מזמור עז'))).toMatch(/למנצח על ידותון לאסף מזמור/);
    expect(said(section('ashkenaz', 'מזמור עז'))).not.toMatch(/ידיתון/);
    expect(said(section('ashkenaz', 'מזמור קה'))).toMatch(/ולא מרו את דברו/);
    const pointed = JSON.stringify(load('ashkenaz', ID).sections);
    expect(pointed).not.toMatch(/‍/);
    expect(pointed).not.toMatch(/יְ?הוָה/);
    expect(pointed).toMatch(/לַיהֹוָה/);
    expect(pointed).toMatch(/יְהֹוָה/);
  });

  it('opens with the Yehi Ratzon before the psalms, then “Hareini mezamen” and “Hareini mekasher” under their instructions', () => {
    const opening = section('ashkenaz', OPENING);
    const spoken = said(opening);
    expect(spoken).toMatch(/^יהי רצון מלפניך יהוה אלהינו ואלהי אבותינו הבוחר בדוד עבדו/);
    expect(spoken).toMatch(/הריני מזמן את פי להודות ולהלל ולשבח את בוראי/);
    expect(spoken).toMatch(/הריני מקשר עצמי באמירת העשרה מזמורים אלו לכל הצדיקים האמתיים שבדורנו/);
    expect(spoken).toMatch(/רבנו נחמן בן פיגא/);
    expect(spoken).toMatch(/ועל דעתם ועל כוונתם אני אומר כל אלו העשרה מזמורי תהלים/);
    expect(spoken).toMatch(/שהוא תיקון הכללי אמן$/);
    expect(spoken.indexOf('הריני מזמן')).toBeLessThan(spoken.indexOf('הריני מקשר'));
    expect(spoken.indexOf('יהי רצון מלפניך')).toBeLessThan(spoken.indexOf('הריני מזמן'));
    const shown = wordsOf(opening.segments, () => true);
    expect(shown).toMatch(/קודם שיתחיל באמירת תהלים יאמר זה/);
    expect(shown).toMatch(/טוב לומר זאת לפני אמירת העשרה מזמורים/);
    expect(spoken).not.toMatch(/קודם שיתחיל|טוב לומר זאת/);
    expect(opening.segments.filter((segment) => segment.he.flat().every((run) => run.s === 'n'))).toHaveLength(2);
  });

  it('leaves out the Yehi Ratzon on Shabbat and Yom Tov, as its page says, and the page’s introduction and links', () => {
    const onShabbat = said(section('ashkenaz', OPENING, shabbat));
    expect(onShabbat).not.toMatch(/יהי רצון מלפניך/);
    expect(onShabbat).toMatch(/^לכו נרננה ליהוה נריעה לצור ישענו/);
    expect(onShabbat).toMatch(/על כל אלהים הריני מזמן את פי/);
    expect(wordsOf(section('ashkenaz', OPENING, shabbat).segments, () => true)).not.toMatch(/אין אומרים יהי רצון זה/);
    expect(wordsOf(section('ashkenaz', OPENING).segments, () => true)).not.toMatch(/אין אומרים יהי רצון זה/);
    const everything = load('ashkenaz', ID)
      .sections.flatMap((entry) => entry.segments.flatMap((segment) => segment.he.flat().map((run) => run.t)))
      .join(' ');
    for (const stray of [/ליקוטי|לקוטי/, /הקדמה/, /ראו גם/, /ברסלב/, /\{\{|\}\}|\[\[|==|https?:/]) {
      expect(everything).not.toMatch(stray);
    }
  });

  it('says Psalm 95:1-3 after the Yehi Ratzon and before “Hareini mezamen”, where the Yehi Ratzon page prints it, on every day', () => {
    const verses = [
      'לכו נרננה ליהוה נריעה לצור ישענו',
      'נקדמה פניו בתודה בזמרות נריע לו',
      'כי אל גדול יהוה ומלך גדול על כל אלהים',
    ];
    for (const features of [weekday, shabbat]) {
      const opening = section('ashkenaz', OPENING, features);
      const lechu = opening.segments.filter((segment) => verses.includes(wordsOf([segment], () => true)));
      expect(lechu).toHaveLength(3);
      expect(lechu.every((segment) => !segment.optional && !segment.minyan && !segment.when)).toBe(true);
      expect(opening.segments.indexOf(lechu[2])).toBe(opening.segments.indexOf(lechu[0]) + 2);
      const spoken = said(opening);
      expect(spoken.indexOf(verses[0])).toBeLessThan(spoken.indexOf('הריני מזמן'));
    }
    const onWeekday = said(section('ashkenaz', OPENING));
    expect(onWeekday.indexOf('הבוחר בדוד')).toBeGreaterThanOrEqual(0);
    expect(onWeekday.indexOf('הבוחר בדוד')).toBeLessThan(onWeekday.indexOf(verses[0]));
    const pointed = JSON.stringify(section('ashkenaz', OPENING).segments);
    expect(pointed).toMatch(/לְכוּ נְרַנְּנָה לַיהֹוָה/);
  });

  it('closes with the three verses after the Psalms, then the prayer after the Tikkun in its three paragraphs', () => {
    const closing = section('ashkenaz', CLOSING);
    expect(closing.segments).toHaveLength(6);
    const verses = closing.segments.slice(0, 3);
    expect(verses.every((segment) => !segment.optional && !segment.minyan && !segment.when)).toBe(true);
    expect(wordsOf(verses.slice(0, 1), () => true)).toBe(
      'מי יתן מציון ישועת ישראל בשוב יהוה שבות עמו יגל יעקב ישמח ישראל',
    );
    expect(wordsOf(verses.slice(1, 2), () => true)).toBe('ותשועת צדיקים מיהוה מעוזם בעת צרה');
    expect(wordsOf(verses.slice(2), () => true)).toBe('ויעזרם יהוה ויפלטם יפלטם מרשעים ויושיעם כי חסו בו');
    expect(JSON.stringify(verses)).toMatch(/מִי יִתֵּן מִצִּיּוֹן/);
    expect(JSON.stringify(verses)).toMatch(/וּתְשׁוּעַת צַדִּיקִים/);
    const spoken = said(closing);
    expect(spoken).toMatch(/^מי יתן מציון ישועת ישראל/);
    expect(spoken.indexOf('ותשועת צדיקים')).toBeLessThan(spoken.indexOf('עלת העלות'));
    expect(spoken).toMatch(/רבונו של עולם עלת העלות וסבת כל הסבות אנת לעלא/);
    expect(spoken).toMatch(/אותך אדרש אותך אבקש שתחתר חתירה דרך כבושה מאתך/);
    expect(spoken).toMatch(/הט לבי אל עדותיך ותן לי לב טהור לעבדך באמת/);
    expect(spoken).toMatch(/אמן נצח סלה ועד$/);
    expect(spoken).not.toMatch(/ראו גם|ויקיפדיה|קטגוריה/);
  });

  it('credits the pinned Wikisource pages and the Psalms version, and nothing else', () => {
    for (const nusach of NUSCHAOT) {
      expect(load(nusach, ID).credits).toEqual([
        {
          title: 'Tikkun HaKlali — Hebrew Wikisource',
          license: 'CC-BY-SA',
          url: 'https://he.wikisource.org/w/index.php?oldid=1390004',
        },
        {
          title: 'Prayer Before Saying Psalms — Hebrew Wikisource',
          license: 'CC-BY-SA',
          url: 'https://he.wikisource.org/w/index.php?oldid=1386519',
        },
        { title: 'Psalms — Tanach with Nikkud', license: 'Public Domain', url: 'https://www.sefaria.org/Psalms' },
      ]);
    }
  });
});

describe('tehillim', () => {
  const ID = 'tehillim';
  const weekday = day(3, months.CHESHVAN, 5787);
  const shabbat = civilDay(new Date(2026, 9, 17));
  const BEFORE = 'תפילה לפני אמירת תהלים';
  const AFTER = 'תפילה לאחר אמירת תהלים';
  const WEEK = [
    [1, 'ליום ראשון', 'Sunday'],
    [30, 'ליום שני', 'Monday'],
    [51, 'ליום שלישי', 'Tuesday'],
    [73, 'ליום רביעי', 'Wednesday'],
    [90, 'ליום חמישי', 'Thursday'],
    [107, 'ליום שישי', 'Friday'],
    [120, 'ליום שבת', 'Shabbat'],
  ] as const;
  const BOOKS = [
    [41, 'יהי רצון לאחר ספר ראשון', 'ראשון', 'בראשית'],
    [72, 'יהי רצון לאחר ספר שני', 'שני', 'שמות'],
    [89, 'יהי רצון לאחר ספר שלישי', 'שלישי', 'ויקרא'],
    [106, 'יהי רצון לאחר ספר רביעי', 'רביעי', 'במדבר'],
    [150, 'יהי רצון לאחר ספר חמישי', 'חמישי', 'דברים'],
  ] as const;
  const LETTERS_119 = [...'אבגדהוזחטיכלמנסעפצקרשת'];
  const psalmTitle = (number: number) => `פרק ${gematriya(number).replace(/[׳״]/g, '')}`;
  const psalmTitles = (number: number) =>
    number === 119 ? LETTERS_119.map((letter) => `${psalmTitle(119)} · ${letter}`) : [psalmTitle(number)];
  const sections = (features = weekday) => resolveSiddurText(load('ashkenaz', ID), features);
  const section = (title: string, features = weekday) =>
    sections(features).find((candidate) => candidate.title.he === title)!;
  const isNote = (segment: SiddurSegment) => segment.he.flat().every((run) => run.s === 'n');
  const saidIn = (segments: SiddurSegment[]) => wordsOf(segments, (run) => run.s !== 'n');

  it('falls on the days its fixtures claim', () => {
    expect(shabbat.flags.has('shabbat')).toBe(true);
    for (const flag of ['shabbat', 'yomTov', 'yomKippur'] as const) expect(weekday.flags.has(flag)).toBe(false);
  });

  it('is filed in the general group right after Tikkun HaKlali, and offered in every nusach on every day', () => {
    expect(STANDALONE_TEXTS[ID]).toMatchObject({ name: { he: 'תהילים', en: 'Tehillim' }, group: 'general' });
    expect(STANDALONE_TEXTS[ID].evening).toBeUndefined();
    expect(STANDALONE_TEXTS[ID].available).toBeUndefined();
    expect(standaloneTextsIn('general').slice(0, 2)).toEqual(['tikkun_haklali', ID]);
    for (const nusach of NUSCHAOT) {
      for (const features of [weekday, shabbat]) expect(hasStandaloneText(ID, nusach, features)).toBe(true);
    }
  });

  it('is one text for every nusach, in Hebrew only', () => {
    expect(SHARED_SIDDUR_TEXT_IDS).toContain(ID);
    const text = load('ashkenaz', ID);
    expect(text.nusach).toBeUndefined();
    expect(text.sections.flatMap((entry) => entry.segments).every((segment) => segment.en === undefined)).toBe(true);
  });

  it('lists in its picker the prayer before, the seven days of the weekly division and the prayer after, and nothing else', () => {
    const shown = sections();
    const entries = pickerEntries(shown);
    expect(entries.map((entry) => entry.title.he)).toEqual([BEFORE, ...WEEK.map(([, he]) => he), AFTER]);
    expect(entries.map((entry) => entry.title.en)).toEqual([
      'Prayer Before Tehillim',
      ...WEEK.map(([, , en]) => en),
      'Prayer After Tehillim',
    ]);
    expect(entries.map((entry) => shown[entry.index].title.he)).toEqual([
      BEFORE,
      ...WEEK.map(([first]) => psalmTitle(first)),
      AFTER,
    ]);
  });

  it('gives all 150 psalms in order, with each book’s Yehi Ratzon right after its last psalm', () => {
    const titles = Array.from({ length: 150 }, (_, index) => index + 1).flatMap((number) => {
      const book = BOOKS.find(([last]) => last === number);
      return book ? [...psalmTitles(number), book[1]] : psalmTitles(number);
    });
    expect(sections().map((entry) => entry.title.he)).toEqual([BEFORE, ...titles, AFTER]);
    expect(sections(shabbat).map((entry) => entry.title.he)).toEqual([BEFORE, ...titles, AFTER]);
    expect(section(psalmTitle(1)).title.en).toBe('Psalm 1');
    expect(section(psalmTitle(150)).title.en).toBe('Psalm 150');
    expect(psalmTitle(15)).toBe('פרק טו');
    expect(psalmTitle(116)).toBe('פרק קטז');
  });

  it('says each psalm verse by verse, from its first verse to its last, and nothing else inside it', () => {
    const psalms = sections().filter((entry) => entry.title.he.startsWith('פרק '));
    expect(psalms).toHaveLength(149 + 22);
    const verses = psalms.flatMap((entry) => entry.segments);
    expect(verses).toHaveLength(2527);
    expect(verses.some(isNote)).toBe(false);
    expect(verses.every((segment) => !segment.optional && !segment.minyan && !segment.when)).toBe(true);
    expect(section(psalmTitle(1)).segments).toHaveLength(6);
    expect(section(psalmTitle(23)).segments).toHaveLength(6);
    expect(section(psalmTitle(117)).segments).toHaveLength(2);
    expect(said(section(psalmTitle(1)))).toMatch(/^אשרי האיש אשר לא הלך בעצת רשעים/);
    expect(said(section(psalmTitle(3)))).toMatch(/^מזמור לדוד בברחו מפני אבשלום בנו/);
    expect(said(section(psalmTitle(150)))).toMatch(/כל הנשמה תהלל יה הללו יה$/);
  });

  it('gives Psalm 119 as its 22 stanzas, each titled with the letter its eight verses open with', () => {
    const stanzas = sections().filter((entry) => entry.title.he.startsWith(`${psalmTitle(119)} · `));
    expect(stanzas.map((entry) => entry.title.he)).toEqual(psalmTitles(119));
    expect(stanzas[0].title.en).toBe('Psalm 119 · Aleph');
    expect(stanzas[21].title.en).toBe('Psalm 119 · Tav');
    stanzas.forEach((stanza, index) => {
      expect(stanza.segments).toHaveLength(8);
      expect(stanza.segments.every((verse) => wordsOf([verse], () => true).startsWith(LETTERS_119[index]))).toBe(true);
    });
    expect(said(stanzas[0])).toMatch(/^אשרי תמימי דרך ההלכים בתורת יהוה/);
    expect(said(stanzas[21])).toMatch(/כי מצותיך לא שכחתי$/);
  });

  it('reads each psalm as it is read aloud: every qere in place of its ketiv, no joiners, the divine name spelled as the siddur does', () => {
    const pointed = load('ashkenaz', ID)
      .sections.flatMap((entry) => entry.segments.flatMap((segment) => segment.he.flat().map((run) => run.t)))
      .join(' ');
    expect(pointed).not.toMatch(/\[|\]|‍/);
    expect(pointed).not.toMatch(/יְ?הוָה/);
    expect(pointed).toMatch(/יְהֹוָה/);
    expect(said(section(psalmTitle(100)))).toMatch(/הוא עשנו ולו אנחנו עמו/);
    expect(said(section(psalmTitle(10)))).toMatch(/ונפל בעצומיו חיל כאים/);
    expect(said(section(psalmTitle(55)))).toMatch(/ישי מות עלימו ירדו שאול חיים/);
    expect(JSON.stringify(section(psalmTitle(30)).segments)).toMatch(/מִיָּרְדִי־בוֹר/);
    expect(JSON.stringify(section(psalmTitle(21)).segments)).toMatch(/מַה־יָּגֶל מְאֹד/);
    expect(JSON.stringify(section(psalmTitle(89)).segments)).toMatch(/לְעוֹלָם אֶשְׁמָר־לוֹ חַסְדִּי/);
  });

  it('opens with the Yehi Ratzon before Tehillim on a weekday, and with Lechu Neranena on every day', () => {
    const lechu =
      'לכו נרננה ליהוה נריעה לצור ישענו נקדמה פניו בתודה בזמרות נריע לו כי אל גדול יהוה ומלך גדול על כל אלהים';
    const onWeekday = said(section(BEFORE));
    expect(onWeekday).toMatch(/^יהי רצון מלפניך יהוה אלהינו ואלהי אבותינו הבוחר בדוד עבדו/);
    expect(onWeekday.endsWith(lechu)).toBe(true);
    expect(said(section(BEFORE, shabbat))).toBe(lechu);
    for (const features of [weekday, shabbat]) {
      expect(wordsOf(section(BEFORE, features).segments, () => true)).not.toMatch(/אין אומרים/);
    }
  });

  it('closes each book with its own Yehi Ratzon, naming the book and the book of the Torah it stands for', () => {
    for (const [, title, ordinal, chumash] of BOOKS) {
      const prayer = section(title);
      expect(prayer.segments).toHaveLength(1);
      expect(said(prayer)).toMatch(
        new RegExp(
          `^יהי רצון מלפניך יהוה אלהינו ואלהי אבותינו בזכות ספר ${ordinal} שבתהלים שקראנו לפניך שהוא כנגד ספר ${chumash} בזכות מזמוריו ובזכות פסוקיו ובזכות תבותיו`,
        ),
      );
      expect(said(prayer)).toMatch(/שתכפר לנו על כל חטאתינו/);
      expect(said(prayer)).toMatch(/ברוך יהוה לעולם אמן ואמן$/);
      expect(said(prayer)).not.toMatch(/•/);
    }
  });

  it('ends with the three verses after Tehillim, then the Yehi Ratzon after a few psalms', () => {
    const closing = section(AFTER);
    expect(closing.segments).toHaveLength(2);
    expect(wordsOf(closing.segments.slice(0, 1), (run) => run.s === 'n')).toBe('אחר שסיים תהלים יאמר ג פסוקים אלו');
    expect(saidIn(closing.segments.slice(0, 1))).toBe(
      'מי יתן מציון ישועת ישראל בשוב יהוה שבות עמו יגל יעקב ישמח ישראל ותשועת צדיקים מיהוה מעוזם בעת צרה ויעזרם יהוה ויפלטם יפלטם מרשעים ויושיעם כי חסו בו',
    );
    const prayer = saidIn(closing.segments.slice(1));
    expect(prayer).toMatch(
      /^יהי רצון מלפניך יהוה אלהינו ואלהי אבותינו בזכות מזמורי תהלים שקראתי לפניך ובזכות פסוקיהם ובזכות תבותיהם שתכפר לנו/,
    );
    expect(prayer).toMatch(/ברוך יהוה לעולם אמן ואמן$/);
  });

  it('credits the pinned Wikisource pages and the Psalms version, and nothing else', () => {
    expect(load('ashkenaz', ID).credits).toEqual([
      {
        title: 'Prayer Before Saying Psalms — Hebrew Wikisource',
        license: 'CC-BY-SA',
        url: 'https://he.wikisource.org/w/index.php?oldid=1386519',
      },
      { title: 'Psalms — Tanach with Nikkud', license: 'Public Domain', url: 'https://www.sefaria.org/Psalms' },
      {
        title: 'Prayer After Saying Psalms — Hebrew Wikisource',
        license: 'CC-BY-SA',
        url: 'https://he.wikisource.org/w/index.php?oldid=2917763',
      },
    ]);
  });
});

describe('shacharit chapters', () => {
  // The section picker lists a long text's chapters, not every section: the user's division of
  // Shacharit (2026-10-10), with the Rosh Chodesh and Chol HaMoed additions as their own stops.
  const tuesday = day(9, months.CHESHVAN, 5787);
  const monday = day(8, months.CHESHVAN, 5787);
  const roshChodesh = day(1, months.CHESHVAN, 5787);
  const cholHamoedPesach = day(18, months.NISAN, 5786);
  const tishaBav = day(9, months.AV, 5786);
  const chaptersOn = (nusach: Nusach, features: DayFeatures) =>
    pickerEntries(resolveSiddurText(load(nusach, 'shacharit'), features)).map((entry) => entry.title.he);
  const sectionsOn = (nusach: Nusach, features: DayFeatures) => resolveSiddurText(load(nusach, 'shacharit'), features);
  const WEEKDAY_CHAPTERS: Record<Nusach, string[]> = {
    edot_hamizrach: [
      'ברכות השחר',
      'פתח אליהו',
      'עטיפת טלית והנחת תפילין',
      'קרבנות',
      'הודו',
      'פסוקי דזמרה',
      'קריאת שמע וברכותיה',
      'תפילת העמידה',
      'אשרי ובא לציון',
      'בית יעקב',
      'קוה אל ה׳',
    ],
    sefard: [
      'מודה אני',
      'עטיפת טלית והנחת תפילין',
      'מה טובו',
      'ברכות השחר',
      'קרבנות',
      'הודו',
      'פסוקי דזמרה',
      'קריאת שמע וברכותיה',
      'תפילת העמידה',
      'אשרי ובא לציון',
      'בית יעקב',
      'קוה אל ה׳',
    ],
    ashkenaz: [
      'מודה אני',
      'עטיפת טלית והנחת תפילין',
      'מה טובו',
      'ברכות השחר',
      'קרבנות',
      'פסוקי דזמרה',
      'קריאת שמע וברכותיה',
      'תפילת העמידה',
      'אשרי ובא לציון',
      'עלינו לשבח',
      'שיר של יום',
    ],
    chabad: [
      'ברכות השחר',
      'עטיפת טלית והנחת תפילין',
      'מה טובו',
      'קרבנות',
      'הודו',
      'פסוקי דזמרה',
      'קריאת שמע וברכותיה',
      'תפילת העמידה',
      'אשרי ובא לציון',
      'בית יעקב',
      'קוה אל ה׳',
    ],
  };

  it.each(NUSCHAOT)('%s lists the weekday chapters in order, on Monday as on Tuesday', (nusach) => {
    expect(chaptersOn(nusach, tuesday)).toEqual(WEEKDAY_CHAPTERS[nusach]);
    expect(chaptersOn(nusach, monday)).toEqual(WEEKDAY_CHAPTERS[nusach]);
  });

  it.each(NUSCHAOT)('%s adds Hallel and Musaf as chapters on Rosh Chodesh and Chol HaMoed', (nusach) => {
    for (const festival of [roshChodesh, cholHamoedPesach]) {
      const chapters = chaptersOn(nusach, festival);
      expect(chapters.indexOf('הלל')).toBe(chapters.indexOf('תפילת העמידה') + 1);
      expect(chapters.indexOf('מוסף')).toBeGreaterThan(chapters.indexOf('אשרי ובא לציון'));
      // Sefard says Beit Yaakov only without Musaf; Chabad says it before Tachanun on a Musaf day.
      const expected = WEEKDAY_CHAPTERS[nusach].filter((title) => nusach !== 'sefard' || title !== 'בית יעקב');
      if (nusach === 'chabad')
        expected.splice(expected.indexOf('אשרי ובא לציון'), 0, ...expected.splice(expected.indexOf('בית יעקב'), 1));
      expect(chapters.filter((title) => !['הלל', 'מוסף'].includes(title))).toEqual(expected);
    }
  });

  it('drops the tallit and tefillin chapter on Tisha B’Av with its section', () => {
    for (const nusach of NUSCHAOT) {
      expect(chaptersOn(nusach, tishaBav)).not.toContain('עטיפת טלית והנחת תפילין');
    }
  });

  it('opens Korbanot right after Hannah’s prayer, Hodu at Hodu and Pesukei Dezimra at Baruch She’amar', () => {
    const edot = sectionsOn('edot_hamizrach', tuesday);
    const korbanot = edot.findIndex((section) => section.chapter?.he === 'קרבנות');
    expect(edot[korbanot - 1].title.he).toBe('תפילת חנה');
    expect(edot[korbanot].title.he).toBe('פרשת העקדה');
    const firstWords = (section: SiddurSection) =>
      letters(
        section.segments
          .flatMap((segment) =>
            segment.he
              .flat()
              .filter((run) => run.s !== 'n')
              .map((run) => run.t),
          )
          .join(' '),
      ).slice(0, 120);
    for (const nusach of ['edot_hamizrach', 'sefard', 'chabad'] as Nusach[]) {
      const sections = sectionsOn(nusach, tuesday);
      expect(firstWords(sections.find((section) => section.chapter?.he === 'הודו')!)).toMatch(/הודו ל\S+ קראו בשמו/);
      expect(firstWords(sections.find((section) => section.chapter?.he === 'פסוקי דזמרה')!)).toMatch(/ברוך שאמר/);
    }
  });

  it('starts every chapter at the first section of a run that shares its title', () => {
    for (const nusach of NUSCHAOT) {
      const sections = sectionsOn(nusach, tuesday);
      expect(sections[0].chapter).toBeDefined();
      sections.forEach((section, index) => {
        if (section.chapter && index > 0) expect(sections[index - 1].title.he).not.toBe(section.title.he);
      });
    }
  });

  it('no text but Shacharit and Tehillim carries chapters, so the other pickers keep listing every section', () => {
    for (const nusach of NUSCHAOT) {
      for (const id of TEXT_IDS.filter((candidate) => candidate !== 'shacharit' && candidate !== 'tehillim')) {
        expect(load(nusach, id).sections.some((section) => section.chapter)).toBe(false);
      }
    }
  });
});

describe('English stays aligned with its Hebrew', () => {
  const EDOT: Nusach = 'edot_hamizrach';
  const SOURCE_DEFECTS = [
    /page 000/,
    /Fundamentals of Kuzari/,
    /\(page \d+\)/,
    /\(For$/,
    /coming if His/,
    /pay need to/,
    /and any modest/,
    /Rabbi Eliezer said on behalf/,
    /yolk of/,
    /bless you and guard them/,
    /S\.R\. Hirsch/,
    /tower of deliverance to His king,\)/,
    /potion of my cup/,
    /groom and bridge/,
    /Seduat/,
    /whom to rely on/,
    /Tehillim \/ Psalm 84\)/,
    /\[And the Congregation Answers:\] \[This is\] Truth/,
    /desired destination in peace/,
    /in our every handiwork/,
    /sound of our supplication/,
    /Remember us for kindness/,
    /grant us peace, kindness/,
    /for a life of kindness/,
  ];
  const MAARIV_DEFECTS = [/in this case, the Pesukei Dezimrah/];
  const HEBREW_ONLY_NOTES: [Nusach, SiddurTextId, string][] = [
    ['sefard', 'shacharit', 'אלו ימים שאין אומרים'],
    ['sefard', 'shacharit', 'מה שתקנו לאומרו'],
    ['ashkenaz', 'shacharit', 'מה שתקנו לאומרו'],
    ['sefard', 'shacharit', 'טעם נכון למה נתקן הוידוי'],
    ['ashkenaz', 'shacharit', 'טעם נכון למה נתקן הוידוי'],
    ['ashkenaz', 'mincha', 'טעם נכון למה נתקן הוידוי'],
    ['sefard', 'mincha', 'אין נופלין על פניהם'],
  ];
  const segmentsOf = (nusach: Nusach, id: SiddurTextId) =>
    load(nusach, id).sections.flatMap((section) => section.segments);
  const hebrewOf = (segment: SiddurSegment, keep: (run: Run) => boolean = () => true) =>
    letters(
      segment.he
        .map((paragraph) =>
          paragraph
            .filter(keep)
            .map((run) => run.t)
            .join(''),
        )
        .join(' '),
    ).trim();
  const startingWith = (segments: SiddurSegment[], prefix: string) => {
    const found = segments.filter((segment) =>
      [hebrewOf(segment), hebrewOf(segment, (run) => run.s !== 'n')].some((text) => text.startsWith(prefix)),
    );
    if (!found.length) throw new Error(`no segment starts with "${prefix}"`);
    return found;
  };

  it('carries none of the source defects the alignment audit found', () => {
    const found: string[] = [];
    for (const nusach of NUSCHAOT) {
      for (const id of TEXT_IDS) {
        const defects = id === 'maariv' ? [...SOURCE_DEFECTS, ...MAARIV_DEFECTS] : SOURCE_DEFECTS;
        for (const segment of segmentsOf(nusach, id)) {
          for (const defect of defects) {
            if (segment.en && defect.test(segment.en)) found.push(`${nusach}/${id} ${defect}`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('moves each Edot HaMizrach sentence to the segment that holds its Hebrew', () => {
    for (const id of ['shacharit', 'mincha', 'maariv'] as const) {
      const segments = segmentsOf(EDOT, id);
      expect(startingWith(segments, 'ובתורתך')[0].en).toMatch(/^And in Your Torah/);
      expect(startingWith(segments, 'על כן נקוה')[0].en).not.toMatch(/Hear Oh Israel/);
      expect(startingWith(segments, 'למען יחלצון')[0].en).toMatch(/answer us\.?$/);
      for (const elohaiNetzor of startingWith(segments, 'אלהי נצר')) {
        expect(elohaiNetzor.en ?? '').not.toMatch(/answer us/);
      }
    }

    const mincha = segmentsOf(EDOT, 'mincha');
    expect(startingWith(mincha, 'יברכך יהוה וישמרך ועונים אמן')[0].en).toMatch(/bless you.*shine.*lift/s);
    expect(startingWith(mincha, 'ואומר החזן והכהנים')[0].en).toBeUndefined();
    expect(startingWith(mincha, 'רבון העולמים עשינו')[0].en).toBeUndefined();
    expect(startingWith(mincha, 'רבון העולמים גלוי לפניך')[0].en).toBeUndefined();
    const afterYechaltzun = mincha[mincha.indexOf(startingWith(mincha, 'למען יחלצון')[0]) + 1];
    expect(hebrewOf(afterYechaltzun)).toMatch(/^יהיו לרצון/);
    expect(afterYechaltzun.en).toMatch(/my Rock/);

    const maariv = segmentsOf(EDOT, 'maariv');
    const hashkiveinu = startingWith(maariv, 'השכיבנו')[0];
    expect(hashkiveinu.en).toMatch(/And guard us\.$/);
    expect(hashkiveinu.en).not.toMatch(/Jerusalem/);
    expect(startingWith(maariv, 'וחוזר החזן יהוה אלהיכם אמת')[0].en).toMatch(/The L-rd, Your G-d is True/);
    expect(startingWith(maariv, 'ויאמר')[0].en).not.toMatch(/Repeat/);
  });

  it('trims the translation memory’s English of the Edot HaMizrach maariv Half-Kaddish to its one sentence', () => {
    const shemaBlessings = resolveSiddurText(load(EDOT, 'maariv'), day(9, months.CHESHVAN, 5787)).find(
      (section) => section.title.he === 'קריאת שמע וברכותיה',
    )!;
    const halfKaddish = shemaBlessings.segments.filter((segment) => hebrewOf(segment) === 'ואומר החזן חצי קדיש');
    expect(halfKaddish).toHaveLength(1);
    expect(halfKaddish[0].en).toBe('The Half-Kaddish is recited by the Chazzan.');
  });

  it('keeps Metsudah editorial notes Hebrew-only where their English is a different note', () => {
    const withEnglish = HEBREW_ONLY_NOTES.filter(([nusach, id, note]) =>
      startingWith(segmentsOf(nusach, id), note).some((segment) => segment.en !== undefined),
    ).map(([nusach, id, note]) => `${nusach}/${id} ${note}`);
    expect(withEnglish).toEqual([]);
  });

  it('puts the Shema Koleinu chatimah and the Omer blessing on their own segments', () => {
    const sefardAmidah = segmentsOf('sefard', 'shacharit');
    const shemaKoleinu = startingWith(sefardAmidah, 'אב הרחמן שמע קולנו')[0];
    expect(shemaKoleinu.en).not.toMatch(/Blessed are You/);
    const chatimah = sefardAmidah
      .slice(sefardAmidah.indexOf(shemaKoleinu) + 1)
      .find((segment) => hebrewOf(segment).endsWith('שומע תפלה'));
    expect(chatimah?.en).toMatch(/^for You hear the prayers of every mouth/);

    expect(startingWith(segmentsOf('ashkenaz', 'mincha'), 'שמע קולנו')[0].en).not.toMatch(/Blessed are You/);

    for (const nusach of ['ashkenaz', 'sefard'] as const) {
      for (const id of ['maariv', 'sefirat_haomer'] as const) {
        const segments = segmentsOf(nusach, id);
        expect(startingWith(segments, 'הנני מוכן ומזמן')[0].en).not.toMatch(/Blessed are You/);
        expect(segments.filter((segment) => /commanded us to count the Omer/.test(segment.en ?? ''))).toHaveLength(1);
      }
    }
  });

  it('corrects the one word the pinned translation gets wrong in two passages, and writes no translation where it has none', () => {
    const [traveler] = startingWith(segmentsOf('ashkenaz', 'tefilat_haderech'), 'יהי רצון מלפניך');
    expect(traveler.en).toContain(
      'May You grant us grace, kindness, and mercy in your eyes and in the eyes of all who see us, because You are the God who hears prayer and supplications.',
    );
    expect(traveler.en).not.toMatch(/peace, kindness/);

    const [tenDays] = startingWith(segmentsOf('chabad', 'mincha'), 'מי כמוך אב הרחמן');
    expect(tenDays.en).toBe(
      'During Ten Days of Repentance: Who is like You, Merciful Father, remember us with compassion for a life of mercy.',
    );

    const [edotTraveler] = startingWith(segmentsOf(EDOT, 'tefilat_haderech'), 'יהי רצון מלפניך');
    expect(
      edotTraveler.he
        .flat()
        .map((run) => run.t)
        .join(''),
    ).toMatch(/וְתִשְׁלַח בְּרָכָה בְּמַעֲשֵׂה יָדֵֽינוּ/);
    expect(edotTraveler.en).not.toMatch(/handiwork|work of our hands|blessing in/i);
  });

  it("fixes the pinned translations' typos once per source", () => {
    expect(startingWith(segmentsOf('chabad', 'mincha'), 'זכרנו לחיים')[0].en).toMatch(/Remember us for life/);
    expect(startingWith(segmentsOf('chabad', 'shacharit'), 'אדון עולם')[0].en).toMatch(/portion of my cup/);

    const kaddishEnglish = startingWith(segmentsOf('sefard', 'shacharit'), 'יתגדל ויתקדש').flatMap((segment) =>
      segment.en ? [segment.en] : [],
    );
    expect(kaddishEnglish.join('\n')).toMatch(/coming of His Messiah/);

    for (const nusach of ['ashkenaz', 'sefard', 'chabad'] as const) {
      expect(startingWith(segmentsOf(nusach, 'shacharit'), 'אמר רבי אלעזר')[0].en).toMatch(/Rabbi Elazar said/);
    }
  });
});

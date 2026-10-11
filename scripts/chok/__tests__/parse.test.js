const fs = require('fs');
const path = require('path');
const { decodePage, parsePage, gematria } = require('../parse');

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixture.html'), 'utf8');
const REPAIRS = { strayOpenings: ['It 9:9'], noTargum: ['1:7'] };
const RASHI = { he: 'רש״י', en: 'Rashi' };
const note = (t) => ({ t, s: 'n' });
const targum = (t) => [{ t, s: 't' }];

describe('decodePage', () => {
  it('decodes windows-1255 bytes', () => {
    expect(decodePage(Uint8Array.from([0xf9, 0xec, 0xe5, 0xed]))).toBe('שלום');
  });

  it('puts the vowel points in canonical order', () => {
    expect(decodePage(Uint8Array.from([0xe1, 0xcc, 0xc7]))).toBe('ב\u05b7\u05bc');
  });
});

describe('gematria', () => {
  it('writes chapter and verse numbers as the source prints them', () => {
    expect([1, 15, 16, 26, 52, 89, 100, 115, 116, 176].map(gematria)).toEqual([
      'א',
      'טו',
      'טז',
      'כו',
      'נב',
      'פט',
      'ק',
      'קטו',
      'קטז',
      'קעו',
    ]);
  });
});

describe('parsePage on the synthetic fixture', () => {
  const slots = parsePage(FIXTURE, REPAIRS, 'fixture');

  it('finds each day by its anchor name, the spelling יום שלשי included, and ignores other named links', () => {
    expect(Object.keys(slots)).toEqual(['sun', 'tue', 'thuNight', 'fri']);
  });

  it('splits a day at its section headings and skips the note-icon link', () => {
    expect(slots.sun.map((s) => [s.kind, s.heading])).toEqual([
      ['torah', 'תורה'],
      ['neviim', 'נביאים - ספר - פרק ג'],
      ['ketuvim', 'כתובים - ספר - פרק ז'],
      ['mishnah', 'משנה מסכת פרק ב'],
      ['gemara', "גמרא מסכת דף ב' ע״א"],
      ['zohar', "זוהר פרשה דף ג' ע״ב"],
      ['halacha', 'הלכה פסוקה'],
      ['mussar', 'מוסר'],
    ]);
  });

  it('builds a Torah verse with its number, its Onkelos and a closed Rashi, after the kavana line', () => {
    expect(slots.sun[0].segments).toEqual([
      { he: [[note('כוונה לפני הקריאה:')]] },
      { he: [[note('א (א) '), { t: 'פָּסוּק רִאשׁוֹן:' }], targum('תַּרְגּוּם רִאשׁוֹן:')], verse: [1, 1] },
      { he: [[{ t: 'פֵּירוּשׁ ' }, note('(מקור א)'), { t: ' קָצָר:' }]], optional: RASHI },
      { he: [[note('(ב) '), { t: 'פָּסוּק שֵׁנִי:' }], targum('תַּרְגּוּם שֵׁנִי:')], verse: [1, 2] },
    ]);
  });

  it("takes the uncoded Nevi'im targum and joins a Rashi the source split across two spans", () => {
    expect(slots.sun[1].segments).toEqual([
      { he: [[note('(ד) '), { t: 'פָּסוּק נָבִיא:' }], targum('תַּרְגּוּם נָבִיא :')], verse: [3, 4] },
      { he: [[{ t: 'דִּבּוּר .', s: 'b' }, { t: ' רֵאשִׁית הֶמְשֵׁךְ :' }]], optional: RASHI },
      { he: [[note('(ה) '), { t: 'פָּסוּק נָבִיא שֵׁנִי:' }], targum('תַּרְגּוּם נָבִיא שֵׁנִי :')], verse: [3, 5] },
    ]);
  });

  it('keeps a ketiv inside a verse as a note and keeps a Rashi the source cut short', () => {
    expect(slots.sun[2].segments).toEqual([
      {
        he: [[note('(ט) '), { t: 'פָּסוּק ' }, note('(כתיב)'), { t: ' קְרִי:' }], targum('תַּרְגּוּם כְּתוּבִים :')],
        verse: [7, 9],
      },
      { he: [[{ t: 'פָּסוּק .', s: 'b' }, { t: ' קָטוּעַ' }]], optional: RASHI },
    ]);
  });

  it('folds each Bartenura after its mishnah', () => {
    expect(slots.sun[3].segments).toEqual([
      { he: [[{ t: 'א.', s: 'b' }, { t: ' מִשְׁנָה רִאשׁוֹנָה ' }, note('(גִּרְסָה)'), { t: ' סוֹף.' }]] },
      {
        he: [[note('(א)'), { t: ' משנה ראשונה.', s: 'b' }, { t: ' פירוש:' }, { t: ' סוף.', s: 'b' }, { t: ' עוד' }]],
        optional: { he: 'ברטנורה', en: 'Bartenura' },
      },
      { he: [[{ t: 'ב.', s: 'b' }, { t: ' מִשְׁנָה שְׁנִיָּה' }]] },
    ]);
  });

  it('reads Gemara, Zohar, halacha and mussar as plain text, with their folds and their sources as notes', () => {
    expect(slots.sun.slice(4).map((s) => s.segments)).toEqual([
      [
        { he: [[{ t: 'גְּמָרָא אָמַר ' }, note('(פסוק ט״ו)'), { t: " וְגוֹ' סוֹף" }]] },
        { he: [[{ t: 'אמר.', s: 'b' }, { t: ' פירוש גמרא:' }]], optional: RASHI },
      ],
      [
        { he: [[{ t: 'זֹהַר אֲרָמִית' }]] },
        { he: [[{ t: 'זֹהַר עִבְרִית' }]], optional: { he: 'תרגום הזוהר', en: 'Zohar translation' } },
      ],
      [{ he: [[note('מקור ההלכה ז״ל')], [{ t: 'א.', s: 'b' }, { t: ' הֲלָכָה רִאשׁוֹנָה' }]] }],
      [{ he: [[{ t: 'מוּסָר קָצָר' }]] }],
    ]);
  });

  it('reads a page drawn in pixel sizes whose day anchor is also its Torah heading', () => {
    expect(slots.tue).toEqual([
      {
        kind: 'torah',
        heading: 'תורה',
        segments: [
          { he: [[note('(ג) '), { t: 'פָּסוּק שְׁלִישִׁי:' }], targum('תַּרְגּוּם שְׁלִישִׁי:')], verse: [1, 3] },
        ],
      },
    ]);
  });

  it('repairs the source defects of a Torah section', () => {
    expect(slots.thuNight.map((s) => s.kind)).toEqual(['torah']);
    expect(slots.thuNight[0].segments).toEqual([
      { he: [[note('(ג) '), { t: 'פָּסוּק שְׁלִישִׁי:' }], targum('תַּרְגּוּם שְׁלִישִׁי:')], verse: [1, 3] },
      { he: [[note('(ד) רביעי '), { t: 'פָּסוּק רְבִיעִי:' }], targum('וּבְנֵי תַּרְגּוּם:')], verse: [1, 4] },
      { he: [[note('(ה) חמישי'), { t: ' פָּסוּק חֲמִישִׁי:' }], targum('תַּרְגּוּם חֲמִישִׁי:')], verse: [1, 5] },
      { he: [[note('(ו) '), { t: 'פָּסוּק שִׁשִּׁי:' }], targum('תַּרְגּוּם שִׁשִּׁי:')], verse: [1, 6] },
      { he: [[{ t: 'פֵּירוּשׁ שִׁשִּׁי:' }]], optional: RASHI },
      { he: [[note('(ז) '), { t: 'חֲצִי פָּסוּק' }]], verse: [1, 7] },
      { he: [[note('ב (א) '), { t: 'פֶּרֶק שֵׁנִי:' }], targum('תַּרְגּוּם פֶּרֶק:')], verse: [2, 1] },
      { he: [[note('הוראה לסוף הקריאה.')]] },
    ]);
  });

  it('reads both haftarah variants, keeps a note between verses and stops at the end of the content cell', () => {
    expect(slots.fri.map((s) => [s.kind, s.variant ?? null])).toEqual([
      ['torah', null],
      ['haftarah', 'sephardi'],
      ['haftarah', 'ashkenazi'],
      ['mishnah', null],
    ]);
    expect(slots.fri[1].segments).toEqual([
      { he: [[note('ד (א) '), { t: 'הַפְטָרָה סְפָרַדִּית:' }]], verse: [4, 1] },
      { he: [[note('(ב) '), { t: 'סוֹף ' }, note('(כתיב)'), { t: ' הַפְטָרָה:' }]], verse: [4, 2] },
      { he: [[note('(כאן מסיימים)')]] },
    ]);
    expect(slots.fri[2].segments).toEqual([
      { he: [[note('ה (א) '), { t: 'הַפְטָרָה אַשְׁכְּנַזִּית:' }]], verse: [5, 1] },
    ]);
    expect(slots.fri[3].segments).toEqual([{ he: [[{ t: 'מִשְׁנַת שִׁשִּׁי' }]] }]);
  });
});

describe('parsePage failures', () => {
  it('fails on a Torah verse without Onkelos that is not listed', () => {
    expect(() => parsePage(FIXTURE, { strayOpenings: ['It 9:9'] }, 'fixture')).toThrow(
      'fixture thuNight תורה 1:7: targum has 0 paragraphs',
    );
  });

  it('fails on an empty opening code that is not listed', () => {
    expect(() => parsePage(FIXTURE, { noTargum: ['1:7'] }, 'fixture')).toThrow(
      'fixture thuNight תורה 9:9: verse never closes',
    );
  });

  it('fails on a heading of an unknown kind and on a page without day anchors', () => {
    const page = '<a href="#x יום ראשון   תורה!" name="יום ראשון">x</a><a href="#פרק אחר!">פרק אחר</a>';
    expect(() => parsePage(page, {}, 'mini')).toThrow('mini sun: unknown heading "פרק אחר"');
    expect(() => parsePage('<p>nothing</p>', {}, 'mini')).toThrow('mini: no day anchors');
  });
});

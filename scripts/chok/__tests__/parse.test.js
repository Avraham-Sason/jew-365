const fs = require('fs');
const path = require('path');
const {
  decodeSource,
  parseHeader,
  macroRules,
  sourceRules,
  badgeMacros,
  expandLine,
  parseBook,
  gematria,
} = require('../parse');

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixture.txt'), 'utf8');
const HEADER = FIXTURE.split('\n')[0];
const RASHI = { he: 'רש״י', en: 'Rashi' };
const BARTENURA = { he: 'ברטנורה', en: 'Bartenura' };
const ZOHAR = { he: 'תרגום הזוהר', en: 'Zohar translation' };
const note = (t) => ({ t, s: 'n' });
const targum = (t) => [{ t, s: 't' }];

const rules = sourceRules([FIXTURE])[0];
const book = parseBook(FIXTURE, rules, 'fixture');
const slots = book[0].slots;
const mini = (body) => `${HEADER}\n# פרשת א\n${body}`;

describe('decodeSource', () => {
  it('decodes windows-1255 bytes', () => {
    expect(decodeSource(Uint8Array.from([0xf9, 0xec, 0xe5, 0xed]))).toBe('שלום');
  });

  it('puts the vowel points in canonical order', () => {
    expect(decodeSource(Uint8Array.from([0xe1, 0xcc, 0xc7]))).toBe('בַּ');
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

describe('parseHeader', () => {
  it('splits the first line into its fields', () => {
    const header = parseHeader(HEADER);
    expect(header.UniqueId).toBe('9001');
    expect(header.TextSource).toBe('מקור בדיקה');
    expect(header.CosmeticsType.startsWith('#nik=1')).toBe(true);
  });
});

describe('macroRules', () => {
  it('reads every replacement pair of the rep parts, in header order', () => {
    expect(rules).toHaveLength(14);
    expect(rules[0]).toEqual(['(', '<small><small>(']);
    expect(rules[1]).toEqual([')', ')</small></small>']);
    expect(rules[13][0]).toBe('<j>');
  });

  it('rejects a pair without a replacement', () => {
    expect(() => macroRules('#rep=abc')).toThrow('bad macro "abc"');
  });
});

describe('sourceRules', () => {
  it('resolves a reference to another file by its UniqueId', () => {
    expect(sourceRules([FIXTURE, '&UniqueId=9002&CosmeticsType==9001&GroupId=t2\n'])[1]).toEqual(rules);
  });

  it('rejects an unknown reference', () => {
    expect(() => sourceRules(['&UniqueId=1&CosmeticsType==9999\n'])).toThrow('cosmetics reference 9999 not found');
  });
});

describe('badgeMacros', () => {
  it('lists the macros that draw a commentary badge', () => {
    expect(badgeMacros(rules)).toEqual([
      '<RashiTitle1>',
      '<RashiTitle2>',
      '<BartaTitle>',
      '<RashiTitle5>',
      '<ZoharTitle>',
    ]);
  });
});

describe('expandLine', () => {
  it('applies the macros, then the question mark and the spaces', () => {
    expect(expandLine('(א) <QM> _nbsp;x &nbspy', rules)).toBe('<small><small>(א)</small></small> ? &nbsp;x &nbsp;y');
  });
});

describe('parseBook on the synthetic fixture', () => {
  it('skips the intro and counts the badges of the parasha', () => {
    expect(book).toHaveLength(1);
    expect(book[0].heading).toBe('ראשונה');
    expect(book[0].badges).toBe(5);
    expect(Object.keys(slots)).toEqual(['sun', 'thuNight', 'fri']);
  });

  it('reads CRLF lines the same', () => {
    expect(parseBook(FIXTURE.replace(/\n/g, '\r\n'), rules, 'fixture')).toEqual(book);
  });

  it('splits a day at its section headings', () => {
    expect(slots.sun.map((s) => [s.kind, s.heading])).toEqual([
      ['torah', 'תורה'],
      ['neviim', 'נביאים - ספר - פרק ג'],
      ['mishnah', 'משנה מסכת פרק א'],
      ['gemara', "גמרא מסכת דף ב' ע״א"],
      ['zohar', 'זוהר פרשה דף ג ע״ב'],
      ['halacha', 'הלכה פסוקה'],
      ['mussar', 'מוסר'],
    ]);
  });

  it('cuts a Torah section into verses with Onkelos, a lead note and a commentary', () => {
    expect(slots.sun[0].segments).toEqual([
      { he: [[note('כוונה לפני הקריאה:')]] },
      { he: [[note('א (א) '), { t: 'פָּסוּק רִאשׁוֹן:' }], targum('תַּרְגּוּם רִאשׁוֹן:')], verse: [1, 1] },
      { he: [[{ t: 'פֵּירוּשׁ ' }, note('(מקור א)'), { t: ' קָצָר:' }]], optional: RASHI },
      { he: [[note('(ב) שני '), { t: 'פָּסוּק שֵׁנִי:' }], targum('תַּרְגּוּם שֵׁנִי:')], verse: [1, 2] },
    ]);
  });

  it("cuts a Nevi'im section with the Targum of the prophets", () => {
    expect(slots.sun[1].segments).toEqual([
      { he: [[note('(ד) '), { t: 'פָּסוּק נָבִיא:' }], targum('תַּרְגּוּם נָבִיא :')], verse: [3, 4] },
      { he: [[{ t: 'דִּבּוּר .', s: 'b' }, { t: ' פֵּירוּשׁ נָבִיא :' }]], optional: RASHI },
      { he: [[note('(ה) '), { t: 'פָּסוּק נָבִיא שֵׁנִי:' }], targum('תַּרְגּוּם נָבִיא שֵׁנִי :')], verse: [3, 5] },
    ]);
  });

  it('cuts a Mishnah at its commentary', () => {
    expect(slots.sun[2].segments).toEqual([
      { he: [[{ t: 'א.', s: 'b' }, { t: ' מִשְׁנָה רִאשׁוֹנָה ' }, note('(גִּרְסָה)'), { t: ' סוֹף:' }]] },
      { he: [[note('(א)'), { t: ' משנה ראשונה.', s: 'b' }, { t: ' פירוש ברטנורה:' }]], optional: BARTENURA },
      { he: [[{ t: 'ב.', s: 'b' }, { t: ' מִשְׁנָה שְׁנִיָּה:' }]] },
    ]);
  });

  it('cuts the prose sections', () => {
    expect(slots.sun.slice(3).map((s) => s.segments)).toEqual([
      [
        { he: [[{ t: 'גְּמָרָא אָמַר ' }, note('(פסוק ט״ו)'), { t: " וְגוֹ' סוֹף:" }]] },
        { he: [[{ t: 'אמר.', s: 'b' }, { t: ' פירוש גמרא:' }]], optional: RASHI },
      ],
      [{ he: [[{ t: 'זֹהַר אֲרָמִית:' }]] }, { he: [[{ t: 'זֹהַר עִבְרִית.' }]], optional: ZOHAR }],
      [{ he: [[note('מקור ההלכה ז״ל')], [{ t: 'א.', s: 'b' }, { t: ' הֲלָכָה רִאשׁוֹנָה? כֵּן:' }]] }],
      [{ he: [[{ t: 'מוּסָר קָצָר:' }]] }],
    ]);
  });

  it('keeps the Thursday night verse', () => {
    expect(slots.thuNight).toEqual([
      {
        kind: 'torah',
        heading: 'תורה',
        segments: [
          { he: [[note('(ג) '), { t: 'פָּסוּק שְׁלִישִׁי:' }], targum('תַּרְגּוּם שְׁלִישִׁי:')], verse: [1, 3] },
        ],
      },
    ]);
  });

  it('keeps a day without Torah and both haftarah variants', () => {
    expect(slots.fri.map((s) => [s.kind, s.variant ?? null])).toEqual([
      ['haftarah', 'sephardi'],
      ['haftarah', 'ashkenazi'],
      ['mishnah', null],
    ]);
    expect(slots.fri[0].segments).toEqual([
      { he: [[note('ד (א) '), { t: 'הַפְטָרָה סְפָרַדִּית:' }]], verse: [4, 1] },
      { he: [[note('כאן מסיימים')]] },
    ]);
    expect(slots.fri[1].segments).toEqual([
      { he: [[note('ה (א) '), { t: 'הַפְטָרָה אַשְׁכְּנַזִּית:' }]], verse: [5, 1] },
    ]);
    expect(slots.fri[2].segments).toEqual([{ he: [[{ t: 'א.', s: 'b' }, { t: ' מִשְׁנַת שִׁשִּׁי:' }]] }]);
  });
});

describe('parseBook failures', () => {
  it.each([
    ['@ א יום ראשון   תורה\n~ פרק אחר\n', 'mini א sun: unknown heading "פרק אחר"'],
    ['@ א יום שמיני\n', 'mini א: unknown day heading "@ א יום שמיני"'],
    ['@ א יום ראשון\n@ א יום ראשון\n', 'mini א sun: day appears twice'],
    ['@ א יום ראשון\n<TF>x</TF>\n', "mini line 4: the te'amim encoding <TF> has no decoder"],
    ['טקסט\n@ א יום ראשון\n', 'mini line 3: text before the first day of א'],
    ['@ א יום ראשון\n~ מוסר\n', 'mini א sun מוסר: empty section'],
  ])('rejects %j', (body, message) => {
    expect(() => parseBook(mini(body), rules, 'mini')).toThrow(message);
  });

  it('rejects an unknown book heading', () => {
    expect(() => parseBook(`${HEADER}\n# משהו\n`, rules, 'mini')).toThrow('mini line 2: unknown book heading "# משהו"');
  });
});

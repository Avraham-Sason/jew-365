const { SLOTS, expectedKinds, validateParasha } = require('../validate');
const { VERSE_COUNT_EXCEPTIONS } = require('../manifest');

const DAILY = ['mishnah', 'gemara', 'zohar', 'halacha', 'mussar'];
const RASHI = { he: 'רש״י', en: 'Rashi' };
const COUNTS = { sun: 6, mon: 4, tue: 5, wed: 6, thu: 5, thuNight: 26, fri: 3 };

const verseSegment = (c, p) => ({ he: [[{ t: `(${p}) `, s: 'n' }, { t: 'פָּסוּק' }]], verse: [c, p] });
const proseSegment = () => ({ he: [[{ t: 'טֶקְסְט' }]] });

const badges = (slots) =>
  Object.values(slots)
    .flat()
    .flatMap((s) => s.segments)
    .filter((g) => g.optional).length;

function validParasha(parasha, overrides = {}) {
  const counts = { ...COUNTS, ...VERSE_COUNT_EXCEPTIONS[parasha], ...overrides };
  let p = 0;
  const slots = {};
  for (const slot of SLOTS) {
    slots[slot] = expectedKinds(parasha, slot).map((entry) => {
      const [kind, variant] = entry.split(':');
      const heading = `${kind} ${slot}${variant ? ` ${variant}` : ''}`;
      const section = { kind, heading, ...(variant ? { variant } : {}) };
      if (kind === 'torah') {
        const segments = [];
        for (let n = 0; n < counts[slot]; n++) segments.push(verseSegment(1, ++p));
        segments.splice(1, 0, { he: [[{ t: 'פֵּירוּשׁ' }]], optional: RASHI });
        return { ...section, segments };
      }
      if (kind === 'neviim' || kind === 'ketuvim' || kind === 'haftarah') {
        return { ...section, segments: [verseSegment(5, 1), verseSegment(5, 2), verseSegment(6, 1)] };
      }
      return { ...section, segments: [proseSegment()] };
    });
  }
  return slots;
}

describe('expected structure', () => {
  it('lists the seven slots', () => {
    expect(SLOTS).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'thuNight', 'fri']);
  });

  it.each([
    ['Noach', 'sun', ['torah', 'neviim', 'ketuvim', ...DAILY]],
    ['Noach', 'thu', ['torah', 'neviim', 'ketuvim', ...DAILY]],
    ['Noach', 'thuNight', ['torah']],
    ['Noach', 'fri', ['torah', 'haftarah', ...DAILY]],
    ['Vayakhel', 'fri', ['torah', 'haftarah:sephardi', 'haftarah:ashkenazi', ...DAILY]],
    ['Tetzaveh', 'fri', ['torah', ...DAILY]],
    ['Nitzavim', 'thuNight', ['torah', 'haftarah']],
    ['Nitzavim', 'fri', DAILY],
    ["Ha'azinu", 'fri', DAILY],
    ['Vezot Haberakhah', 'thuNight', ['torah', 'haftarah']],
    ['Vezot Haberakhah', 'fri', DAILY],
  ])('%s %s', (parasha, slot, kinds) => {
    expect(expectedKinds(parasha, slot)).toEqual(kinds);
  });
});

describe('validateParasha', () => {
  it.each(['Noach', 'Vayakhel', 'Tetzaveh', 'Pinchas', 'Nitzavim', 'Vezot Haberakhah'])(
    'accepts a well-formed %s',
    (parasha) => {
      const slots = validParasha(parasha);
      expect(validateParasha(parasha, slots, badges(slots))).toEqual([]);
    },
  );

  it('applies a verse-count exception only to its own parasha', () => {
    const slots = validParasha('Noach', { thuNight: 14 });
    expect(validateParasha('Noach', slots, badges(slots))).toEqual(['Noach thuNight: 14 Torah verses, expected 26']);
  });

  it('reports a missing Torah verse twice: the count and the break in the order', () => {
    const noach = validParasha('Noach');
    noach.mon[0].segments.splice(2, 1);
    expect(validateParasha('Noach', noach, badges(noach))).toEqual([
      'Noach mon: 3 Torah verses, expected 4',
      'Noach mon: Torah verse 1:9 after 1:7',
    ]);
  });

  it('reports a missing slot, sections out of order and an unknown label', () => {
    const noach = validParasha('Noach');
    delete noach.fri;
    noach.sun.reverse();
    noach.mon[0].segments[1].optional = { he: 'פירוש אחר', en: 'Other' };
    expect(validateParasha('Noach', noach, badges(noach))).toEqual([
      'Noach: slots sun,mon,tue,wed,thu,thuNight instead of sun,mon,tue,wed,thu,thuNight,fri',
      'Noach sun: sections mussar,halacha,zohar,gemara,mishnah,ketuvim,neviim,torah',
      'Noach mon: unknown label פירוש אחר',
    ]);
  });

  it("reports an empty run and a break inside a Nevi'im chapter", () => {
    const noach = validParasha('Noach');
    noach.tue[3].segments[0].he[0].push({ t: '' });
    noach.wed[1].segments[1].verse = [5, 3];
    expect(validateParasha('Noach', noach, badges(noach))).toEqual([
      'Noach tue: empty paragraph or run in mishnah tue',
      'Noach wed: neviim wed: verse 5:3 after 5:1',
    ]);
  });

  it('reports a commentary count that differs from the badges in the source', () => {
    const noach = validParasha('Noach');
    expect(validateParasha('Noach', noach, badges(noach) + 1)).toEqual([
      'Noach: 7 commentaries, 8 badges in the source',
    ]);
  });
});

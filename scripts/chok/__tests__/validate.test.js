const { SLOTS, expectedKinds, expectedSlots, validateParasha } = require('../validate');
const { VERSE_COUNT_EXCEPTIONS } = require('../manifest');

const DAILY = ['mishnah', 'gemara', 'zohar', 'halacha', 'mussar'];
const RASHI = { he: 'רש״י', en: 'Rashi' };
const COUNTS = { sun: 6, mon: 4, tue: 5, wed: 6, thu: 5, thuNight: 26, fri: 3 };

const verseSegment = (c, p) => ({ he: [[{ t: `(${p}) `, s: 'n' }, { t: 'פָּסוּק' }]], verse: [c, p] });
const proseSegment = () => ({ he: [[{ t: 'טֶקְסְט' }]] });

function validParasha(parasha) {
  const counts = { ...COUNTS, ...VERSE_COUNT_EXCEPTIONS[parasha] };
  let p = 0;
  const slots = {};
  for (const slot of expectedSlots(parasha)) {
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
  it('lists the seven slots, and Vezot Haberakhah without Friday', () => {
    expect(SLOTS).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'thuNight', 'fri']);
    expect(expectedSlots('Noach')).toEqual(SLOTS);
    expect(expectedSlots('Vezot Haberakhah')).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'thuNight']);
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
    ['Vezot Haberakhah', 'thuNight', ['torah', 'haftarah', ...DAILY]],
  ])('%s %s', (parasha, slot, kinds) => {
    expect(expectedKinds(parasha, slot)).toEqual(kinds);
  });
});

describe('validateParasha', () => {
  it.each(['Noach', 'Vayakhel', 'Tetzaveh', 'Pinchas', 'Nitzavim', 'Vezot Haberakhah'])(
    'accepts a well-formed %s',
    (parasha) => {
      expect(validateParasha(parasha, validParasha(parasha))).toEqual([]);
    },
  );

  it('applies a verse-count exception only to its own parasha', () => {
    expect(validateParasha('Noach', validParasha('Pinchas'))).toEqual(['Noach mon: 5 Torah verses, expected 4']);
  });

  it('reports a missing Torah verse twice: the count and the break in the order', () => {
    const noach = validParasha('Noach');
    noach.mon[0].segments.splice(2, 1);
    expect(validateParasha('Noach', noach)).toEqual([
      'Noach mon: 3 Torah verses, expected 4',
      'Noach mon: Torah verse 1:9 after 1:7',
    ]);
  });

  it('reports a missing slot, sections out of order and an unknown label', () => {
    const noach = validParasha('Noach');
    delete noach.fri;
    noach.sun.reverse();
    noach.mon[0].segments[1].optional = { he: 'פירוש אחר', en: 'Other' };
    expect(validateParasha('Noach', noach)).toEqual([
      'Noach: slots sun,mon,tue,wed,thu,thuNight instead of sun,mon,tue,wed,thu,thuNight,fri',
      'Noach sun: sections mussar,halacha,zohar,gemara,mishnah,ketuvim,neviim,torah',
      'Noach mon: unknown label פירוש אחר',
    ]);
  });

  it("reports an empty run and a break inside a Nevi'im chapter", () => {
    const noach = validParasha('Noach');
    noach.tue[3].segments[0].he[0].push({ t: '' });
    noach.wed[1].segments[1].verse = [5, 3];
    expect(validateParasha('Noach', noach)).toEqual([
      'Noach tue: empty paragraph or run in mishnah tue',
      'Noach wed: neviim wed: verse 5:3 after 5:1',
    ]);
  });
});

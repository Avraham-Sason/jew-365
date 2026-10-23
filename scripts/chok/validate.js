const {
  VERSE_COUNTS,
  VERSE_COUNT_EXCEPTIONS,
  HAFTARAH_VARIANT_PARASHIYOT,
  NO_HAFTARAH_PARASHIYOT,
  TORAH_ENDS_THURSDAY_NIGHT,
} = require('./manifest');

const SLOTS = ['sun', 'mon', 'tue', 'wed', 'thu', 'thuNight', 'fri'];
const WEEKDAY = ['torah', 'neviim', 'ketuvim', 'mishnah', 'gemara', 'zohar', 'halacha', 'mussar'];
const DAILY = ['mishnah', 'gemara', 'zohar', 'halacha', 'mussar'];
const LABELS = ['רש״י', 'ברטנורה', 'תרגום הזוהר'];

function expectedKinds(parasha, slot) {
  if (slot === 'thuNight') return TORAH_ENDS_THURSDAY_NIGHT.includes(parasha) ? ['torah', 'haftarah'] : ['torah'];
  if (slot !== 'fri') return WEEKDAY;
  if (TORAH_ENDS_THURSDAY_NIGHT.includes(parasha)) return DAILY;
  if (NO_HAFTARAH_PARASHIYOT.includes(parasha)) return ['torah', ...DAILY];
  if (HAFTARAH_VARIANT_PARASHIYOT.includes(parasha))
    return ['torah', 'haftarah:sephardi', 'haftarah:ashkenazi', ...DAILY];
  return ['torah', 'haftarah', ...DAILY];
}

const follows = ([c0, p0], [c1, p1]) => (c1 === c0 && p1 === p0 + 1) || (c1 === c0 + 1 && p1 === 1);

function validateParasha(parasha, slots, badges) {
  const problems = [];
  const at = (slot, text) => problems.push(`${parasha} ${slot}: ${text}`);
  if (Object.keys(slots).join() !== SLOTS.join()) {
    problems.push(`${parasha}: slots ${Object.keys(slots).join()} instead of ${SLOTS.join()}`);
  }
  let previous = null;
  for (const [slot, sections] of Object.entries(slots)) {
    const kinds = sections.map((s) => (s.variant ? `${s.kind}:${s.variant}` : s.kind));
    if (kinds.join() !== expectedKinds(parasha, slot).join()) at(slot, `sections ${kinds.join()}`);
    const headings = sections.map((s) => s.heading);
    if (new Set(headings).size !== headings.length) at(slot, 'repeated heading');
    for (const section of sections) {
      if (!section.segments.length) at(slot, `empty section ${section.heading}`);
      const verses = section.segments.filter((g) => g.verse).map((g) => g.verse);
      if (section.kind === 'torah') {
        const expected = VERSE_COUNT_EXCEPTIONS[parasha]?.[slot] ?? VERSE_COUNTS[slot];
        if (expected !== undefined && verses.length !== expected)
          at(slot, `${verses.length} Torah verses, expected ${expected}`);
        if (slot === 'fri' && !verses.length) at(slot, 'no Torah verses');
        for (const verse of verses) {
          if (previous && !follows(previous, verse))
            at(slot, `Torah verse ${verse.join(':')} after ${previous.join(':')}`);
          previous = verse;
        }
      } else if (section.kind === 'neviim' || section.kind === 'ketuvim') {
        if (!verses.length) at(slot, `no verses in ${section.heading}`);
        verses.slice(1).forEach((verse, n) => {
          if (!follows(verses[n], verse))
            at(slot, `${section.heading}: verse ${verse.join(':')} after ${verses[n].join(':')}`);
        });
      } else if (section.kind === 'haftarah' && !verses.length) {
        at(slot, `no verses in ${section.heading}`);
      }
      for (const segment of section.segments) {
        if (segment.optional && !LABELS.includes(segment.optional.he)) at(slot, `unknown label ${segment.optional.he}`);
        const runs = segment.he.flat();
        if (!segment.he.length || segment.he.some((p) => !p.length) || runs.some((r) => !r.t)) {
          at(slot, `empty paragraph or run in ${section.heading}`);
        }
        if (!runs.some((r) => /[א-ת]/.test(r.t))) at(slot, `segment without text in ${section.heading}`);
      }
    }
  }
  const commentaries = Object.values(slots)
    .flat()
    .flatMap((section) => section.segments)
    .filter((segment) => segment.optional).length;
  if (commentaries !== badges)
    problems.push(`${parasha}: ${commentaries} commentaries, ${badges} badges in the source`);
  return problems;
}

module.exports = { SLOTS, expectedKinds, validateParasha };

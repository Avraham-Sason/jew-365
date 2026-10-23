const { parshiot } = require('@hebcal/core');
const {
  PARASHIYOT,
  CREDIT,
  DEDICATION,
  LICENSE,
  VERSE_COUNT_EXCEPTIONS,
  sourceFiles,
  assetSlug,
  assetFileName,
} = require('../manifest');

describe('chok manifest', () => {
  it("names hebcal's 53 parashiyot and Vezot Haberakhah, each once, with a unique source heading", () => {
    expect(PARASHIYOT.map((entry) => entry.parasha)).toEqual([...parshiot, 'Vezot Haberakhah']);
    const headings = PARASHIYOT.map((entry) => entry.heading);
    expect(new Set(headings).size).toBe(54);
    expect(headings[0]).toBe('בראשית');
    expect(headings[53]).toBe('וזאת הברכה');
  });

  it('gives each parasha a filename-safe slug', () => {
    const slugs = PARASHIYOT.map((entry) => assetSlug(entry.parasha));
    expect(new Set(slugs).size).toBe(54);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(assetSlug("Beha'alotcha")).toBe('beha-alotcha');
    expect(assetSlug('Lech-Lecha')).toBe('lech-lecha');
    expect(assetFileName('Vezot Haberakhah', 'a1b2c3d4')).toBe('vezot-haberakhah.a1b2c3d4.json');
  });

  it('lists the five nikud files, and the te amim ones on request', () => {
    expect(sourceFiles()).toEqual(['y_hok10.txt', 'y_hok20.txt', 'y_hok30.txt', 'y_hok40.txt', 'y_hok50.txt']);
    expect(sourceFiles(true)[0]).toBe('y_hok11.txt');
  });

  it('keeps the credit, the license and the dedication in one place', () => {
    expect(Object.keys(CREDIT).sort()).toEqual(['license', 'title', 'url']);
    expect(DEDICATION).toBeNull();
    expect(LICENSE.urlHe).toBe(LICENSE.url);
    expect(VERSE_COUNT_EXCEPTIONS).not.toHaveProperty('Pinchas');
  });
});

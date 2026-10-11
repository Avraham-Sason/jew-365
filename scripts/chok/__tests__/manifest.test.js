const { parshiot } = require('@hebcal/core');
const { PAGES, CREDIT, DEDICATION, REPAIRS, pageUrl, assetFileName } = require('../manifest');

describe('chok manifest', () => {
  it("names hebcal's 53 parashiyot and Vezot Haberakhah, each once", () => {
    expect(PAGES.map((page) => page.parasha)).toEqual([...parshiot, 'Vezot Haberakhah']);
  });

  it('maps each parasha to its own source page and a filename-safe asset', () => {
    const files = PAGES.map((page) => page.file);
    const assets = PAGES.map((page) => assetFileName(page.parasha));
    expect(new Set(files).size).toBe(54);
    expect(new Set(assets).size).toBe(54);
    for (const asset of assets) expect(asset).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.chok$/);
    expect(assetFileName("Beha'alotcha")).toBe('beha-alotcha.chok');
    expect(assetFileName('Lech-Lecha')).toBe('lech-lecha.chok');
    expect(assetFileName('Vezot Haberakhah')).toBe('vezot-haberakhah.chok');
    expect(pageUrl('noah')).toBe('http://raktora.50webs.com/hokleisrael/noah.htm');
  });

  it('lists repairs only for pages it builds, and keeps the credit and the dedication in one place', () => {
    for (const file of Object.keys(REPAIRS)) expect(PAGES.map((page) => page.file)).toContain(file);
    expect(Object.keys(CREDIT).sort()).toEqual(['license', 'title', 'url']);
    expect(DEDICATION).toBeNull();
  });
});

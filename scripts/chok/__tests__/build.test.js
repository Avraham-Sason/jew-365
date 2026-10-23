const fs = require('fs');
const os = require('os');
const path = require('path');
const { readSources, readParashiyot, buildOutputs, nextContentVersion, licenseText } = require('../build');
const { PARASHIYOT } = require('../manifest');
const { SLOTS } = require('../validate');

jest.setTimeout(120000);

describe('nextContentVersion', () => {
  it('starts at 1 without a previous manifest', () => {
    expect(nextContentVersion(null, { Noach: { sha256: 'a' } })).toBe(1);
  });

  it('keeps the version while every hash is unchanged and raises it when one changes', () => {
    const previous = { version: 3, files: { Noach: { sha256: 'a' }, Bo: { sha256: 'b' } } };
    expect(nextContentVersion(previous, { Noach: { sha256: 'a' }, Bo: { sha256: 'b' } })).toBe(3);
    expect(nextContentVersion(previous, { Noach: { sha256: 'a' }, Bo: { sha256: 'c' } })).toBe(4);
  });
});

describe('licenseText', () => {
  it('states the license and the processing, in Hebrew and English', () => {
    const text = licenseText();
    expect(text).toContain('בניקוד, בלי טעמים');
    expect(text).toContain('CC BY-NC-SA 2.5');
    expect(text).toContain('נוסח הרישיון: https://creativecommons.org/licenses/by-nc-sa/2.5/\n');
    expect(text.endsWith('License: https://creativecommons.org/licenses/by-nc-sa/2.5/\n')).toBe(true);
  });

  it('names the cantillation marks when the te amim files are used', () => {
    expect(licenseText(true)).toContain('בניקוד ובטעמים');
  });
});

describe('readSources', () => {
  it('names the missing te amim files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chok-'));
    expect(() => readSources(true, dir)).toThrow(
      /^te'amim source files missing: y_hok11\.txt, y_hok21\.txt, y_hok31\.txt, y_hok41\.txt, y_hok51\.txt\./,
    );
  });

  it('names the missing nikud files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chok-'));
    expect(() => readSources(false, dir)).toThrow(/^source files missing: y_hok10\.txt/);
  });
});

describe('the committed source', () => {
  it('parses into the 54 parashiyot with all seven days in the first', () => {
    const parashiyot = readParashiyot();
    expect(parashiyot).toHaveLength(54);
    expect(parashiyot.map((entry) => entry.parasha)).toEqual(PARASHIYOT.map((entry) => entry.parasha));
    expect(parashiyot[0].heading).toBe('בראשית');
    expect(Object.keys(parashiyot[0].slots)).toEqual(SLOTS);
  });

  it('is what docs/chok holds', () => {
    for (const [file, content] of buildOutputs()) expect(fs.readFileSync(file, 'utf8')).toBe(content);
  });
});

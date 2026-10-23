#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Buffer } = require('buffer');
const { createHash } = require('crypto');
const {
  TEAMIM,
  SOURCE_DIR,
  SITE_DIR,
  PARASHIYOT,
  CREDIT,
  MANIFEST_CREDIT,
  LICENSE,
  DEDICATION,
  sourceFiles,
  assetFileName,
} = require('./manifest');
const { decodeSource, sourceRules, parseBook } = require('./parse');
const { validateParasha } = require('./validate');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_FILE = path.join(SITE_DIR, 'manifest.json');
const LICENSE_FILE = path.join(SITE_DIR, 'LICENSE.txt');

function readSources(teamim = TEAMIM, dir = SOURCE_DIR) {
  const names = sourceFiles(teamim);
  const missing = names.filter((name) => !fs.existsSync(path.join(dir, name)));
  if (missing.length && teamim) {
    throw new Error(
      `te'amim source files missing: ${missing.join(', ')}. They are local only (gitignored): unpack them from InstallToratEmet.exe with 7-Zip into scripts/chok/source, or set TEAMIM to false`,
    );
  }
  if (missing.length) {
    throw new Error(
      `source files missing: ${missing.join(', ')}. They are committed in scripts/chok/source; restore them with git checkout -- scripts/chok/source`,
    );
  }
  return names.map((name) => decodeSource(fs.readFileSync(path.join(dir, name))));
}

function readParashiyot() {
  const names = sourceFiles();
  const texts = readSources();
  const rules = sourceRules(texts);
  const books = texts.flatMap((text, n) => parseBook(text, rules[n], names[n]));
  const expected = PARASHIYOT.map((entry) => entry.heading);
  for (let i = 0; i < Math.max(books.length, expected.length); i++) {
    if (books[i]?.heading !== expected[i]) {
      throw new Error(`parasha ${i + 1}: "${books[i]?.heading}" instead of "${expected[i]}"`);
    }
  }
  const parashiyot = books.map(({ heading, slots, badges }, i) => ({
    parasha: PARASHIYOT[i].parasha,
    heading,
    slots,
    badges,
  }));
  const problems = parashiyot.flatMap(({ parasha, slots, badges }) => validateParasha(parasha, slots, badges));
  if (problems.length) throw new Error(`validation failed:\n${problems.join('\n')}`);
  return parashiyot;
}

const assetSegment = ({ he, optional }) => (optional ? { he, optional } : { he });

function withoutVerses(slots) {
  return Object.fromEntries(
    Object.entries(slots).map(([slot, sections]) => [
      slot,
      sections.map((section) => ({ ...section, segments: section.segments.map(assetSegment) })),
    ]),
  );
}

function nextContentVersion(previous, files) {
  if (previous === null) return 1;
  const unchanged = Object.entries(files).every(([parasha, file]) => previous.files[parasha]?.sha256 === file.sha256);
  return unchanged ? previous.version : previous.version + 1;
}

function licenseText(teamim = TEAMIM) {
  const marksHe = teamim ? 'בניקוד ובטעמים' : 'בניקוד, בלי טעמים';
  const marksEn = teamim ? 'with vowel points and cantillation marks' : 'with vowel points, without cantillation marks';
  return [
    'חק לישראל, מתוך מאגר תורת אמת',
    `${MANIFEST_CREDIT.he}.`,
    `קובצי ה-JSON בתיקייה זו הם עיבוד של יהודי 365 לטקסט של חק לישראל ממאגר תורת אמת (${marksHe}), ומפורסמים תחת אותו רישיון: ${LICENSE.name} (ייחוס, שימוש לא מסחרי, שיתוף זהה).`,
    `נוסח הרישיון: ${LICENSE.urlHe}`,
    '',
    'Chok LeYisrael, from the Torat Emet database',
    `${MANIFEST_CREDIT.en}.`,
    `The JSON files in this folder are Jew 365's processing of the Chok LeYisrael text of the Torat Emet database (${marksEn}), published under the same license: ${LICENSE.name} (Attribution, NonCommercial, ShareAlike).`,
    `License: ${LICENSE.url}`,
    '',
  ].join('\n');
}

function buildOutputs() {
  const outputs = new Map();
  const files = {};
  const parashiyot = readParashiyot();
  for (const { parasha, slots } of parashiyot) {
    const content = JSON.stringify({ parasha, credit: CREDIT, dedication: DEDICATION, slots: withoutVerses(slots) });
    const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');
    const file = assetFileName(parasha, sha256.slice(0, 8));
    const bytes = Buffer.byteLength(content);
    outputs.set(path.join(SITE_DIR, file), content);
    files[parasha] = { path: file, sha256, bytes };
  }
  const previous = fs.existsSync(MANIFEST_FILE) ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')) : null;
  const manifest = {
    format: 1,
    version: nextContentVersion(previous, files),
    credit: MANIFEST_CREDIT,
    license: LICENSE,
    bytes: Object.values(files).reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
  outputs.set(LICENSE_FILE, licenseText());
  outputs.set(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  return outputs;
}

function writeOutputs(outputs) {
  let written = 0;
  fs.mkdirSync(SITE_DIR, { recursive: true });
  for (const [file, content] of outputs) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) continue;
    fs.writeFileSync(file, content);
    written++;
  }
  for (const name of fs.readdirSync(SITE_DIR)) {
    const file = path.join(SITE_DIR, name);
    if (name.endsWith('.json') && file !== MANIFEST_FILE && !outputs.has(file)) fs.rmSync(file);
  }
  return written;
}

function main() {
  const outputs = buildOutputs();
  const again = buildOutputs();
  for (const [file, content] of outputs) {
    if (again.get(file) !== content) throw new Error(`the build is not deterministic: ${path.relative(ROOT, file)}`);
  }
  const assets = [...outputs].filter(([file]) => file !== MANIFEST_FILE && file !== LICENSE_FILE);
  const raw = assets.reduce((sum, [, content]) => sum + Buffer.byteLength(content), 0);
  const gzipped = assets.reduce(
    (sum, [, content]) => sum + zlib.gzipSync(Buffer.from(content), { level: 9 }).length,
    0,
  );
  const { version } = JSON.parse(outputs.get(MANIFEST_FILE));
  const written = writeOutputs(outputs);
  console.log(`${assets.length} files, ${raw} bytes, ${gzipped} bytes gzipped, content version ${version}`);
  console.log(`wrote ${written} files`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { readSources, readParashiyot, buildOutputs, nextContentVersion, licenseText };

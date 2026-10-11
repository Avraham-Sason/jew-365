#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { TextEncoder } = require('util');
const { PAGES, CREDIT, DEDICATION, REPAIRS, pageUrl, assetFileName } = require('./manifest');
const { decodePage, parsePage } = require('./parse');
const { validateParasha } = require('./validate');

const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const OUT_DIR = path.join(ROOT, 'assets', 'chok');
const ASSET_MAP = path.join(ROOT, 'src', 'data', 'chokAssets.generated.ts');

function assetMapSource(parashiyot) {
  if (!parashiyot.length) return 'export const CHOK_ASSETS: Partial<Record<string, number>> = {};\n';
  const lines = ['export const CHOK_ASSETS: Partial<Record<string, number>> = {'];
  for (const parasha of parashiyot) {
    lines.push(`  ${JSON.stringify(parasha)}: require('../../assets/chok/${assetFileName(parasha)}'),`);
  }
  lines.push('};', '');
  return lines.join('\n');
}

async function ensureCached({ file }) {
  const cached = path.join(CACHE_DIR, `${file}.htm`);
  if (fs.existsSync(cached)) return;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const response = await fetch(pageUrl(file));
  if (!response.ok) throw new Error(`download failed for ${file}: HTTP ${response.status}`);
  fs.writeFileSync(cached, new Uint8Array(await response.arrayBuffer()));
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

function buildOutputs() {
  const outputs = new Map();
  const problems = [];
  for (const { parasha, file } of PAGES) {
    const html = decodePage(fs.readFileSync(path.join(CACHE_DIR, `${file}.htm`)));
    const slots = parsePage(html, REPAIRS[file] ?? {}, file);
    problems.push(...validateParasha(parasha, slots));
    const asset = { parasha, credit: CREDIT, dedication: DEDICATION, slots: withoutVerses(slots) };
    outputs.set(path.join(OUT_DIR, assetFileName(parasha)), JSON.stringify(asset));
  }
  if (problems.length) throw new Error(`validation failed:\n${problems.join('\n')}`);
  outputs.set(ASSET_MAP, assetMapSource(PAGES.map((page) => page.parasha)));
  return outputs;
}

function writeOutputs(outputs) {
  const existing = fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR).map((name) => path.join(OUT_DIR, name)) : [];
  for (const stale of existing.filter((file) => file.endsWith('.chok') && !outputs.has(file))) fs.rmSync(stale);
  for (const [file, content] of outputs) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

async function main() {
  for (const page of PAGES) await ensureCached(page);
  const outputs = buildOutputs();
  const again = buildOutputs();
  for (const [file, content] of outputs) {
    if (again.get(file) !== content) throw new Error(`the build is not deterministic: ${path.relative(ROOT, file)}`);
  }
  writeOutputs(outputs);
  const encoder = new TextEncoder();
  const assets = [...outputs].filter(([file]) => file.endsWith('.chok')).map(([, content]) => encoder.encode(content));
  const raw = assets.reduce((sum, bytes) => sum + bytes.length, 0);
  const gzipped = assets.reduce((sum, bytes) => sum + zlib.gzipSync(bytes, { level: 9 }).length, 0);
  console.log(`${assets.length} assets, ${raw} bytes, ${gzipped} bytes gzipped`);
}

function writeEmpty() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  writeOutputs(new Map([[ASSET_MAP, assetMapSource([])]]));
  console.log('wrote the empty asset map and removed the generated assets');
}

if (process.argv.includes('--empty')) writeEmpty();
else {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

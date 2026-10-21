#!/usr/bin/env node
// Exports the Jew 365 logo SVGs of design/jew365-concepts/vector (built by build.mjs) to the PNG assets
// of assets/ and to src/components/logo.generated.ts. Plain Node plus any Chromium-based browser.
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VECTOR = join(ROOT, 'design', 'jew365-concepts', 'vector');
const ASSETS = join(ROOT, 'assets');
const GENERATED = join(ROOT, 'src', 'components', 'logo.generated.ts');

const CREAM = '#F6F1E8';
const SIZE = 1024;
const EDGE_INSET = 1.2;

function browserCandidates() {
  const env = process.env;
  const home = env.LOCALAPPDATA ?? '';
  const windows = ['PROGRAMFILES', 'PROGRAMFILES(X86)']
    .map((name) => env[name])
    .filter(Boolean)
    .flatMap((base) => [
      join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]);
  if (home) windows.push(join(home, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  const mac = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'chrome'];
  const onPath = (env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .flatMap((dir) => names.map((name) => join(dir, name)));
  return [env.CHROME_PATH, ...windows, ...mac, ...onPath].filter(Boolean);
}

function findBrowser() {
  const found = browserCandidates().find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      'No Chromium-based browser found. Install Chrome or Edge, or set CHROME_PATH to the browser executable.',
    );
  }
  return found;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function readHeader(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG file');
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    depth: buf[24],
    colorType: buf[25],
    interlace: buf[28],
  };
}

function decodePng(buf) {
  const header = readHeader(buf);
  if (header.depth !== 8 || header.interlace)
    throw new Error('Only 8-bit, non-interlaced PNG screenshots are supported');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header.colorType];
  if (!channels) throw new Error(`Unsupported PNG colour type ${header.colorType}`);
  const idat = [];
  for (let pos = 8; pos < buf.length;) {
    const len = buf.readUInt32BE(pos);
    if (buf.toString('ascii', pos + 4, pos + 8) === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = header.width * channels;
  const out = Buffer.alloc(header.height * stride);
  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? out[y * stride + x - channels] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? out[(y - 1) * stride + x - channels] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[y * stride + x] = (value + predicted) & 0xff;
    }
  }
  const rgba = Buffer.alloc(header.width * header.height * 4);
  for (let i = 0; i < header.width * header.height; i++) {
    const px = out.subarray(i * channels, i * channels + channels);
    const gray = header.colorType === 0 || header.colorType === 4;
    rgba[i * 4] = px[0];
    rgba[i * 4 + 1] = gray ? px[0] : px[1];
    rgba[i * 4 + 2] = gray ? px[0] : px[2];
    rgba[i * 4 + 3] = channels === 4 ? px[3] : channels === 2 ? px[1] : 255;
  }
  return { width: header.width, height: header.height, rgba };
}

function cropToTopLeft(image, width, height) {
  if (image.width < width || image.height < height) throw new Error('The screenshot is smaller than the asset');
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    image.rgba.copy(rgba, y * width * 4, y * image.width * 4, (y * image.width + width) * 4);
  return { width, height, rgba };
}

function encodePng({ width, height, rgba }, opaque) {
  const channels = opaque ? 3 : 4;
  const rows = Buffer.alloc(height * (width * channels + 1));
  for (let y = 0; y < height; y++) {
    const at = y * (width * channels + 1);
    rows[at] = 0;
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = at + 1 + x * channels;
      rows[to] = rgba[from];
      rows[to + 1] = rgba[from + 1];
      rows[to + 2] = rgba[from + 2];
      if (!opaque) rows[to + 3] = rgba[from + 3];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function screenshot(browser, html, width, height, dir, name) {
  const page = join(dir, `${name}.html`);
  const shot = join(dir, `${name}.png`);
  writeFileSync(page, html);
  const sandbox = typeof process.getuid === 'function' && process.getuid() === 0 ? ['--no-sandbox'] : [];
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${Math.max(width, 500)},${Math.max(height, 500)}`,
      `--screenshot=${shot}`,
      ...sandbox,
      pathToFileURL(page).href,
    ],
    { stdio: 'ignore', timeout: 120000 },
  );
  let last = -1;
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    if (existsSync(shot)) {
      const size = statSync(shot).size;
      if (size > 0 && size === last) return decodePng(readFileSync(shot));
      last = size;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
  }
  throw new Error(`The browser wrote no screenshot for ${name}`);
}

const readSvg = (name) => readFileSync(join(VECTOR, name), 'utf8').trim();
const viewBoxOf = (svg) =>
  svg
    .match(/viewBox="([^"]+)"/)[1]
    .split(' ')
    .map(Number);

function place(svg, [cx, cy], reach, centre, diameter) {
  const [vx, vy, vw, vh] = viewBoxOf(svg);
  const k = diameter / 2 / reach;
  const left = centre[0] - (cx - vx) * k;
  const top = centre[1] - (cy - vy) * k;
  const style = `position:absolute;left:${left}px;top:${top}px;width:${vw * k}px;height:${vh * k}px;overflow:visible`;
  return svg.replace('<svg ', `<svg style="${style}" `);
}

function fitBox(svg, [bx, by, bw, bh], size, padding) {
  const [vx, vy, vw, vh] = viewBoxOf(svg);
  const k = Math.min((size - 2 * padding) / bw, (size - 2 * padding) / bh);
  const left = size / 2 - (bx + bw / 2 - vx) * k;
  const top = size / 2 - (by + bh / 2 - vy) * k;
  const style = `position:absolute;left:${left}px;top:${top}px;width:${vw * k}px;height:${vh * k}px;overflow:visible`;
  return svg.replace('<svg ', `<svg style="${style}" `);
}

const page = (inner, size, background) =>
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:${background}}</style><div style="position:relative;width:${size}px;height:${size}px;overflow:hidden">${inner}</div>`;

function inkRadius(image) {
  let max = 0;
  const centre = [image.width / 2, image.height / 2];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.rgba[(y * image.width + x) * 4 + 3] > 8)
        max = Math.max(max, Math.hypot(x + 0.5 - centre[0], y + 0.5 - centre[1]));
    }
  }
  return max;
}

function formatWithPrettier(file) {
  try {
    const prettier = createRequire(import.meta.url).resolve('prettier/bin/prettier.cjs');
    execFileSync(process.execPath, [prettier, '--write', file], { stdio: 'ignore' });
  } catch {
    console.warn('prettier is not installed: run pnpm exec prettier --write on logo.generated.ts');
  }
}

function main() {
  const meta = JSON.parse(readFileSync(join(VECTOR, 'mark-o-meta.json'), 'utf8'));
  const browser = findBrowser();
  const dir = mkdtempSync(join(tmpdir(), 'jew365-logo-'));
  const centre = [SIZE / 2, SIZE / 2];
  const report = [];
  try {
    const write = (name, svgHtml, size, { background = 'transparent', opaque = false, maxRadius = null } = {}) => {
      const image = cropToTopLeft(
        screenshot(browser, page(svgHtml, size, background), size, size, dir, name),
        size,
        size,
      );
      const alphas = Array.from({ length: size * size }, (_, i) => image.rgba[i * 4 + 3]);
      if (opaque && alphas.some((a) => a !== 255)) throw new Error(`${name} must be opaque`);
      if (!opaque && (alphas[0] !== 0 || !alphas.some((a) => a > 0))) {
        throw new Error(`${name} must be transparent: the browser rendered an opaque background`);
      }
      let radius = '';
      if (maxRadius) {
        const reached = inkRadius(image);
        if (reached > maxRadius + 1.5)
          throw new Error(`${name}: ink reaches ${reached.toFixed(1)} px, the limit is ${maxRadius}`);
        radius = `ink radius ${reached.toFixed(1)} of ${maxRadius.toFixed(1)}`;
      }
      const target = join(ASSETS, `${name}.png`);
      writeFileSync(target, encodePng(image, opaque));
      const header = readHeader(readFileSync(target));
      report.push(
        `${name}.png ${header.width}x${header.height} colour type ${header.colorType} (${header.colorType === 2 ? 'RGB, opaque' : 'RGBA'}) ${radius}`.trim(),
      );
    };

    const mark = readSvg('mark-o.svg');
    const markMono = readSvg('mark-o-mono.svg');
    const adaptiveRadius = 0.305 * SIZE;
    const adaptiveFill = 0.255 * SIZE;
    const splashRadius = 0.48 * SIZE;

    write('icon', place(mark, meta.mark.center, meta.mark.reach, centre, 0.78 * SIZE), SIZE, {
      background: CREAM,
      opaque: true,
    });
    write('adaptive-icon', place(mark, meta.mark.center, meta.mark.reach, centre, 2 * adaptiveFill), SIZE, {
      maxRadius: adaptiveRadius,
    });
    write('adaptive-monochrome', place(markMono, meta.mark.center, meta.mark.reach, centre, 2 * adaptiveFill), SIZE, {
      maxRadius: adaptiveRadius,
    });
    write('splash', place(mark, meta.mark.center, meta.mark.reach, centre, 2 * (splashRadius - EDGE_INSET)), SIZE, {
      maxRadius: splashRadius,
    });
    write(
      'splash-dark',
      place(readSvg('mark-o-dark.svg'), meta.mark.center, meta.mark.reach, centre, 2 * (splashRadius - EDGE_INSET)),
      SIZE,
      {
        maxRadius: splashRadius,
      },
    );
    write('notification-icon', fitBox(markMono.replaceAll('#000000', '#FFFFFF'), meta.mark.box, 96, 6), 96);
    write('favicon', fitBox(mark, meta.mark.box, 48, 2), 48);
    copyFileSync(join(ASSETS, 'favicon.png'), join(ROOT, 'docs', 'favicon.png'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const clean = (svg) => svg.replace(/<title>[\s\S]*?<\/title>/, '').replace(/\s+(?:class|style)="[^"]*"/g, '');
  const quote = (svg) => `'${svg.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  const aspect = (svg) => {
    const [, , w, h] = viewBoxOf(svg);
    return Number((w / h).toFixed(4));
  };
  const svgs = {
    mark: clean(readSvg('mark-o.svg')),
    markOnDark: clean(readSvg('mark-o-dark.svg')),
    icon: clean(readSvg('mark-o.svg')),
    wordmark: clean(readSvg('wordmark-o.svg')),
    wordmarkOnDark: clean(readSvg('wordmark-o-dark.svg')),
  };
  const lines = Object.entries(svgs).map(([key, svg]) => `  ${key}: ${quote(svg)},`);
  writeFileSync(
    GENERATED,
    [
      '// Generated by scripts/logo/export.mjs from design/jew365-concepts/vector/build.mjs — do not edit.',
      'export const LOGO_SVG = {',
      ...lines,
      '} as const;',
      '',
      `export const LOGO_ASPECT = { mark: ${aspect(svgs.mark)}, icon: ${aspect(svgs.icon)}, wordmark: ${aspect(svgs.wordmark)} } as const;`,
      '',
    ].join('\n'),
  );
  formatWithPrettier(GENERATED);
  report.push('src/components/logo.generated.ts');
  console.log(['Exported:', ...report.map((line) => `  ${line}`)].join('\n'));
}

try {
  main();
} catch (error) {
  console.error(`logo export failed: ${error.message}`);
  process.exit(1);
}

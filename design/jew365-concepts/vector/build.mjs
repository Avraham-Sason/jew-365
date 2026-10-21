import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));

const S = 22;
const R = 24;
const G = 22;
const HAND = 15;
const PIVOT = 9;
const DEGREE = { outer: 56, sw: 17, gap: 14 };
const BIG = { w: 92, h: 104 };
const BIG_W = { w: 104, h: 104 };
const SMALL_J = { w: 60, h: 72 };
const SMALL_W = { w: 78, h: 72 };

const arc = (r, sweep, x, y) => `A${r} ${r} 0 0 ${sweep} ${x} ${y}`;
const tidy = (svg) => svg.replace(/-?\d+\.\d{3,}/g, (n) => String(Number(Number(n).toFixed(2))));

const GLYPHS = {
  three: (w, h) => [
    `M0 0H${w - R}${arc(R, 1, w, R)}V${h - R}${arc(R, 1, w - R, h)}H0`,
    `M${w * 0.3} ${h / 2}H${w}`,
  ],
  e: (w, h) => [
    `M${w} 0H${R}${arc(R, 0, 0, R)}V${h - R}${arc(R, 0, R, h)}H${w}`,
    `M0 ${h / 2}H${w * 0.7}`,
  ],
  w: (w, h) => [
    `M0 0V${h - R}${arc(R, 0, R, h)}H${w - R}${arc(R, 0, w, h - R)}V0`,
    `M${w / 2} ${h * 0.2}V${h}`,
  ],
  j: (w, h) => [
    `M${w} 0V${h - R}${arc(R, 1, w - R, h)}H${R}${arc(R, 1, 0, h - R)}V${h - Math.max(R + 10, h * 0.4)}`,
  ],
  six: (w, h) => [
    `M${w} 0H${R}${arc(R, 0, 0, R)}V${h - R}${arc(R, 0, R, h)}H${w - R}${arc(R, 0, w, h - R)}V${h / 2 + R}${arc(R, 0, w - R, h / 2)}H0`,
  ],
  five: (w, h) => [
    `M${w} 0H0V${h / 2}H${w - R}${arc(R, 1, w, h / 2 + R)}V${h - R}${arc(R, 1, w - R, h)}H0`,
  ],
};

const outerW = (box) => box.w + S;
const outerH = (box) => box.h + S;

function spine() {
  const three = { g: 'three', ...BIG, x: 0, y: 0 };
  const six = { g: 'six', ...BIG, x: outerW(BIG) + G, y: 0 };
  const five = { g: 'five', ...BIG, x: 2 * (outerW(BIG) + G), y: 0 };
  return { three, six, five };
}

function column(jBox, wBox) {
  const right = outerW(BIG);
  return {
    j: { g: 'j', ...jBox, x: right - outerW(jBox), y: -G - outerH(jBox) },
    w: { g: 'w', ...wBox, x: right - outerW(wBox), y: outerH(BIG) + G },
  };
}

const ringLeftOf3 = (outer, sw, align, gap = G) => ({
  type: 'ring',
  sw,
  r: (outer - sw) / 2,
  cx: -gap - outer / 2,
  cy: align === 'top' ? outer / 2 : outerH(BIG) / 2,
});

const clockLeftOf3 = () => {
  const outer = outerH(BIG);
  return { type: 'clock', sw: S, r: (outer - S) / 2, cx: -G - outer / 2, cy: outer / 2 };
};

function samplePath(d, ox, oy) {
  const tokens = d.match(/[MHVA]|-?\d+(?:\.\d+)?/g);
  const pts = [];
  let i = 0;
  let cur = [0, 0];
  const num = () => Number(tokens[i++]);
  const line = (to) => {
    for (let t = 0; t <= 1; t += 0.125) pts.push([cur[0] + (to[0] - cur[0]) * t, cur[1] + (to[1] - cur[1]) * t]);
    cur = to;
  };
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') {
      cur = [num(), num()];
      pts.push(cur);
    } else if (cmd === 'H') line([num(), cur[1]]);
    else if (cmd === 'V') line([cur[0], num()]);
    else if (cmd === 'A') {
      const r = num();
      i += 3;
      const sweep = num();
      const to = [num(), num()];
      const right = [-(to[1] - cur[1]), to[0] - cur[0]];
      const c = [[cur[0], to[1]], [to[0], cur[1]]].find(
        ([x, y]) => Math.sign((x - cur[0]) * right[0] + (y - cur[1]) * right[1]) === (sweep ? 1 : -1),
      );
      const a0 = Math.atan2(cur[1] - c[1], cur[0] - c[0]);
      let da = Math.atan2(to[1] - c[1], to[0] - c[0]) - a0;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      for (let t = 0; t <= 1; t += 0.125) pts.push([c[0] + r * Math.cos(a0 + da * t), c[1] + r * Math.sin(a0 + da * t)]);
      cur = to;
    }
  }
  return pts.map(([x, y]) => [x + ox, y + oy]);
}

const inkPoints = (items) =>
  items.flatMap((it) => GLYPHS[it.g](it.w, it.h).flatMap((d) => samplePath(d, it.x + S / 2, it.y + S / 2)));

const polar = (f, a, rho) => [f.cx + rho * Math.sin(a), f.cy - rho * Math.cos(a)];
const deg = (d) => (d * Math.PI) / 180;

function frameParts(f) {
  const rim = f.R + S / 2;
  const parts = { ring: true, ticks: [], strokes: [], arcs: [] };
  const withTicks = (f.kind === 'dial' || f.ticks) && !f.hands;
  if (withTicks) {
    for (let k = 0; k < 12; k++) {
      const major = k % 3 === 0;
      const outer = f.R - S / 2 - 10;
      const len = major ? 24 : 13;
      const width = major ? 11 : 8;
      const a = deg(k * 30);
      const p0 = polar(f, a, outer - len);
      const p1 = polar(f, a, outer);
      const clear = S / 2 + width / 2 + 10;
      const hits = f.ink.some(([x, y]) =>
        [0, 0.5, 1].some((t) => Math.hypot(x - (p0[0] + (p1[0] - p0[0]) * t), y - (p0[1] + (p1[1] - p0[1]) * t)) < clear),
      );
      if (!hits) parts.ticks.push({ p0, p1, width });
    }
  }
  if (f.kind === 'stopwatch') {
    const stem = Math.max(8, f.R * 0.045);
    const capHalf = Math.max(18, f.R * 0.12);
    const capY = f.cy - rim - stem - S / 2;
    parts.strokes.push({ p0: [f.cx, f.cy - rim + 2], p1: [f.cx, capY], width: 18 });
    parts.strokes.push({ p0: [f.cx - capHalf, capY], p1: [f.cx + capHalf, capY], width: S });
    const btn = Math.max(10, f.R * 0.06);
    parts.strokes.push({ p0: polar(f, deg(45), rim - 2), p1: polar(f, deg(45), rim + btn), width: 18 });
  }
  if (f.kind === 'alarm') {
    const br = Math.max(20, f.R * 0.14);
    for (const side of [-1, 1]) {
      const a = deg(side * 42);
      const c = polar(f, a, rim + 8);
      const start = [c[0] - br * Math.cos(a), c[1] - br * Math.sin(a)];
      const end = [c[0] + br * Math.cos(a), c[1] + br * Math.sin(a)];
      parts.arcs.push({ c, r: br, start, end });
      const legA = deg(side * 142);
      parts.strokes.push({ p0: polar(f, legA, rim - 4), p1: polar(f, legA, rim + Math.max(14, f.R * 0.08)), width: S });
    }
  }
  if (f.hands) {
    const free = f.R - S / 2;
    parts.hands = `M${f.cx} ${f.cy - (free - 9)}V${f.cy}H${f.cx + free * 0.6}`;
  }
  if (f.hand != null) {
    const len = f.R - S / 2 - (withTicks ? 34 : 0) - 12;
    parts.pointer = { p0: [f.cx, f.cy], p1: polar(f, deg(f.hand), len), width: HAND };
  }
  return parts;
}

function frameExtent(f) {
  const p = frameParts(f);
  return [
    [f.cx, f.cy, f.R + S / 2],
    ...p.strokes.flatMap((s) => [[...s.p0, s.width / 2], [...s.p1, s.width / 2]]),
    ...p.arcs.map((a) => [...a.c, a.r + S / 2]),
  ];
}

function frameMarkup(f, accent, ink) {
  const p = frameParts(f);
  const line = (s, color) =>
    `<path d="M${s.p0[0]} ${s.p0[1]}L${s.p1[0]} ${s.p1[1]}" stroke="${color}" stroke-width="${s.width}"/>`;
  const arcs = p.arcs
    .map((a) => `<path d="M${a.start[0]} ${a.start[1]}A${a.r} ${a.r} 0 0 1 ${a.end[0]} ${a.end[1]}" stroke="${accent}" stroke-width="${S}"/>`)
    .join('');
  const hands = p.hands ? `<path d="${p.hands}" stroke="${ink}" stroke-width="${HAND}" stroke-linejoin="miter"/>` : '';
  const pointer = p.pointer
    ? `${line(p.pointer, accent)}<circle cx="${f.cx}" cy="${f.cy}" r="${PIVOT}" fill="${accent}" stroke="none"/>`
    : '';
  return `<g fill="none" stroke-linecap="butt"><circle cx="${f.cx}" cy="${f.cy}" r="${f.R}" stroke="${accent}" stroke-width="${S}"/>${p.ticks.map((t) => line(t, accent)).join('')}${p.strokes.map((s) => line(s, accent)).join('')}${arcs}${hands}${pointer}</g>`;
}

const FRAME_GAP = { dial: 40, stopwatch: 26, alarm: 26 };

function enclosingCircle(points) {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pts = [...points];
  for (let i = pts.length - 1; i > 0; i--) {
    const k = Math.floor(rand() * (i + 1));
    [pts[i], pts[k]] = [pts[k], pts[i]];
  }
  const inside = (c, p) => Math.hypot(p[0] - c.x, p[1] - c.y) <= c.r + 1e-6;
  const two = (a, b) => ({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, r: Math.hypot(a[0] - b[0], a[1] - b[1]) / 2 });
  const three = (a, b, c) => {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < 1e-9) return [two(a, b), two(a, c), two(b, c)].sort((m, n) => n.r - m.r)[0];
    const sq = (p) => p[0] * p[0] + p[1] * p[1];
    const x = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d;
    const y = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d;
    return { x, y, r: Math.hypot(a[0] - x, a[1] - y) };
  };
  let c = { x: pts[0][0], y: pts[0][1], r: 0 };
  for (let i = 1; i < pts.length; i++) {
    if (inside(c, pts[i])) continue;
    c = { x: pts[i][0], y: pts[i][1], r: 0 };
    for (let j = 0; j < i; j++) {
      if (inside(c, pts[j])) continue;
      c = two(pts[i], pts[j]);
      for (let k = 0; k < j; k++) if (!inside(c, pts[k])) c = three(pts[i], pts[j], pts[k]);
    }
  }
  return c;
}

const ringPoints = (s) =>
  Array.from({ length: 48 }, (_, k) => [s.cx + s.r * Math.cos((k * Math.PI) / 24), s.cy + s.r * Math.sin((k * Math.PI) / 24)]);

const bowlCenter = (six) => [six.x + S / 2 + six.w / 2, six.y + S / 2 + (six.h * 3) / 4];

function framed(kind, { ticks = false, hand = null, degree = false, pivotIn6 = false, gap = FRAME_GAP[kind] } = {}) {
  const { three, six, five } = spine();
  const { j, w } = column(SMALL_J, SMALL_W);
  const items = [j, three, w, six, five];
  const sun = degree ? ringLeftOf3(DEGREE.outer, DEGREE.sw, 'top', DEGREE.gap) : undefined;
  const ink = [...inkPoints(items), ...(sun ? ringPoints(sun) : [])];
  const c = pivotIn6 ? { x: bowlCenter(six)[0], y: bowlCenter(six)[1] } : enclosingCircle(ink);
  const inkR = Math.max(...ink.map(([x, y]) => Math.hypot(x - c.x, y - c.y)));
  return { items, sun, frame: { kind, cx: c.x, cy: c.y, R: inkR + S / 2 + gap + S / 2, ink, ticks, hand } };
}

const frameOnly = (kind, hand = null) => ({
  items: [],
  frame: { kind, cx: 0, cy: 0, R: 52, ink: [], hands: hand == null, hand },
});

const T = 42;
const RH = 160;
const RG = 16;
const ROW_GAP = 28;
const RING_W = 30;
const HALO = 9;
const PIVOT_R = 19;
let maskSeq = 0;

const at = (c, r, a) => [c[0] + r * Math.cos(deg(a)), c[1] + r * Math.sin(deg(a))];
const clockDir = (a) => [Math.sin(deg(a)), -Math.cos(deg(a))];

function trace(subpaths, [ox, oy]) {
  let d = '';
  const pts = [];
  for (const segs of subpaths) {
    let cur;
    for (const s of segs) {
      if (s[0] === 'M' || s[0] === 'L') {
        const p = [s[1], s[2]];
        if (s[0] === 'L') for (let t = 0.1; t < 1; t += 0.1) pts.push([cur[0] + (p[0] - cur[0]) * t, cur[1] + (p[1] - cur[1]) * t]);
        d += `${s[0]}${p[0] + ox} ${p[1] + oy}`;
        pts.push(p);
        cur = p;
        continue;
      }
      const [, cx, cy, r, aEnd, cw] = s;
      const a0 = (Math.atan2(cur[1] - cy, cur[0] - cx) * 180) / Math.PI;
      let delta = cw ? (aEnd - a0 + 720) % 360 : -((a0 - aEnd + 720) % 360);
      if (Math.abs(delta) < 1e-6) delta = cw ? 360 : -360;
      const steps = Math.ceil(Math.abs(delta) / 90);
      for (let k = 1; k <= steps; k++) {
        const aPrev = a0 + (delta * (k - 1)) / steps;
        const a = a0 + (delta * k) / steps;
        for (let t = 0.125; t <= 1; t += 0.125) pts.push(at([cx, cy], r, aPrev + (a - aPrev) * t));
        const p = at([cx, cy], r, a);
        d += `A${r} ${r} 0 0 ${cw ? 1 : 0} ${p[0] + ox} ${p[1] + oy}`;
        cur = p;
      }
    }
  }
  return { d, pts: pts.map(([x, y]) => [x + ox, y + oy]) };
}

function tangentFrom(q, c, r, side) {
  const d = Math.hypot(q[0] - c[0], q[1] - c[1]);
  const base = (Math.atan2(q[1] - c[1], q[0] - c[0]) * 180) / Math.PI;
  return base + side * ((Math.acos(r / d) * 180) / Math.PI);
}

const ROUND = {
  j: { w: 96, path: (w) => [[['M', w * 0.42, 0], ['L', w, 0], ['L', w, RH - w / 2], ['O', w / 2, RH - w / 2, w / 2, 180, true]]] },
  e: {
    w: 88,
    path: (w, link) => [
      [['M', w, 0], ['L', 0, 0], ['L', 0, RH + link]],
      [['M', 0, RH / 2], ['L', w * 0.8, RH / 2]],
      [['M', 0, RH], ['L', w, RH]],
    ],
  },
  three: {
    w: 96,
    path: (w) => {
      const rb = 47;
      const c = [w - rb, RH - rb];
      const start = at(c, rb, 250);
      return [
        [['M', 0, 0], ['L', w, 0]],
        [['M', w, 0], ['L', ...start], ['O', ...c, rb, 150, true]],
      ];
    },
  },
  six: {
    w: 100,
    path: (w) => {
      const r = 47;
      const c = [w / 2, RH - r];
      const top = [w * 0.72, 0];
      const a = tangentFrom(top, c, r, -1);
      return [[['M', ...top], ['L', ...at(c, r, a)], ['O', ...c, r, a, false]]];
    },
  },
  five: {
    w: 96,
    path: (w) => {
      const rb = 50;
      const c = [w - rb, RH - rb];
      const join = at(c, rb, 215);
      return [[['M', w, 0], ['L', join[0], 0], ['L', ...join], ['O', ...c, rb, 135, true]]];
    },
  },
  w: {
    w: 150,
    path: (w) => [[['M', 0, 0], ['L', w * 0.25, RH], ['L', w * 0.5, RH * 0.3], ['L', w * 0.75, RH], ['L', w, 0]]],
  },
};

const ICON_W = 9;
const ICON_SIZE = 33;
const ICON_STROKE = 6.5;
const iconScale = (key, size = ICON_SIZE) => size / ICONS[key].r;
const ICONS = {
  star: { r: 48, d: 'M0 -46L39.84 23L-39.84 23ZM0 46L39.84 -23L-39.84 -23Z' },
  menorah: {
    r: 50,
    d: `${[14, 28, 42].map((r) => `M${-r} -40V-10A${r} ${r} 0 0 0 ${r} -10V-40`).join('')}M0 -40V38M-22 38H22`,
  },
  tefillin: {
    r: 56,
    d: 'M-24 -18L-12 -32H30L18 -18M18 24L30 10V-32M-24 -4C-38 -4 -44 10 -40 22C-37 32 -44 40 -46 46M30 -12C42 -10 46 4 42 16C39 28 44 36 46 46',
    fill: 'M-24 -18H18V24H-24Z',
  },
  tallit: {
    r: 54,
    d: 'M-40 -24Q-20 -32 0 -24Q20 -16 40 -24V16Q20 8 0 16Q-20 24 -40 16ZM-40 16L-50 40M-40 16L-40 42M-40 16L-30 40M40 16L30 38M40 16L40 40M40 16L50 38',
    fill: 'M-28 -27.4L-18 -28V20L-28 19.4ZM18 -20L28 -20.6V12.6L18 12Z',
  },
  book: { r: 50, d: 'M0 -22Q-20 -34 -44 -26V24Q-20 16 0 28ZM0 -22Q20 -34 44 -26V24Q20 16 0 28Z' },
  tefillinPair: {
    r: 54,
    d: 'M-46 -28L-38 -36H-10L-18 -28M-18 0L-10 -8V-36M-10 -12L-2 -20H26L18 -12M18 16L26 8V-20M-32 0C-32 12 -24 16 -10 16M26 2C38 2 42 12 36 20C30 28 38 36 46 34',
    fill: 'M-46 -28H-18V0H-46ZM-10 -12H18V16H-10Z',
  },
  tallitFolded: {
    r: 52,
    d: 'M-40 -24Q-20 -32 0 -24Q20 -16 40 -24V16Q20 8 0 16Q-20 24 -40 16ZM-34 18.04V28.04M-21 19.99V29.99M-8 18.56V28.56M8 13.44V23.44M21 12.01V22.01M34 13.96V23.96',
    fill: 'M-40 4Q-20 12 0 4Q20 -4 40 4L40 10Q20 2 0 10Q-20 18 -40 10ZM-40 -9Q-20 -1 0 -9Q20 -17 40 -9L40 -3Q20 -11 0 -3Q-20 5 -40 -3ZM-34 35.04A3.5 3.5 0 1 0 -34 28.04A3.5 3.5 0 1 0 -34 35.04ZM-21 36.99A3.5 3.5 0 1 0 -21 29.99A3.5 3.5 0 1 0 -21 36.99ZM-8 35.56A3.5 3.5 0 1 0 -8 28.56A3.5 3.5 0 1 0 -8 35.56ZM8 30.44A3.5 3.5 0 1 0 8 23.44A3.5 3.5 0 1 0 8 30.44ZM21 29.01A3.5 3.5 0 1 0 21 22.01A3.5 3.5 0 1 0 21 29.01ZM34 30.96A3.5 3.5 0 1 0 34 23.96A3.5 3.5 0 1 0 34 30.96Z',
  },
  torah: {
    r: 52,
    d: 'M-25 -26V-37M-25 26V37M25 -26V-37M25 26V37M-18 -20H18M-18 20H18M-9 -9H9M-9 0H9M-9 9H9',
    fill: 'M-32 -26H-18V26H-32ZM18 -26H32V26H18ZM-25 -37A5 5 0 1 0 -25 -47A5 5 0 1 0 -25 -37ZM-25 47A5 5 0 1 0 -25 37A5 5 0 1 0 -25 47ZM25 -37A5 5 0 1 0 25 -47A5 5 0 1 0 25 -37ZM25 47A5 5 0 1 0 25 37A5 5 0 1 0 25 47Z',
  },
  shofar: {
    r: 52,
    d: 'M47.08 -16.31A18 6 18.43 1 0 12.92 -27.69A18 6 18.43 1 0 47.08 -16.31',
    fill: 'M-44.09 32.5L-37.07 32.79L-30.28 32.79L-23.7 32.43L-17.3 31.66L-11.07 30.45L-5 28.78L0.92 26.61L6.66 23.92L12.22 20.69L17.57 16.9L22.7 12.55L27.57 7.65L32.17 2.21L36.49 -3.77L40.51 -10.26L44.23 -17.26L15.77 -26.74L14.69 -20.68L13.32 -14.98L11.66 -9.64L9.68 -4.65L7.38 0.01L4.74 4.35L1.73 8.38L-1.66 12.08L-5.46 15.45L-9.69 18.47L-14.35 21.11L-19.45 23.34L-24.97 25.14L-30.9 26.46L-37.23 27.27L-43.91 27.5Z',
  },
};

const HALO_GAP = 4.5;
const HALO_LINE = 4.5;
const GRADIENT_AXIS = [Math.sin(deg(150)), -Math.cos(deg(150))];

const CHECK = {
  r: 52,
  parts: [
    { d: 'M-31 -1.5L-11 24.5L31 -24.5', w: 22, solid: false },
    { d: 'M-31 -1.5L-11 24.5L31 -24.5Z', w: 22, solid: true, knockOnly: true },
  ],
};
const BELL = {
  r: 53,
  parts: [
    {
      d: 'M0 -35C-20 -35 -26 -17 -27 3C-28 13 -34 19 -40 24V27H40V24C34 19 28 13 27 3C26 -17 20 -35 0 -35Z',
      w: 6,
      fill: true,
      solid: true,
    },
    { d: 'M-8 -35V-40A8 8 0 0 1 8 -40V-35', w: 5, solid: true },
    { d: 'M-12 38H12A12 12 0 0 1 -12 38Z', w: 5, solid: true },
  ],
};

const placeGlyph = (def, p, size) => {
  const k = size / def.r;
  return { def, p, k, size, tf: `translate(${p[0]} ${p[1]}) scale(${k})` };
};

const glyphInk = (g, color) =>
  `<g transform="${g.tf}" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">${g.def.parts
    .filter((p) => !p.knockOnly)
    .map((p) => `<path d="${p.d}" stroke-width="${p.w}"${p.fill ? ` fill="${color}"` : ''}/>`)
    .join('')}</g>`;

const gradientDef = (id, [x1, y1], [x2, y2], stops) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map(([o, col]) => `<stop offset="${o}" stop-color="${col}"/>`)
    .join('')}</linearGradient>`;

function haloSet(parts, id, region, color) {
  const line = color ? HALO_LINE : 0;
  const draw = (extra, paint, knock = false) =>
    parts
      .filter((p) => knock || !p.knockOnly)
      .map((p) => {
        const k = p.k ?? 1;
        const tf = p.tf ? ` transform="${p.tf}"` : '';
        return `<path d="${p.d}"${tf} fill="${p.solid ? paint : 'none'}" stroke="${paint}" stroke-width="${p.w + extra / k}"/>`;
      })
      .join('');
  const wrap = (body) => `<g stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
  const mask = (mid, extra, knock = false) =>
    `<mask id="${mid}" maskUnits="userSpaceOnUse" x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}"><rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" fill="#fff"/>${wrap(draw(extra, '#000', knock))}</mask>`;
  return {
    masks: `${mask(`${id}g`, 2 * HALO_GAP)}${mask(`${id}k`, 2 * (HALO_GAP + line / 2), true)}`,
    pale: color ? `<g mask="url(#${id}g)">${wrap(draw(2 * (HALO_GAP + HALO_LINE), color))}</g>` : '',
    knock: `url(#${id}k)`,
  };
}

function openClockMark({
  gapFrom = 22,
  gapTo = 128,
  minute = 66,
  hour = 285,
  hands: withHands = true,
  icons = [],
  span = [40, 140],
  ringW = RING_W,
  link: withLink = true,
  ticks: tickSpec = { angles: [180, 270], len: 34, w: 20, inset: 18, grow: false },
  ringFrom = null,
  iconSize = ICON_SIZE,
  iconStroke = ICON_STROKE,
  iconOutline = false,
  stroke: t = T,
  letterGap: rg = RG,
  clearPad = 14,
  tickPad = 16,
  ringGap = 26,
  crownThick = 0.065,
  crownLen = 0.21,
  styled = false,
  bare = false,
  rows = 'both',
  degreeOn = true,
  closed = false,
  crown = false,
  ends = null,
  check = false,
  bell = false,
  glyphSize = 60,
} = {}) {
  const adv = (g) => ROUND[g].w + t + rg;
  const y2 = RH + t + ROW_GAP;
  const link = withLink ? y2 - RH : 0;
  const xE = adv('j');
  const xW = xE + adv('e');
  const row2Width = adv('three') + adv('six') + ROUND.five.w;
  const x3 = withLink ? xE - ROUND.three.w : (xW + ROUND.w.w - row2Width) / 2;
  const x6 = x3 + adv('three');
  const x5 = x6 + adv('six');
  const every = [
    ['j', 0, 0],
    ['e', xE, 0],
    ['w', xW, 0],
    ['three', x3, y2],
    ['six', x6, y2],
    ['five', x5, y2],
  ];
  const placed = (rows === 'bottom' ? every.slice(3) : every).map(([g, x, y]) => trace(ROUND[g].path(ROUND[g].w, link), [x, y]));
  const degree = { r: 15, sw: 11, c: [x5 + ROUND.five.w + t / 2 + 10 + 20.5, y2 - t / 2 + 2] };
  const ink = [
    ...placed.flatMap((p) => p.pts),
    ...(degreeOn ? Array.from({ length: 36 }, (_, k) => at(degree.c, degree.r, k * 10)) : []),
  ];
  const mec = enclosingCircle(ink);
  const c = [mec.x, mec.y];
  const onRing = (R, a) => [c[0] + clockDir(a)[0] * R, c[1] + clockDir(a)[1] * R];
  const iconAngles = ends
    ? icons.map((_, i) => ends[0] + ((ends[1] - ends[0]) * (i + 1)) / (icons.length + 1))
    : icons.map((_, i) => span[0] + ((span[1] - span[0]) * i) / Math.max(1, icons.length - 1));
  const marks = [
    ...icons.map((_, i) => ({ a: iconAngles[i], size: iconSize })),
    ...(ends && check ? [{ a: ends[0], size: glyphSize }] : []),
    ...(ends && bell ? [{ a: ends[1], size: glyphSize }] : []),
  ];
  const iconsClear = (R) =>
    marks.every(({ a, size }) => {
      const p = onRing(R, a);
      return ink.every(([x, y]) => Math.hypot(x - p[0], y - p[1]) >= t / 2 + size + clearPad);
    });
  const tickSegs = (R, angles = tickSpec.angles) =>
    angles.map((a) => {
      const outer = R - ringW / 2 - tickSpec.inset;
      const len = tickSpec.major?.includes(a) ? tickSpec.majorLen : tickSpec.len;
      return [onRing(outer - len, a), onRing(outer, a)];
    });
  const tickHits = ([p0, p1]) =>
    ink.some(([x, y]) =>
      [0, 0.25, 0.5, 0.75, 1].some(
        (u) => Math.hypot(x - (p0[0] + (p1[0] - p0[0]) * u), y - (p0[1] + (p1[1] - p0[1]) * u)) < t / 2 + tickSpec.w / 2 + tickPad,
      ),
    );
  let R = mec.r + t / 2 + ringGap + ringW / 2;
  while (!iconsClear(R) || (tickSpec.grow && tickSegs(R).some(tickHits))) R += 4;
  const placedIcons = icons.map((key, i) => ({ key, p: onRing(R, iconAngles[i]) }));
  const glyphs = [
    ...(ends && check ? [placeGlyph(CHECK, onRing(R, ends[0]), glyphSize)] : []),
    ...(ends && bell ? [placeGlyph(BELL, onRing(R, ends[1]), glyphSize)] : []),
  ];
  const margin = (key) => (Math.asin(Math.min(1, (iconSize + 18) / R)) * 180) / Math.PI;
  const arcFrom = ends ? ends[0] : (ringFrom ?? (icons.length ? iconAngles[0] - margin(icons[0]) : gapFrom));
  const arcTo = ends ? ends[1] : icons.length ? iconAngles[icons.length - 1] + margin(icons[icons.length - 1]) : gapTo;
  const pivot = [x6 + ROUND.six.w * 0.72, y2];
  const inner = icons.length ? R - 74 : R - ringW / 2 - 34;
  const reachTo = (a) => {
    const u = clockDir(a);
    const v = [pivot[0] - c[0], pivot[1] - c[1]];
    const b = u[0] * v[0] + u[1] * v[1];
    return -b + Math.sqrt(b * b - (v[0] * v[0] + v[1] * v[1] - inner * inner));
  };
  const minuteLen = reachTo(minute);
  const others = [...placed.filter((_, i) => i !== 4).flatMap((p) => p.pts), ...ink.slice(-36)];
  const freeLen = (a, w, max) => {
    const u = clockDir(a);
    for (let s = PIVOT_R; s <= max; s += 2) {
      const q = [pivot[0] + u[0] * s, pivot[1] + u[1] * s];
      if (others.some(([x, y]) => Math.hypot(x - q[0], y - q[1]) < t / 2 + w / 2 + HALO)) return s - 2;
    }
    return max;
  };
  const hands = withHands
    ? [
        { a: hour, len: freeLen(hour, 24, minuteLen * 0.46), w: 24 },
        { a: minute, len: minuteLen, w: 20 },
      ].map((h) => ({ ...h, end: [pivot[0] + clockDir(h.a)[0] * h.len, pivot[1] + clockDir(h.a)[1] * h.len] }))
    : [];
  const ticks = bare ? [] : [...tickSegs(R), ...tickSegs(R, tickSpec.optional ?? [])].filter((seg) => !tickHits(seg));
  const ringStart = onRing(R, arcTo);
  const ringEnd = onRing(R, arcFrom + 360);
  const ringSweep = 360 - (arcTo - arcFrom);
  const ringD = closed
    ? `M${c[0] - R} ${c[1]}A${R} ${R} 0 1 1 ${c[0] + R} ${c[1]}A${R} ${R} 0 1 1 ${c[0] - R} ${c[1]}`
    : `M${ringStart[0]} ${ringStart[1]}A${R} ${R} 0 ${ringSweep > 180 ? 1 : 0} 1 ${ringEnd[0]} ${ringEnd[1]}`;
  const crownGeo = (() => {
    const b = Math.round(R * crownThick);
    return { b, half: (R * crownLen - b) / 2, yBar: c[1] - R - ringW / 2 - b * 0.8 - b / 2 };
  })();
  const haloExt = styled ? HALO_GAP + HALO_LINE : 0;
  const extents = [
    ...ink.map(([x, y]) => [x, y, t / 2 + haloExt]),
    ...(bare ? [] : [[c[0], c[1], R + ringW / 2]]),
    ...placedIcons.map(({ key, p }) => [p[0], p[1], iconSize]),
    ...glyphs.map((g) => [g.p[0], g.p[1], g.size + haloExt]),
    ...(crown && !bare
      ? [
          [c[0] - crownGeo.half, crownGeo.yBar, crownGeo.b / 2],
          [c[0] + crownGeo.half, crownGeo.yBar, crownGeo.b / 2],
        ]
      : []),
  ];
  const x0 = Math.min(...extents.map(([x, , r]) => x - r));
  const y0 = Math.min(...extents.map(([, y, r]) => y - r));
  const x1 = Math.max(...extents.map(([x, , r]) => x + r));
  const y1 = Math.max(...extents.map(([, y, r]) => y + r));
  const line = (p0, p1, w, color) => `<path d="M${p0[0]} ${p0[1]}L${p1[0]} ${p1[1]}" stroke="${color}" stroke-width="${w}"/>`;
  const iconsSvg = (sun) =>
    placedIcons
      .map(({ key, p }) => `<path transform="translate(${p[0]} ${p[1]}) scale(${iconScale(key, iconSize)})" stroke-width="${iconStroke / iconScale(key, iconSize)}" d="${ICONS[key].d}"/>${ICONS[key].fill ? `<path transform="translate(${p[0]} ${p[1]}) scale(${iconScale(key, iconSize)})" d="${ICONS[key].fill}" ${iconOutline ? `fill="none" stroke-width="${iconStroke / iconScale(key, iconSize)}"` : `fill="${sun}" stroke="none"`}/>` : ""}`)
      .join('');
  const lettersD = placed.map((p) => p.d).join('');
  const plain = ({ ink: inkColor, sun }) => {
    const accents = `<g fill="none" stroke="${sun}" stroke-linecap="round" stroke-linejoin="round"><circle cx="${degree.c[0]}" cy="${degree.c[1]}" r="${degree.r}" stroke-width="${degree.sw}"/><g stroke-width="${ICON_W}">${iconsSvg(sun)}</g>${hands.map((h) => line(pivot, h.end, h.w, sun)).join('')}</g>${withHands ? `<circle cx="${pivot[0]}" cy="${pivot[1]}" r="${PIVOT_R}" fill="${sun}"/>` : ''}`;
    const body = `<path d="${ringD}" stroke-width="${ringW}"/>${ticks.map(([p0, p1]) => line(p0, p1, tickSpec.w, inkColor)).join('')}<path d="${lettersD}" stroke-width="${t}"/>`;
    if (!withHands) {
      return `<g fill="none" stroke="${inkColor}" stroke-linecap="round" stroke-linejoin="round">${body}</g>${accents}`;
    }
    const id = `ko${++maskSeq}`;
    const knock = hands.map((h) => line(pivot, h.end, h.w + HALO * 2, '#000')).join('');
    const mask = `<mask id="${id}" maskUnits="userSpaceOnUse" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#fff"/><g stroke-linecap="round">${knock}</g><circle cx="${pivot[0]}" cy="${pivot[1]}" r="${PIVOT_R + HALO}" fill="#000"/></mask>`;
    return `<defs>${mask}</defs><g mask="url(#${id})" fill="none" stroke="${inkColor}" stroke-linecap="round" stroke-linejoin="round">${body}</g>${accents}`;
  };
  const fancy = ({ ink: inkColor, sun, ring: ringStops, ticks: tickStops, halo }) => {
    const id = `og${++maskSeq}`;
    const region = { x: x0 - 12, y: y0 - 12, w: x1 - x0 + 24, h: y1 - y0 + 24 };
    const ringPaint = ringStops ? `url(#${id}r)` : inkColor;
    const tickPaint = tickStops ? `url(#${id}t)` : ringPaint;
    const defs = [];
    if (ringStops && !bare) {
      const [ax, ay] = GRADIENT_AXIS;
      defs.push(gradientDef(`${id}r`, [c[0] - R * ax, c[1] - R * ay], [c[0] + R * ax, c[1] + R * ay], ringStops));
    }
    if (tickStops && ticks.length) {
      const ys = ticks.flatMap(([p0, p1]) => [p0[1], p1[1]]);
      defs.push(gradientDef(`${id}t`, [c[0], Math.min(...ys)], [c[0], Math.max(...ys)], tickStops));
    }
    const letterHalo = halo ? haloSet([{ d: lettersD, w: t }], `${id}l`, region, halo) : null;
    const glyphHalo = glyphs.length
      ? haloSet(
          glyphs.flatMap((g) => g.def.parts.map((p) => ({ ...p, tf: g.tf, k: g.k }))),
          `${id}c`,
          region,
          halo,
        )
      : null;
    const ringEl = bare
      ? ''
      : `<path d="${ringD}" fill="none" stroke="${ringPaint}" stroke-width="${ringW}" stroke-linecap="round"${glyphHalo ? ` mask="${glyphHalo.knock}"` : ''}/>`;
    const crownEl =
      crown && !bare
        ? `<g fill="none" stroke="${ringPaint}" stroke-width="${crownGeo.b}"><path d="M${c[0]} ${c[1] - R}V${crownGeo.yBar}"/><path d="M${c[0] - crownGeo.half} ${crownGeo.yBar}H${c[0] + crownGeo.half}" stroke-linecap="round"/></g>`
        : '';
    const tickEl = ticks.length
      ? `<g fill="none" stroke="${tickPaint}" stroke-width="${tickSpec.w}" stroke-linecap="round">${ticks.map(([p0, p1]) => `<path d="M${p0[0]} ${p0[1]}L${p1[0]} ${p1[1]}"/>`).join('')}</g>`
      : '';
    const lettersEl = `<path d="${lettersD}" fill="none" stroke="${inkColor}" stroke-width="${t}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const accents = `<g fill="none" stroke="${sun}" stroke-linecap="round" stroke-linejoin="round">${degreeOn ? `<circle cx="${degree.c[0]}" cy="${degree.c[1]}" r="${degree.r}" stroke-width="${degree.sw}"/>` : ''}<g stroke-width="${ICON_W}">${iconsSvg(sun)}</g></g>`;
    const glyphEl = glyphs.map((g) => glyphInk(g, g.def === CHECK ? inkColor : sun)).join('');
    const defsAll = `${defs.join('')}${letterHalo ? letterHalo.masks : ''}${glyphHalo ? glyphHalo.masks : ''}`;
    return `${defsAll ? `<defs>${defsAll}</defs>` : ''}${letterHalo ? letterHalo.pale : ''}${ringEl}${crownEl}${tickEl}${lettersEl}${accents}${glyphHalo ? glyphHalo.pale : ''}${glyphEl}`;
  };
  const shape = styled
    ? enclosingCircle(extents.flatMap(([x, y, r]) => Array.from({ length: 24 }, (_, k) => at([x, y], r, k * 15))))
    : null;
  return {
    custom: true,
    R,
    box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    center: shape ? [shape.x, shape.y] : c,
    reach: (cx, cy) => Math.max(...extents.map(([x, y, r]) => Math.hypot(x - cx, y - cy) + r)),
    render: (colors) => (styled ? fancy(colors) : plain(colors)),
  };
}

function openClockIcon({ gapFrom = 22, gapTo = 128 } = {}) {
  const R = 50;
  const W = 16;
  const start = at([0, 0], R, gapTo - 90);
  const end = at([0, 0], R, gapFrom - 90 + 360);
  const m = clockDir(58);
  const h = clockDir(312);
  return {
    custom: true,
    box: { x: -R - W / 2, y: -R - W / 2, w: 2 * R + W, h: 2 * R + W },
    center: [0, 0],
    reach: () => R + W / 2,
    render: ({ ink, sun }) =>
      `<g fill="none" stroke-linecap="round"><path d="M${start[0]} ${start[1]}A${R} ${R} 0 1 1 ${end[0]} ${end[1]}" stroke="${ink}" stroke-width="${W}"/><path d="M0 0L${m[0] * 32} ${m[1] * 32}M0 0L${h[0] * 20} ${h[1] * 20}" stroke="${sun}" stroke-width="12"/></g><circle r="9" fill="${sun}"/>`,
  };
}

const SYMBOLS = ['star', 'menorah', 'tefillin', 'tallit', 'book'];
const MITZVOT_SYMBOLS = ['tefillinPair', 'tallitFolded', 'torah', 'shofar'];

function shawlPath() {
  const seg = (x0, y0, x1, y1) => `M${x0} ${y0}L${x1} ${y1}`;
  const dot = (x, y) => `M${x - 1.8} ${y}A1.8 1.8 0 1 0 ${x + 1.8} ${y}A1.8 1.8 0 1 0 ${x - 1.8} ${y}`;
  const outline = 'M-15 -38L14 -28L29 20L5 25L6 11L-29 -5Z';
  const fold = seg(11, -23, 5, 25);
  const stripes = [seg(-18.6, -22, 8.4, -6), seg(-21.6, -12, 7, 3), seg(6, 8, 25, 5), seg(5.5, 17, 27, 13)];
  const hang = (x, y, dx, len) => seg(x, y, x + dx, y + len) + dot(x + dx, y + len + 1.8);
  const left = [0.1, 0.32, 0.54, 0.76, 0.97].map((t) => hang(-29 + 35 * t, -5 + 16 * t, -2, 9));
  const right = [9, 17, 25].map((x) => hang(x, 25 - (5 * (x - 5)) / 24, 0, 8));
  return [outline, fold, ...stripes, ...left, ...right].join('');
}
ICONS.tallitShawl = { r: 44, d: shawlPath() };
const MITZVOT_SYMBOLS_O = ['tefillinPair', 'tallitShawl', 'torah', 'shofar'];

function scaledMark(opts, { icon = 0, glyph = 0 }) {
  let layout = openClockMark(opts);
  for (let i = 0; i < 8; i++) {
    layout = openClockMark({
      ...opts,
      ...(icon ? { iconSize: icon * layout.R, iconStroke: icon * layout.R * 0.094 } : {}),
      ...(glyph ? { glyphSize: glyph * layout.R } : {}),
    });
  }
  return layout;
}

const O_TICKS = { angles: [0, 330, 300, 270, 240, 210, 180], major: [0, 270, 180], len: 46, majorLen: 76, w: 24, inset: 24, grow: true };
const O_CORE = {
  hands: false,
  link: false,
  styled: true,
  stroke: 48,
  letterGap: 20,
  ringW: 18,
  ticks: O_TICKS,
  tickPad: 36,
  clearPad: 16,
  iconSize: 47,
  iconStroke: 4.4,
  iconOutline: true,
  glyphSize: 50,
  crown: true,
};
const O_ENDS = [28, 134];
const NO_TICKS = { angles: [], len: 0, w: 0, inset: 0, grow: false };
const O_ICON = {
  ...O_CORE,
  stroke: 58,
  ringW: 26,
  tickPad: 39,
  ticks: { ...O_TICKS, w: 28, len: 50, majorLen: 82, major: [0, 270, 180, 90], optional: [30, 60, 90, 120, 150] },
};
const O_OUTPUTS = {
  icon: () =>
    scaledMark({ ...O_ICON, ticks: { ...O_ICON.ticks, major: [0, 270, 180], optional: [] }, ends: O_ENDS, check: true, bell: true }, { glyph: 0.18 }),
  notif: () =>
    openClockMark({ ...O_CORE, rows: 'bottom', degreeOn: false, ticks: NO_TICKS, closed: true, stroke: 70, letterGap: 24, ringW: 92, ringGap: 6, crownThick: 0.2, crownLen: 0.56 }),
  word: () => openClockMark({ ...O_CORE, bare: true, ticks: NO_TICKS, crown: false }),
};

const VARIANTS = {
  o: () => scaledMark({ ...O_CORE, icons: MITZVOT_SYMBOLS_O, ends: O_ENDS, check: true, bell: true }, { icon: 0.116, glyph: 0.104 }),
  n: () =>
    openClockMark({
      hands: false,
      link: false,
      icons: MITZVOT_SYMBOLS,
      span: [48, 134],
      ringFrom: 12,
      ringW: 14,
      iconSize: 50,
      ticks: { angles: [0, 330, 300, 270, 240, 210, 180], major: [0, 270, 180], len: 26, majorLen: 38, w: 18, inset: 24, grow: true },
    }),
  l: () => openClockMark({ hands: false, icons: SYMBOLS, ringW: 26 }),
  k: () => openClockMark(),
  j: () => framed('stopwatch', { ticks: true, hand: 150, degree: true, pivotIn6: true, gap: 24 }),
  g: () => framed('dial'),
  h: () => framed('stopwatch'),
  i: () => framed('alarm'),
  f: () => {
    const { three, six, five } = spine();
    const { j, w } = column(SMALL_J, SMALL_W);
    return { items: [j, three, w, six, five], sun: clockLeftOf3() };
  },
  e: () => {
    const { three, six, five } = spine();
    const { j, w } = column(BIG, BIG_W);
    return { items: [j, three, w, six, five], sun: clockLeftOf3() };
  },
  a: () => {
    const { three, six, five } = spine();
    const { j, w } = column(BIG, BIG_W);
    return { items: [j, three, w, six, five], sun: ringLeftOf3(outerW(BIG), S, 'middle') };
  },
  b: () => {
    const { three, six, five } = spine();
    const { j, w } = column(BIG, BIG_W);
    return { items: [j, three, w, six, five], sun: ringLeftOf3(60, 18, 'top') };
  },
  c: () => {
    const { three, six, five } = spine();
    const { j, w } = column(BIG, BIG_W);
    const span = five.x + outerW(BIG) - six.x;
    return {
      items: [j, three, w, six, five],
      sun: { type: 'arc', sw: S, r: span * 0.3, cx: six.x + span / 2, cy: -G * 0.75 },
    };
  },
  d: () => {
    const { three, six, five } = spine();
    const { j, w } = column(SMALL_J, SMALL_W);
    return { items: [j, three, w, six, five], sun: ringLeftOf3(60, 18, 'top') };
  },
};

const WORDMARK = () => {
  const seq = [
    { g: 'j', ...BIG },
    { g: 'e', ...BIG },
    { g: 'w', ...BIG_W },
    null,
    { g: 'three', ...BIG },
    { g: 'six', ...BIG },
    { g: 'five', ...BIG },
  ];
  let x = 0;
  const items = [];
  let sun;
  for (const box of seq) {
    if (!box) {
      x += G * 1.6;
      const outer = outerH(BIG);
      sun = { type: 'clock', sw: S, r: (outer - S) / 2, cx: x + outer / 2, cy: outer / 2 };
      x += outer + G;
      continue;
    }
    items.push({ ...box, x, y: 0 });
    x += outerW(box) + G;
  }
  return { items, sun };
};

function bbox({ items, sun, frame, custom, box }) {
  if (custom) return box;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x0, y0, x1, y1) => {
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  };
  for (const it of items) grow(it.x, it.y, it.x + outerW(it), it.y + outerH(it));
  if (sun) {
    const e = sun.r + sun.sw / 2;
    grow(sun.cx - e, sun.cy - e, sun.cx + e, sun.type === 'arc' ? sun.cy : sun.cy + e);
  }
  if (frame) for (const [x, y, r] of frameExtent(frame)) grow(x - r, y - r, x + r, y + r);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function sunMarkup(sun, color, ink) {
  if (!sun) return '';
  const ring = `<circle cx="${sun.cx}" cy="${sun.cy}" r="${sun.r}" fill="none" stroke="${color}" stroke-width="${sun.sw}"/>`;
  if (sun.type === 'ring') return ring;
  if (sun.type === 'clock') {
    const { cx, cy } = sun;
    const free = sun.r - sun.sw / 2;
    const hands = `M${cx} ${cy - (free - 9)}V${cy}H${cx + free * 0.6}`;
    return `${ring}<path d="${hands}" fill="none" stroke="${ink}" stroke-width="${HAND}" stroke-linejoin="miter" stroke-linecap="butt"/>`;
  }
  const { cx, cy, r, sw } = sun;
  return `<path d="M${cx - r} ${cy}${arc(r, 1, cx + r, cy)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="butt"/>`;
}

function inner(layout, colors) {
  const { ink, sun } = colors;
  if (layout.custom) return layout.render(colors);
  const glyphs = layout.items
    .map((it) => {
      const d = GLYPHS[it.g](it.w, it.h).join('');
      return `<path transform="translate(${it.x + S / 2} ${it.y + S / 2})" d="${d}"/>`;
    })
    .join('');
  const frame = layout.frame ? frameMarkup(layout.frame, sun, ink) : '';
  return `${frame}<g fill="none" stroke="${ink}" stroke-width="${S}" stroke-linejoin="miter" stroke-linecap="butt">${glyphs}</g>${sunMarkup(layout.sun, sun, ink)}`;
}

function markSvg(layout, colors, { pad = 0, bg, title, attrs = '' } = {}) {
  const b = bbox(layout);
  const vb = `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`;
  const bgRect = bg ? `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.w + pad * 2}" height="${b.h + pad * 2}" fill="${bg}"/>` : '';
  const t = title ? `<title>${title}</title>` : '';
  return tidy(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" ${attrs}>${t}${bgRect}${inner(layout, colors)}</svg>`);
}

function iconCenter(layout) {
  if (layout.custom) return layout.center;
  if (layout.frame) return [layout.frame.cx, layout.frame.cy];
  const b = bbox(layout);
  return [b.x + b.w / 2, b.y + b.h / 2];
}

function reach(layout) {
  const [cx, cy] = iconCenter(layout);
  if (layout.custom) return layout.reach(cx, cy);
  const glyphReach = Math.max(0, ...inkPoints(layout.items).map(([x, y]) => Math.hypot(x - cx, y - cy) + S / 2));
  const s = layout.sun;
  const sunReach = s ? Math.hypot(s.cx - cx, s.cy - cy) + s.r + s.sw / 2 : 0;
  const frameReach = layout.frame
    ? Math.max(...frameExtent(layout.frame).map(([x, y, r]) => Math.hypot(x - cx, y - cy) + r))
    : 0;
  return Math.max(glyphReach, sunReach, frameReach);
}

function adaptiveIcon(layout, colors, bg, { guides = false, safe = 32 } = {}) {
  const b = bbox(layout);
  const k = safe / reach(layout);
  const [cx, cy] = iconCenter(layout);
  const nested = `<svg x="${54 - (cx - b.x) * k}" y="${54 - (cy - b.y) * k}" width="${b.w * k}" height="${b.h * k}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">${inner(layout, colors)}</svg>`;
  const guide = guides
    ? `<circle cx="54" cy="54" r="33" fill="none" stroke="#FF3B6B" stroke-width="0.6" stroke-dasharray="2 1.5"/>`
    : '';
  return tidy(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><rect x="0" y="0" width="108" height="108" fill="${bg}"/>${nested}${guide}</svg>`);
}

const WORLDS = [
  { id: 'shuk-m', label: 'שוק בלילה · גבר', bg: '#F5F3F8', ink: '#1C1429', sun: '#EFA73A', hero: '#2A1A3D', heroInk: '#FFFFFF', heroSun: '#F6BE5E' },
  { id: 'shuk-f', label: 'שוק בלילה · אישה', bg: '#F8F2F5', ink: '#3E1430', sun: '#E05A80', hero: '#3E1430', heroInk: '#FFFFFF', heroSun: '#F7B8CA' },
  { id: 'shuk-d', label: 'שוק בלילה · כהה', bg: '#120D1A', ink: '#F3EEF8', sun: '#F0AE45', hero: '#3B2756', heroInk: '#FFFFFF', heroSun: '#F6C064' },
  { id: 'studio-m', label: 'סטודיו יודאיקה · גבר', bg: '#F1F4F2', ink: '#1F3832', sun: '#B98F3E', hero: '#1F3832', heroInk: '#F4F7F5', heroSun: '#DDBB72' },
  { id: 'studio-f', label: 'סטודיו יודאיקה · אישה', bg: '#F7F2F3', ink: '#432532', sun: '#9E4560', hero: '#432532', heroInk: '#FFFFFF', heroSun: '#E9C08F' },
  { id: 'mono', label: 'צבע אחד', bg: '#FFFFFF', ink: '#111111', sun: '#111111', hero: '#111111', heroInk: '#FFFFFF', heroSun: '#FFFFFF' },
];
const LEAD = WORLDS[0];
const BLUE_RED = { id: 'blue-red', label: 'כחול וכתום-אדום', bg: '#FAFAF7', ink: '#0B3AA8', sun: '#EE5A28', hero: '#0B3AA8', heroInk: '#FFFFFF', heroSun: '#FF8A5C' };
const BLUE = { id: 'blue', label: 'כחול וכתום', bg: '#FFFBF2', ink: '#1239B4', sun: '#F58A2E', hero: '#1239B4', heroInk: '#FFFFFF', heroSun: '#FFA552' };
WORLDS.unshift(BLUE_RED, BLUE);
const BLUE_ORANGE = {
  id: 'blue-orange',
  label: 'כחול הדרגתי וכתום',
  bg: '#FFFFFF',
  ink: '#012B97',
  sun: '#FF3B03',
  ring: [
    [0, '#0022AE'],
    [0.07, '#0038CE'],
    [0.14, '#014AE1'],
    [0.185, '#0068FD'],
    [0.27, '#1F8AFD'],
    [0.37, '#3E9DFA'],
    [0.475, '#48A0FE'],
    [0.68, '#4DA5FD'],
    [0.85, '#63B2FE'],
    [0.93, '#78BFFD'],
    [1, '#87C8FE'],
  ],
  ticks: [
    [0, '#0037C8'],
    [0.12, '#002AAA'],
    [0.3, '#0030BE'],
    [0.52, '#0038D0'],
    [0.64, '#1A6EF0'],
    [0.73, '#2F94FE'],
    [0.9, '#459FFD'],
    [1, '#5DAEFE'],
  ],
  halo: '#B9DCF9',
  hero: '#0E1626',
  heroInk: '#F4F7FF',
  heroSun: '#FF8A5C',
  heroRing: [
    [0, '#5B8CFF'],
    [0.5, '#8CBEFF'],
    [1, '#CFE8FF'],
  ],
  heroTicks: [
    [0, '#6F9BFF'],
    [1, '#BFE0FF'],
  ],
  heroHalo: null,
};
const lightColors = (p) => ({ ink: p.ink, sun: p.sun, ring: p.ring, ticks: p.ticks, halo: p.halo });
const darkColors = (p) => ({ ink: p.heroInk, sun: p.heroSun, ring: p.heroRing, ticks: p.heroTicks, halo: p.heroHalo });
const pal = (k) => VARIANT_META[k].palette ?? LEAD;

const RULES = ['זמן', '365', 'עיגול 360°', 'JEW באנגלית', 'אות בשתי משמעויות'];
const VARIANT_META = {
  o: {
    name: 'י״ד · כתר, צ׳ק ופעמון',
    note: 'הלוגו שבחר הבעלים: שעון עצר עם כתר וטבעת בהדרגה כחולה, שנתות בצד הסגור, JEW מעל 365 בכחול עמוק עם מסגרת בהירה סביב כל אות. בפתח הטבעת, מלמעלה למטה: צ׳ק, תפילין, טלית, ספר תורה, שופר ופעמון, בכתום. לצ׳ק ולפעמון יש הילה בהירה, והטבעת נעצרת בקצה ההילה.',
    rules: [true, true, true, true, false],
    palette: BLUE_ORANGE,
  },
  n: {
    name: 'י״ג · שנתות ומצוות',
    note: 'בסגנון הרפרנס הרביעי: טבעת דקה ופתוחה, ובחלק השמאלי שלה 7 שנתות (12, 11, 10, 9, 8, 7, 6) עם שנתות ארוכות ב-12, ב-9 וב-6. JEW מעל 365, בלי חיבור בין E ל-3, ו-365 ממורכז מתחת ל-JEW. עיגול המעלות מימין ל-365. בפתח 4 סמלים של מצוות: תפילין (2 בתים ורצועה), טלית מקופלת עם שורת ציציות, ספר תורה ושופר. הטבעת גדלה עד שגם השנתות וגם הסמלים לא נוגעים בטקסט.',
    rules: [true, true, true, true, false],
    palette: BLUE_RED,
  },
  l: {
    name: 'י״ב · סמלים בטבעת',
    note: 'בסגנון הרפרנס השני: בפתח של הטבעת יושבים 5 סמלים כתומים בלי קו ביניהם, מלמעלה למטה: מגן דוד, מנורה, תפילין (בית עם ש ורצועות), טלית (פסים וציציות) וספר פתוח. לכל סמל יש קנה מידה משלו, כך שכולם באותו גודל אופטי ובאותו עובי קו, והתפילין והפסים של הטלית מלאים כדי שלא ייסתמו בגודל קטן. הטבעת גדלה אוטומטית עד שאף סמל לא נוגע בטקסט. עיגול המעלות יושב מימין ל-365, למעלה, כמו °. בלי מחוגים, כמו ברפרנס, והשעון נשאר בטבעת ובשנתה.',
    rules: [true, true, true, true, true],
    palette: BLUE,
  },
  k: {
    name: 'י״א · טבעת פתוחה',
    note: 'בסגנון הרפרנס: טבעת שעון פתוחה בצד ימין, אותיות עבות ועגולות ב-2 שורות. העמוד של ה-E יורד וממשיך לתוך האלכסון של ה-3, כך שקו אחד שייך לשתי האותיות. 2 מחוגים יוצאים מהקצה העליון של ה-6 ומראים 10:10, ומסביבם יש הפרדה שחותכת את האותיות. עיגול המעלות הכתום יושב מימין ל-365, למעלה, כמו °.',
    rules: [true, true, true, true, true],
    palette: BLUE,
  },
  j: {
    name: 'י׳ · שעון עצר עם חוגה',
    note: 'שעון העצר, ובתוכו שנתות של חוגה ומחוג אחד. מרכז השעון יושב בדיוק בתוך הלולאה של ה-6, ומשם יוצא המחוג. הוא עובר מתחת לקו התחתון של ה-6 ומצביע על 5 בשטח הפנוי שמתחת ל-65. עיגול המעלות יושב משמאל ל-3, למעלה, כמו ° אמיתי.',
    rules: [true, true, true, true, true],
  },
  g: {
    name: 'ז׳ · חוגה',
    note: 'המסגרת היא לוח שעון עם שנתות, וה-365 עובר לרוחבו. איפה שהטקסט מגיע לשפה, השנתה נעלמת, וה-3 וה-5 תופסים את מקומן של השנתות של 9 ו-3. הכי נקי ופורמלי מהשלוש.',
    rules: [true, true, true, true, true],
  },
  h: {
    name: 'ח׳ · שעון עצר',
    note: 'עיגול עם כתר וכפתור, הצללית של טיימר. מתאים לאפליקציה שכל עניינה הוא חלון זמן שנסגר. הצללית מזוהה גם בלי לקרוא את הטקסט, ולכן היא עובדת הכי טוב בגדלים קטנים.',
    rules: [true, true, true, true, true],
  },
  i: {
    name: 'ט׳ · שעון מעורר',
    note: 'פעמונים ורגליים: שעון מעורר, כלומר תזכורת, וזה בדיוק מה שהאפליקציה עושה. הכי צעיר ושובב מהשלוש, ופחות פורמלי.',
    rules: [true, true, true, true, true],
  },
  f: {
    name: 'ו׳ · שעון, 365 במרכז',
    note: 'שעון בגובה של אות משמאל ל-3, ו-J ו-W קטנים וצמודים לשדרה של ה-3. השעון מראה 3:00: המחוג הקצר מצביע ימינה אל ה-3, באותו גובה של הקו האמצעי שלו. קוראים קודם ״שעון 365״, ובקריאה שנייה מגלים את JEW.',
    rules: [true, true, true, true, true],
  },
  e: {
    name: 'ה׳ · שעון, עמודה מלאה',
    note: 'אותו שעון, אבל J, Ǝ ו-W בגודל מלא. ה-JEW קריא יותר, והסימן גבוה יותר ופחות ריבועי.',
    rules: [true, true, true, true, true],
  },
  a: {
    name: 'א׳ · ציר מלא',
    note: 'הסקיצה מההודעה הקודמת: J, Ǝ ו-W בעמודה, השמש בגודל אות משמאל ל-3. בבדיקת הצללית היא לא נראית כמו צלב, כי ה-65 והאותיות שולטים בצורה.',
    rules: [true, true, true, true, true],
  },
  b: {
    name: 'ב׳ · מעלה',
    note: 'אותה עמודה, אבל השמש קטנה בגודל של סימן מעלות ויושבת למעלה משמאל ל-3, כמו ° אמיתי. הזרוע השמאלית נעלמת, הצלב נעלם, וכלל 3 נשמר כמו שהוא.',
    rules: [true, true, true, true, true],
  },
  c: {
    name: 'ג׳ · זריחה',
    note: 'השמש עולה מעל ה-65, והפסים העליונים של ה-6 וה-5 הם האופק. הזמן הכי ברור מכל הסקיצות, והקומפוזיציה מתמלאת לריבוע. מפר את כלל 3: העיגול לא משמאל ל-3.',
    rules: [true, true, false, true, true],
  },
  d: {
    name: 'ד׳ · 365 במרכז',
    note: 'ה-365 גדול, ו-J ו-W קטנים וצמודים לשדרה של ה-3. קוראים קודם 365 ומגלים את JEW בקריאה שנייה. הכי ריבועי, ולכן הכי מתאים לאייקון.',
    rules: [true, true, true, true, true],
  },
};

const chips = (rules) =>
  rules.map((ok, i) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${RULES[i]}</li>`).join('');

const layouts = Object.fromEntries(Object.entries(VARIANTS).map(([k, f]) => [k, f()]));
const wordmark = WORDMARK();

for (const [k, layout] of Object.entries(layouts)) {
  writeFileSync(join(OUT, `mark-${k}.svg`), markSvg(layout, lightColors(pal(k)), { pad: 24, title: `Jew 365 mark ${k}` }) + '\n');
  writeFileSync(join(OUT, `mark-${k}-mono.svg`), markSvg(layout, { ink: '#000000', sun: '#000000' }, { pad: 24, title: `Jew 365 mark ${k} mono` }) + '\n');
}
writeFileSync(join(OUT, 'wordmark.svg'), markSvg(wordmark, { ink: LEAD.ink, sun: LEAD.sun }, { pad: 24, title: 'JEW 365 wordmark' }) + '\n');

const O_LIGHT = lightColors(BLUE_ORANGE);
const O_DARK = darkColors(BLUE_ORANGE);
const O_ICON_LIGHT = { ...O_LIGHT, halo: null };
const O_SILHOUETTE = { ink: '#000000', sun: '#000000' };
const oOut = Object.fromEntries(Object.entries(O_OUTPUTS).map(([k, f]) => [k, f()]));
const oSvgs = {
  'mark-o-dark.svg': markSvg(layouts.o, O_DARK, { pad: 24, title: 'Jew 365 mark o on dark' }),
  'mark-o-icon.svg': markSvg(oOut.icon, O_ICON_LIGHT, { pad: 24, title: 'Jew 365 launcher icon' }),
  'mark-o-icon-mono.svg': markSvg(oOut.icon, O_SILHOUETTE, { pad: 24, title: 'Jew 365 launcher icon, single colour' }),
  'mark-o-notif.svg': markSvg(oOut.notif, O_SILHOUETTE, { pad: 8, title: 'Jew 365 notification silhouette' }),
  'wordmark-o.svg': markSvg(oOut.word, O_LIGHT, { pad: 12, title: 'JEW 365 wordmark o' }),
  'wordmark-o-dark.svg': markSvg(oOut.word, O_DARK, { pad: 12, title: 'JEW 365 wordmark o on dark' }),
};
for (const [name, svg] of Object.entries(oSvgs)) writeFileSync(join(OUT, name), svg + '\n');
const round2 = (n) => Number(n.toFixed(2));
const metaOf = (layout) => {
  const [cx, cy] = layout.center;
  return { center: [round2(cx), round2(cy)], reach: round2(layout.reach(cx, cy)), box: [layout.box.x, layout.box.y, layout.box.w, layout.box.h].map(round2) };
};
writeFileSync(
  join(OUT, 'mark-o-meta.json'),
  JSON.stringify({ mark: metaOf(layouts.o), icon: metaOf(oOut.icon), notif: metaOf(oOut.notif), wordmark: metaOf(oOut.word) }, null, 2) + '\n',
);

const keys = Object.keys(layouts);
const FRAME_KEYS = ['n', 'l', 'k', 'j', 'h', 'g', 'i'];
const EARLIER_KEYS = ['f', 'e', 'd', 'b', 'c', 'a'];
const TEST_KEYS = ['n', 'l', 'k'];
const LEAD_KEY = 'n';

const variantCards = (list) => list
  .map((k) => {
    const m = VARIANT_META[k];
    const L = layouts[k];
    const p = pal(k);
    return `<article class="card">
      <div class="duo">
        <div class="tile" style="background:${p.bg}">${markSvg(L, { ink: p.ink, sun: p.sun }, { attrs: 'class="mk"' })}</div>
        <div class="tile" style="background:${p.hero}">${markSvg(L, { ink: p.heroInk, sun: p.heroSun }, { attrs: 'class="mk"' })}</div>
      </div>
      <h3>${m.name}</h3>
      <p>${m.note}</p>
      <ul class="chips">${chips(m.rules)}</ul>
    </article>`;
  })
  .join('');

const MONO = { ink: '#000', sun: '#000' };
const legacyEntry = (k) => ({
  name: VARIANT_META[k].name,
  layout: layouts[k],
  light: lightColors(pal(k)),
  main: { colors: { ink: pal(k).heroInk, sun: pal(k).heroSun }, bg: pal(k).hero },
  alt: { colors: lightColors(pal(k)), bg: pal(k).bg, label: 'רקע בהיר' },
});
const silhouettes = (entries) =>
  entries
    .map(
      (e) => `<figure class="sil">
      <div class="sil-blur">${markSvg(e.layout, MONO, { attrs: 'class="mk"' })}</div>
      <figcaption>${e.name}</figcaption>
    </figure>`,
    )
    .join('');

const SIZES = [16, 24, 32, 48, 72, 128];
const sizeRows = (entries) =>
  entries
    .map(
      (e) => `<div class="sizes-row"><span class="sizes-label">${e.name}</span>${SIZES.map(
        (px) => `<span class="sz" style="height:${px}px">${markSvg(e.layout, e.light, { attrs: `style="height:${px}px;width:auto"` })}</span>`,
      ).join('')}</div>`,
    )
    .join('');

const MASKS = [
  { id: 'circle', label: 'עיגול (Pixel)' },
  { id: 'squircle', label: 'סקווירקל (Samsung)' },
  { id: 'rounded', label: 'ריבוע מעוגל' },
];
const iconRows = (entries) =>
  entries
    .map(
      (e) => `<div class="icons-row"><span class="sizes-label">${e.name}</span>
      ${MASKS.map((m) => `<figure class="ic"><div class="mask ${m.id}">${adaptiveIcon(e.layout, e.main.colors, e.main.bg)}</div><figcaption>${m.label}</figcaption></figure>`).join('')}
      <figure class="ic"><div class="mask square">${adaptiveIcon(e.layout, e.main.colors, e.main.bg, { guides: true })}</div><figcaption>אזור בטוח 66dp</figcaption></figure>
      <figure class="ic"><div class="mask circle light">${adaptiveIcon(e.layout, e.alt.colors, e.alt.bg)}</div><figcaption>${e.alt.label}</figcaption></figure>
    </div>`,
    )
    .join('');

const notif = (layout) => markSvg(layout, { ink: '#FFFFFF', sun: '#FFFFFF' }, { attrs: 'class="nt"' });
const notifRow = `<div class="statusbar">
  <span class="sb-time">07:42</span>
  <span class="sb-icons">${notif(layouts[LEAD_KEY])}${notif(openClockIcon())}${notif(frameOnly('dial'))}${notif(frameOnly('stopwatch', 150))}${notif(frameOnly('alarm'))}</span>
</div>
<div class="notif-legend"><span>${VARIANT_META[LEAD_KEY].name.split(' · ')[0]} מלא</span><span>טבעת פתוחה</span><span>חוגה</span><span>שעון עצר</span><span>מעורר</span></div>`;

const CREAM = '#F6F1E8';
const NIGHT = '#0E1626';
const O_ICON_DARK = { ...O_DARK, halo: null };
const iconEntry = (name, layout) => ({
  name,
  layout,
  light: O_ICON_LIGHT,
  main: { colors: O_ICON_LIGHT, bg: CREAM },
  alt: { colors: O_ICON_DARK, bg: NIGHT, label: 'רקע לילה' },
});
const oIconEntries = [iconEntry('אייקון משגר · צ׳ק ופעמון', oOut.icon)];
const oNotifEntry = { name: 'התראה · טבעת וכתר', layout: oOut.notif, light: { ink: '#111111', sun: '#111111' } };
const oNotif = (px) => markSvg(oOut.notif, { ink: '#FFFFFF', sun: '#FFFFFF' }, { attrs: `style="height:${px}px;width:auto;display:block"` });
const oSection = `<h2>י״ד · הלוגו שנבחר</h2>
  <p class="hint">הסימן המלא שנוצר מהקוד ליד הרפרנס שהבעלים בחר, ועל רקע לילה. בהמשך: אייקון המשגר, צללית ההתראה והלוגוטייפ.</p>
  <div class="o-pair">
    <figure><div class="o-tile" style="background:#FFFFFF">${markSvg(layouts.o, O_LIGHT, { attrs: 'class="mk"' })}</div><figcaption>הסימן שנוצר</figcaption></figure>
    <figure><div class="o-tile" style="background:#FFFFFF"><img class="o-ref" src="../../references/2026-10-21/logo.jpg" alt="הרפרנס שנבחר"></div><figcaption>הרפרנס</figcaption></figure>
    <figure><div class="o-tile" style="background:${NIGHT}">${markSvg(layouts.o, O_DARK, { attrs: 'class="mk"' })}</div><figcaption>על רקע לילה</figcaption></figure>
  </div>
  <h3 class="o-sub">צללית</h3>
  <div class="sils">${silhouettes([...oIconEntries, oNotifEntry])}</div>
  <h3 class="o-sub">גדלים</h3>
  <div class="panel">${sizeRows([...oIconEntries, oNotifEntry])}</div>
  <h3 class="o-sub">אייקון אפליקציה (Android adaptive)</h3>
  <div class="panel">${iconRows(oIconEntries)}</div>
  <h3 class="o-sub">אייקון התראה, 24 פיקסלים בלבן על כהה</h3>
  <div class="statusbar"><span class="sb-time">07:42</span><span class="sb-icons">${oNotif(24)}${oNotif(24)}</span></div>
  <div class="o-notif-big">${oNotif(48)}${oNotif(96)}</div>
  <h3 class="o-sub">לוגוטייפ</h3>
  <div class="o-words">
    <div class="o-word" style="background:${CREAM}">${markSvg(oOut.word, O_LIGHT, { attrs: 'class="lk-word"' })}</div>
    <div class="o-word" style="background:${NIGHT}">${markSvg(oOut.word, O_DARK, { attrs: 'class="lk-word"' })}</div>
  </div>`;

const worldGrid = WORLDS.map(
  (w) => `<figure class="world">
    <div class="tile" style="background:${w.bg}">${markSvg(layouts[LEAD_KEY], { ink: w.ink, sun: w.sun }, { attrs: 'class="mk"' })}</div>
    <div class="tile" style="background:${w.hero}">${markSvg(layouts[LEAD_KEY], { ink: w.heroInk, sun: w.heroSun }, { attrs: 'class="mk"' })}</div>
    <figcaption>${w.label}</figcaption>
  </figure>`,
).join('');

const LP = pal(LEAD_KEY);
const lockups = `<div class="lockup" style="background:${LP.bg}">
    ${markSvg(layouts[LEAD_KEY], { ink: LP.ink, sun: LP.sun }, { attrs: 'class="lk-mark"' })}
    <span class="lk-he" style="color:${LP.ink}">יהודי 365</span>
  </div>
  <div class="lockup" style="background:${LP.hero}">
    ${markSvg(layouts[LEAD_KEY], { ink: LP.heroInk, sun: LP.heroSun }, { attrs: 'class="lk-mark"' })}
    <span class="lk-he" style="color:${LP.heroInk}">יהודי 365</span>
  </div>
  <div class="lockup" style="background:${LEAD.bg}">
    ${markSvg(wordmark, { ink: LEAD.ink, sun: LEAD.sun }, { attrs: 'class="lk-word"' })}
  </div>`;

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>לוגו יהודי 365</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
  :root{color-scheme:light;--bg:#F5F3F8;--surface:#FFFFFF;--text:#1C1429;--sub:#4A4258;--border:#DCD6E5;--ok:#2C4722;--okWash:#E2EDDB;--no:#6A1B0B;--noWash:#FBE6E0}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font-family:'Heebo',system-ui,'Segoe UI',Arial,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
  .page{max-width:1180px;margin:0 auto;padding:32px 16px 72px}
  h1{font-size:30px;font-weight:800;margin:0 0 6px}
  h2{font-size:20px;font-weight:700;margin:56px 0 4px}
  .lead,.hint{margin:0;color:var(--sub);font-size:15px;max-width:780px}
  .hint{margin-bottom:18px;font-size:14px}
  .rules{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0;padding:0;list-style:none}
  .rules li{background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:4px 12px;font-size:13px}
  .story{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:20px}
  .story div{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px 16px}
  .story b{display:block;font-size:15px;margin-bottom:2px}
  .story p{margin:0;font-size:13px;color:var(--sub)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:16px}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:16px}
  .card h3{margin:14px 0 4px;font-size:17px;font-weight:700}
  .card p{margin:0;font-size:14px;color:var(--sub)}
  .duo{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .tile{border-radius:14px;aspect-ratio:1;display:grid;place-items:center;padding:14%}
  .mk{width:100%;height:100%;display:block}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 0;padding:0;list-style:none}
  .chips li{font-size:12px;border-radius:999px;padding:2px 10px}
  .chips .ok{background:var(--okWash);color:var(--ok)}
  .chips .no{background:var(--noWash);color:var(--no);font-weight:700}
  .sils{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
  .sil{margin:0;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;text-align:center}
  .sil-blur{height:120px;display:grid;place-items:center;filter:blur(7px)}
  .sil-blur .mk{width:auto;height:110px}
  .sil figcaption{font-size:13px;color:var(--sub);margin-top:8px}
  .panel{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:16px;overflow-x:auto}
  .sizes-row,.icons-row{display:flex;align-items:flex-end;gap:20px;padding:12px 0;border-bottom:1px solid var(--border);min-width:max-content}
  .sizes-row:last-child,.icons-row:last-child{border-bottom:0}
  .sizes-label{width:120px;flex:none;font-size:13px;font-weight:700;align-self:center}
  .sz{display:inline-flex;direction:ltr}
  .ic{margin:0;text-align:center}
  .ic figcaption{font-size:11px;color:var(--sub);margin-top:6px}
  .mask{width:88px;height:88px;overflow:hidden;box-shadow:0 1px 3px rgba(28,20,41,.18)}
  .mask svg{width:100%;height:100%;display:block}
  .mask.circle{border-radius:50%}
  .mask.squircle{border-radius:32%}
  .mask.rounded{border-radius:22%}
  .mask.square{border-radius:4px}
  .statusbar{direction:ltr;background:#1B1B1F;color:#FFF;border-radius:14px;height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-size:14px;max-width:420px}
  .sb-icons{display:flex;gap:14px;align-items:center}
  .nt{height:18px;width:auto;display:block}
  .notif-legend{direction:ltr;display:flex;gap:14px;justify-content:flex-end;max-width:420px;font-size:12px;color:var(--sub);margin-top:6px;padding:0 16px}
  .worlds{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px}
  .world{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .world figcaption{grid-column:1/-1;font-size:13px;color:var(--sub)}
  .lockups{display:grid;gap:12px}
  .lockup{direction:ltr;border-radius:18px;border:1px solid var(--border);padding:22px 28px;display:flex;align-items:center;gap:22px}
  .lk-mark{height:84px;width:auto;flex:none}
  .lk-he{font-weight:800;font-size:44px;letter-spacing:-.01em;direction:rtl}
  .lk-word{height:64px;width:auto;max-width:100%}
  .earlier{margin-top:16px}
  .earlier summary{cursor:pointer;font-size:15px;font-weight:700;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:14px}
  .earlier[open] summary{margin-bottom:16px}
  .o-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:12px}
  .o-pair figure{margin:0}
  .o-pair figcaption{font-size:13px;color:var(--sub);margin-top:6px}
  .o-tile{border-radius:14px;border:1px solid var(--border);aspect-ratio:1;display:grid;place-items:center;padding:6%}
  .o-ref{width:100%;height:100%;object-fit:contain;display:block}
  .o-sub{font-size:16px;font-weight:700;margin:28px 0 8px}
  .o-notif-big{direction:ltr;background:#1B1B1F;border-radius:14px;padding:16px;display:flex;gap:24px;align-items:center;max-width:420px;margin-top:10px}
  .o-words{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:12px}
  .o-word{direction:ltr;border-radius:18px;border:1px solid var(--border);padding:28px;display:grid;place-items:center}
  .o-word .lk-word{height:150px}
  footer{margin-top:56px;font-size:13px;color:var(--sub)}
  code{font-family:ui-monospace,Consolas,monospace;font-size:12px}
</style>
</head>
<body>
<main class="page">
  <h1>לוגו יהודי 365 · סקיצות וקטוריות</h1>
  <p class="lead">הרעיון: השעון הוא המסגרת, וה-365 יושב בתוכו. ה-3 של 365 הוא גם ה-E של JEW, שנקרא מלמעלה למטה. כל האותיות והשעון בנויים מאותה מערכת קווים, כך שעובי, רדיוס ומרווח משתנים בפרמטר אחד ב-<code>build.mjs</code>.</p>
  ${oSection}

  <ul class="rules">${RULES.map((r, i) => `<li>${i + 1}. ${r}</li>`).join('')}</ul>

  <div class="story">
    <div><b>3 = E</b><p>אותה צורה, מסרק עם שלוש שיניים: שיניים שמאלה הן 3, שיניים ימינה הן E. ה-E פונה ימין-לשמאל, כמו כתב עברי.</p></div>
    <div><b>W = ש</b><p>אותו מסרק כשהשיניים למעלה: W, וגם ש כמו על התפילין. ש היא 300, ה-3 של שס״ה.</p></div>
    <div><b>מסגרת = שעון = 360°</b><p>העיגול סוגר את כל הסימן: זמן, ושלמות של 360° מעלות שמקיפה את המשתמש. ה-365 בפנים הוא סיבוב שלם ועוד קצת.</p></div>
    <div><b>365</b><p>ימות החמה, ושס״ה לאוין ״כמנין ימות החמה״ (מכות כג ע״ב).</p></div>
  </div>

  <h2>שעון כמסגרת</h2>
  <p class="hint">כל כרטיס מציג את הסימן על רקע בהיר ועל צבע ה-hero של "שוק בלילה". גודל המסגרת מחושב מהדיו של האותיות עצמן, כך שהמרווח סביב הטקסט שווה.</p>
  <div class="grid">${variantCards(FRAME_KEYS)}</div>

  <details class="earlier">
    <summary>סבבים קודמים: שעון משמאל ל-3 (ה׳, ו׳) ובלי שעון (א׳ עד ד׳)</summary>
    <div class="grid">${variantCards(EARLIER_KEYS)}</div>
  </details>

  <h2>בדיקת צללית</h2>
  <p class="hint">ככה הסימן נראה ממרחק או בעין עייפה. הצורה הכללית צריכה להיות נקייה מאסוציאציות לא רצויות.</p>
  <div class="sils">${silhouettes(TEST_KEYS.map(legacyEntry))}</div>

  <h2>גדלים</h2>
  <p class="hint">16 עד 128 פיקסלים. מתחת ל-32 העמודה מתחילה להיסגר, ולכן אייקון ההתראה צריך גרסה מקוצרת.</p>
  <div class="panel">${sizeRows(TEST_KEYS.map(legacyEntry))}</div>

  <h2>אייקון אפליקציה (Android adaptive)</h2>
  <p class="hint">קנבס 108dp, הלאנצ'ר מציג את 72dp האמצעיים בתוך מסכה, ורק עיגול של 66dp בטוח. הסימן מוגדל עד שהנקודה הרחוקה ביותר שלו נוגעת בעיגול הבטוח (הקו המקווקו).</p>
  <div class="panel">${iconRows(TEST_KEYS.map(legacyEntry))}</div>

  <h2>אייקון התראה</h2>
  <p class="hint">Android צובע אותו לבן בשורת המצב, בגובה 24dp. הסימן המלא הופך שם לכתם, ולכן ההתראה משתמשת רק במסגרת עם מחוגים, באותה צורה של הלוגו.</p>
  ${notifRow}

  <h2>עולמות צבע</h2>
  <p class="hint">${VARIANT_META[LEAD_KEY].name} בכל עולמות הצבע מלוח העיצוב מחדש. הסימן בנוי משני צבעים בלבד: דיו לאותיות, וצבע הדגשה למסגרת השעון.</p>
  <div class="worlds">${worldGrid}</div>

  <h2>שילוב עם שם (כלל 4)</h2>
  <p class="hint">שלוש אפשרויות לכלל 4: סימן ליד "יהודי 365" בעברית, אותו דבר על צבע כהה, או לוגוטייפ אנגלי מלא באותה מערכת אותיות, שבו רואים ש-E ו-3 הן מראה אחת של השנייה.</p>
  <div class="lockups">${lockups}</div>

  <footer>נבנה מ-<code>design/jew365-concepts/vector/build.mjs</code> · <code>node design/jew365-concepts/vector/build.mjs</code> מייצר מחדש את הלוח ואת קובצי ה-SVG.</footer>
</main>
</body>
</html>
`;

writeFileSync(join(OUT, 'index.html'), html);
console.log('wrote', keys.map((k) => `mark-${k}.svg`).join(', '), 'wordmark.svg index.html');

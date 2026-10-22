import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));

const tidy = (svg) => svg.replace(/-?\d+\.\d{3,}/g, (n) => String(Number(Number(n).toFixed(2))));

const deg = (d) => (d * Math.PI) / 180;
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
  tefillinPair: {
    r: 54,
    d: 'M-46 -28L-38 -36H-10L-18 -28M-18 0L-10 -8V-36M-10 -12L-2 -20H26L18 -12M18 16L26 8V-20M-32 0C-32 12 -24 16 -10 16M26 2C38 2 42 12 36 20C30 28 38 36 46 34',
    fill: 'M-46 -28H-18V0H-46ZM-10 -12H18V16H-10Z',
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

const markO = scaledMark({ ...O_CORE, icons: MITZVOT_SYMBOLS_O, ends: O_ENDS, check: true, bell: true }, { icon: 0.116, glyph: 0.104 });

function markSvg(layout, colors, { pad = 0, bg, title, attrs = '' } = {}) {
  const b = layout.box;
  const vb = `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`;
  const bgRect = bg ? `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.w + pad * 2}" height="${b.h + pad * 2}" fill="${bg}"/>` : '';
  const t = title ? `<title>${title}</title>` : '';
  return tidy(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" ${attrs}>${t}${bgRect}${layout.render(colors)}</svg>`);
}

function adaptiveIcon(layout, colors, bg, { guides = false, safe = 32 } = {}) {
  const b = layout.box;
  const [cx, cy] = layout.center;
  const k = safe / layout.reach(cx, cy);
  const nested = `<svg x="${54 - (cx - b.x) * k}" y="${54 - (cy - b.y) * k}" width="${b.w * k}" height="${b.h * k}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">${layout.render(colors)}</svg>`;
  const guide = guides
    ? `<circle cx="54" cy="54" r="33" fill="none" stroke="#FF3B6B" stroke-width="0.6" stroke-dasharray="2 1.5"/>`
    : '';
  return tidy(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><rect x="0" y="0" width="108" height="108" fill="${bg}"/>${nested}${guide}</svg>`);
}

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

const O_LIGHT = lightColors(BLUE_ORANGE);
const O_DARK = darkColors(BLUE_ORANGE);
const O_ICON_LIGHT = { ...O_LIGHT, halo: null };
const O_SILHOUETTE = { ink: '#000000', sun: '#000000' };
const oOut = Object.fromEntries(Object.entries(O_OUTPUTS).map(([k, f]) => [k, f()]));
const oSvgs = {
  'mark-o.svg': markSvg(markO, O_LIGHT, { pad: 24, title: 'Jew 365 mark o' }),
  'mark-o-mono.svg': markSvg(markO, O_SILHOUETTE, { pad: 24, title: 'Jew 365 mark o mono' }),
  'mark-o-dark.svg': markSvg(markO, O_DARK, { pad: 24, title: 'Jew 365 mark o on dark' }),
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
  JSON.stringify({ mark: metaOf(markO), icon: metaOf(oOut.icon), notif: metaOf(oOut.notif), wordmark: metaOf(oOut.word) }, null, 2) + '\n',
);

const MONO = { ink: '#000', sun: '#000' };
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

const CREAM = '#F6F1E8';
const NIGHT = '#0E1626';
const O_ICON_DARK = { ...O_DARK, halo: null };
const oIconEntries = [
  {
    name: 'אייקון משגר · צ׳ק ופעמון',
    layout: oOut.icon,
    light: O_ICON_LIGHT,
    main: { colors: O_ICON_LIGHT, bg: CREAM },
    alt: { colors: O_ICON_DARK, bg: NIGHT, label: 'רקע לילה' },
  },
];
const oNotifEntry = { name: 'התראה · טבעת וכתר', layout: oOut.notif, light: { ink: '#111111', sun: '#111111' } };
const oNotif = (px) => markSvg(oOut.notif, { ink: '#FFFFFF', sun: '#FFFFFF' }, { attrs: `style="height:${px}px;width:auto;display:block"` });

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
  :root{color-scheme:light;--bg:#F5F3F8;--surface:#FFFFFF;--text:#1C1429;--sub:#4A4258;--border:#DCD6E5}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font-family:'Heebo',system-ui,'Segoe UI',Arial,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
  .page{max-width:1180px;margin:0 auto;padding:32px 16px 72px}
  h1{font-size:30px;font-weight:800;margin:0 0 6px}
  .lead{margin:0 0 28px;color:var(--sub);font-size:15px;max-width:780px}
  .mk{width:100%;height:100%;display:block}
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
  .lk-word{height:64px;width:auto;max-width:100%}
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
  <h1>לוגו יהודי 365</h1>
  <p class="lead">הסימן המלא שנוצר מהקוד ליד הרפרנס שהבעלים בחר, ועל רקע לילה. בהמשך: אייקון המשגר, צללית ההתראה והלוגוטייפ.</p>
  <div class="o-pair">
    <figure><div class="o-tile" style="background:#FFFFFF">${markSvg(markO, O_LIGHT, { attrs: 'class="mk"' })}</div><figcaption>הסימן שנוצר</figcaption></figure>
    <figure><div class="o-tile" style="background:#FFFFFF"><img class="o-ref" src="../../references/2026-10-21/logo.jpg" alt="הרפרנס שנבחר"></div><figcaption>הרפרנס</figcaption></figure>
    <figure><div class="o-tile" style="background:${NIGHT}">${markSvg(markO, O_DARK, { attrs: 'class="mk"' })}</div><figcaption>על רקע לילה</figcaption></figure>
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
  </div>

  <footer>נבנה מ-<code>design/jew365-concepts/vector/build.mjs</code> · <code>node design/jew365-concepts/vector/build.mjs</code> מייצר מחדש את הלוח ואת קובצי ה-SVG.</footer>
</main>
</body>
</html>
`;

writeFileSync(join(OUT, 'index.html'), html);
console.log('wrote', Object.keys(oSvgs).join(', '), 'mark-o-meta.json index.html');

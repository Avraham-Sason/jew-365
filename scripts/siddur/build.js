#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { HDate, OmerEvent } = require('@hebcal/core');
const {
  SOURCES,
  TEXTS,
  CONDITIONAL_INSTRUCTION,
  ALWAYS_SAID,
  RULES,
  MINYAN_ONLY_TITLES,
  HEBREW_ONLY_TEXTS,
} = require('./manifest');

const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const OUT_DIR = path.join(ROOT, 'assets', 'siddur');
const ASSET_MAP = path.join(ROOT, 'src', 'data', 'siddurAssets.generated.ts');
const NUSCHAOT = ['ashkenaz', 'sefard', 'edot_hamizrach', 'chabad'];

function sourceUrl(source) {
  if (source.wikisource) {
    return `https://he.wikisource.org/w/api.php?action=query&prop=revisions&revids=${source.revision}&rvprop=ids|content&rvslots=main&format=json`;
  }
  const name = `${source.title} - ${source.lang} - ${source.version}`;
  return `https://www.sefaria.org/download/version/${encodeURIComponent(name)}.json`;
}

function wikitextOf(data, source, key) {
  const page = Object.values(data.query?.pages ?? {})[0];
  const revision = page?.revisions?.[0];
  if (page?.title !== source.wikisource || revision?.revid !== source.revision) {
    throw new Error(`${key}: revision ${source.revision} is not of "${source.wikisource}"`);
  }
  return revision.slots.main['*'];
}

async function loadSource(key) {
  const source = SOURCES[key];
  if (!source) throw new Error(`unknown source ${key}`);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(cached)) {
    const response = await fetch(sourceUrl(source));
    if (!response.ok) throw new Error(`download failed for ${key}: HTTP ${response.status}`);
    fs.writeFileSync(cached, await response.text());
  }
  const data = JSON.parse(fs.readFileSync(cached, 'utf8'));
  if (source.wikisource) {
    if (source.patches) throw new Error(`${key}: patches apply only to a Sefaria source`);
    return wikitextOf(data, source, key);
  }
  return source.patches ? patchedTree(data.text, source.patches, key) : data.text;
}

function patchedTree(tree, patches, key) {
  const seen = patches.map(() => 0);
  const walk = (node) => {
    if (typeof node === 'string') {
      return patches.reduce((text, patch, n) => {
        const pieces = text.split(patch.from);
        seen[n] += pieces.length - 1;
        return pieces.join(patch.to);
      }, node);
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object')
      return Object.fromEntries(Object.entries(node).map(([name, child]) => [name, walk(child)]));
    return node;
  };
  const patched = walk(tree);
  patches.forEach((patch, n) => {
    if (seen[n] !== patch.count)
      throw new Error(`${key}: patch "${patch.from}" matched ${seen[n]}x, expected ${patch.count}`);
  });
  return patched;
}

function segmentsAt(tree, nodePath, sourceKey) {
  let node = tree;
  for (const key of nodePath.split(' > ')) {
    node = node?.[key];
    if (node === undefined) throw new Error(`${sourceKey}: no node "${nodePath}"`);
  }
  if (!Array.isArray(node)) throw new Error(`${sourceKey}: "${nodePath}" is not a leaf`);
  return node.flat(Infinity).map((segment) => (typeof segment === 'string' ? segment : ''));
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelMarker(kind, label) {
  return new RegExp(`<קטע ${kind}=["']?${escapeRegExp(label)}["']?\\s*/>`);
}

function labeledText(wikitext, label, key) {
  const parts = [];
  let rest = wikitext;
  for (let start = labelMarker('התחלה', label).exec(rest); start; start = labelMarker('התחלה', label).exec(rest)) {
    rest = rest.slice(start.index + start[0].length);
    const end = labelMarker('סוף', label).exec(rest);
    if (!end) throw new Error(`${key}: label "${label}" never ends`);
    parts.push(rest.slice(0, end.index));
    rest = rest.slice(end.index + end[0].length);
  }
  if (!parts.length) throw new Error(`${key}: no label "${label}"`);
  return parts.join('');
}

function textBetween(wikitext, after, before, key) {
  const end = labelMarker('סוף', after).exec(wikitext);
  if (!end) throw new Error(`${key}: no label "${after}"`);
  const rest = wikitext.slice(end.index + end[0].length);
  const start = labelMarker('התחלה', before).exec(rest);
  if (!start) throw new Error(`${key}: no label "${before}" after "${after}"`);
  return rest.slice(0, start.index);
}

const TRANSPARENT_TEMPLATES = ['עם-ניקוד'];
const HEADING_LINE = /^(={1,6})[ \t]*(.+?)[ \t]*\1[ \t]*$/;

function withoutVowels(text) {
  return text.replace(/[֑-ׇ]/g, '');
}

function withoutWrappers(wikitext, key) {
  let out = wikitext;
  for (const name of TRANSPARENT_TEMPLATES) {
    const open = `{{${name}|`;
    const start = out.indexOf(open);
    if (start === -1) continue;
    let depth = 0;
    let end = -1;
    for (let i = start; i < out.length - 1 && end === -1; i++) {
      const pair = out.slice(i, i + 2);
      if (pair === '{{') {
        depth++;
        i++;
      } else if (pair === '}}') {
        depth--;
        if (depth === 0) end = i;
        i++;
      }
    }
    if (end === -1) throw new Error(`${key}: {{${name}}} never closes`);
    out = out.slice(0, start) + out.slice(start + open.length, end) + out.slice(end + 2);
  }
  return out;
}

function headingKey(text) {
  return withoutVowels(text.normalize('NFC')).replace(/\s+/g, ' ').trim();
}

function headingsOf(wikitext) {
  const headings = [];
  let offset = 0;
  for (const line of wikitext.split('\n')) {
    const found = HEADING_LINE.exec(line);
    if (found)
      headings.push({ level: found[1].length, key: headingKey(found[2]), start: offset, end: offset + line.length });
    offset += line.length + 1;
  }
  return headings;
}

function headingNamed(headings, name, key) {
  const wanted = headingKey(name.replace(/^#\s*/, ''));
  const found = headings.filter((heading) => heading.key === wanted);
  if (found.length !== 1) throw new Error(`${key}: ${found.length} headings named "${wanted}"`);
  return found[0];
}

function headingText(wikitext, part, key) {
  const headings = headingsOf(wikitext);
  const [after, before] = part.split(' .. ');
  const first = headingNamed(headings, after, key);
  if (before !== undefined) {
    const last = headingNamed(headings, before, key);
    if (last.start < first.end) throw new Error(`${key}: heading "${before}" comes before "${after}"`);
    return wikitext.slice(first.end, last.start);
  }
  const next = headings.find((heading) => heading.start > first.start && heading.level <= first.level);
  return wikitext.slice(first.end, next?.start ?? wikitext.length);
}

const WIKI_TEMPLATES = {
  ש: () => '<br>',
  הור: ([note]) => `<small>${note}</small>`,
  הור2: ([note]) => `<small>${note}</small>`,
  'הוראה למתפללים': ([note]) => `<small>${note}</small>`,
  צת: () => '',
  הור1: ([condition, text]) => `<small>${condition}</small><opt>${text}</opt>`,
  נוא: ([text], named) => `(<small>${named['הוראה']}</small> ${text})`,
  צ: ([text]) => text,
  ממס: () => '',
  רווח: () => ' ',
  'רקע אפור': () => '',
  סוף: () => '',
};

function expandTemplate(body, key) {
  const [name, ...args] = body.split('|');
  const expand = WIKI_TEMPLATES[name.trim()];
  if (!expand) throw new Error(`${key}: unsupported template {{${name.trim()}}}`);
  const named = Object.fromEntries(
    args.filter((arg) => /^[^=]+=/.test(arg)).map((arg) => arg.split(/=(.*)/s).slice(0, 2)),
  );
  return expand(
    args.filter((arg) => !/^[^=]+=/.test(arg)),
    named,
  );
}

function pinnedPage(page, key) {
  const sourceKey = Object.keys(SOURCES).find((candidate) => SOURCES[candidate].wikisource === page);
  if (!sourceKey) throw new Error(`${key}: transcludes "${page}", which is not a pinned source`);
  return sourceKey;
}

async function wikiToHtml(wikitext, key, used) {
  let html = wikitext
    .replace(/<noinclude>[\s\S]*?<\/noinclude>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<קטע (?:התחלה|סוף)=[^>]*\/>/g, '')
    .replace(new RegExp(HEADING_LINE.source, 'gm'), (_, __, heading) => `<small>${withoutVowels(heading)}</small>`);
  for (
    let found = /\{\{#קטע:([^|{}]+)\|([^|{}]+)\}\}/.exec(html);
    found;
    found = /\{\{#קטע:([^|{}]+)\|([^|{}]+)\}\}/.exec(html)
  ) {
    const [page, label] = [found[1].trim(), found[2].trim()];
    const sourceKey = pinnedPage(page, key);
    used.add(sourceKey);
    const included = await wikiToHtml(labeledText(await loadSource(sourceKey), label, sourceKey), sourceKey, used);
    html = html.slice(0, found.index) + included + html.slice(found.index + found[0].length);
  }
  for (let found = /\{\{:([^|{}]+)\}\}/.exec(html); found; found = /\{\{:([^|{}]+)\}\}/.exec(html)) {
    const sourceKey = pinnedPage(found[1].trim(), key);
    used.add(sourceKey);
    const included = await wikiToHtml(withoutWrappers(await loadSource(sourceKey), sourceKey), sourceKey, used);
    html = html.slice(0, found.index) + included + html.slice(found.index + found[0].length);
  }
  for (let previous = ''; previous !== html;) {
    previous = html;
    html = html.replace(/\{\{([^{}]*)\}\}/g, (_, body) => expandTemplate(body, key));
  }
  html = html
    .replace(/'''(.+?)'''/g, '<b>$1</b>')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/^:+/gm, '');
  if (/\{\{|\}\}|\{\||\[\[|''/.test(html)) throw new Error(`${key}: unconverted wiki markup in "${html.slice(0, 80)}"`);
  return html;
}

async function wikisourceSegments(key, nodePath, used) {
  const wikitext = withoutWrappers((await loadSource(key)).replace(/<noinclude>[\s\S]*?<\/noinclude>/g, ''), key);
  const segments = [];
  used.add(key);
  for (const part of nodePath.split(' | ')) {
    const [after, before] = part.split(' .. ');
    let raw;
    if (part === '*') raw = wikitext;
    else if (part.startsWith('#')) raw = headingText(wikitext, part, key);
    else raw = before === undefined ? labeledText(wikitext, part, key) : textBetween(wikitext, after, before, key);
    const html = await wikiToHtml(raw, key, used);
    segments.push(
      ...html
        .split(/\n[ \t]*\n/)
        .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean),
    );
  }
  return segments;
}

async function segmentsOf(sourceKey, nodePath, used = new Set()) {
  const source = SOURCES[sourceKey];
  if (!source) throw new Error(`unknown source ${sourceKey}`);
  if (source.wikisource) return wikisourceSegments(sourceKey, nodePath, used);
  used.add(sourceKey);
  return segmentsAt(await loadSource(sourceKey), nodePath, sourceKey);
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// Removes each element that starts with `opener` up to its own closing tag, counting nested tags of
// the same name: a footnote that italicises a word inside itself must not leak its tail.
function withoutElements(html, opener, tag) {
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  let out = '';
  let rest = html;
  for (let start = rest.indexOf(opener); start !== -1; start = rest.indexOf(opener)) {
    out += rest.slice(0, start);
    tags.lastIndex = start;
    let depth = 0;
    let end = rest.length;
    for (let found = tags.exec(rest); found; found = tags.exec(rest)) {
      depth += found[1] ? -1 : 1;
      if (depth === 0) {
        end = found.index + found[0].length;
        break;
      }
    }
    rest = rest.slice(end);
  }
  return out + rest;
}

function withoutFootnotes(html) {
  return withoutElements(withoutElements(html, '<sup class="footnote-marker">', 'sup'), '<i class="footnote">', 'i');
}

function parseCondition(tag) {
  const attribute = (name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1]?.split(',').filter(Boolean);
  const condition = {};
  for (const key of ['all', 'any', 'none']) {
    const flags = attribute(key);
    if (flags?.length) condition[key] = flags;
  }
  return condition;
}

const POINTED_LETTER = /[א-ת][֑-֯]*[ְ-ׇּׁׂ]/g;

function isVocalized(text) {
  const letters = (text.match(/[א-ת]/g) ?? []).length;
  return letters >= 3 && (text.match(POINTED_LETTER) ?? []).length / letters >= 0.5;
}

function textOf(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ''));
}

const INSTRUCTION_LEAD = /^((?:\s|<\/?b>|[^<֑-ׇ:])*?[א-ת](?:\s|<\/?b>|[^<֑-ׇ:]){0,60}:)([\s\S]*)$/;

function balancedSmallTags(line) {
  const tokens = line.split(/(<\/?small\b[^>]*>)/i);
  const keep = tokens.map(() => true);
  const open = [];
  tokens.forEach((token, index) => {
    if (/^<small\b/i.test(token)) open.push(index);
    else if (/^<\/small/i.test(token)) {
      if (open.length) open.pop();
      else keep[index] = false;
    }
  });
  for (const index of open) keep[index] = false;
  return tokens.filter((_, index) => keep[index]).join('');
}

function saidPart(line) {
  return textOf(line.replace(/<small\b[^>]*>[\s\S]*?<\/small>/gi, ''));
}

function unwrapSaidText(inner) {
  const lines = inner.split(/(<br\s*\/?>)/i).map((line) => (/^<br/i.test(line) ? line : balancedSmallTags(line)));
  const isLine = (line) => !/^<br/i.test(line) && textOf(line).trim();
  if (!isVocalized(textOf(inner)) && !lines.some((line) => isLine(line) && isVocalized(saidPart(line)))) {
    return { html: `<small>${inner}</small>`, promoted: false };
  }
  let promoted = false;
  const html = lines
    .map((line) => {
      if (!isLine(line)) return line;
      if (!isVocalized(saidPart(line))) return `<small>${line.replace(/<\/?small\b[^>]*>/gi, '')}</small>`;
      promoted = true;
      const lead = INSTRUCTION_LEAD.exec(line);
      return lead && isVocalized(textOf(lead[2])) ? `<small>${lead[1]}</small>${lead[2]}` : line;
    })
    .join('');
  return { html, promoted };
}

function flattenSmall(html) {
  let depth = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((token) => {
      if (/^<small\b/i.test(token)) {
        depth++;
        return '';
      }
      if (/^<\/small/i.test(token)) {
        depth = Math.max(0, depth - 1);
        return '';
      }
      if (depth === 0 || token.startsWith('<') || !textOf(token).trim() || isVocalized(textOf(token))) return token;
      return `<small>${token}</small>`;
    })
    .join('');
}

function classifySmall(html) {
  let out = '';
  let depth = 0;
  let buffer = [];
  let promoted = false;
  for (const token of html.split(/(<[^>]+>)/)) {
    const opens = /^<small\b/i.test(token);
    const closes = /^<\/small\s*>/i.test(token);
    if (opens) {
      depth++;
      if (depth === 1) {
        buffer = [];
        continue;
      }
    } else if (closes && depth > 0) {
      depth--;
      if (depth === 0) {
        const said = unwrapSaidText(buffer.join(''));
        out += said.html;
        promoted ||= said.promoted;
        continue;
      }
    } else if (depth === 0) {
      out += token;
      continue;
    }
    buffer.push(token);
  }
  if (depth > 0) out += `<small>${buffer.join('')}`;
  return { html: out, promoted };
}

function sameRunStyle(a, b) {
  return a.s === b.s && sameCondition(a.when, b.when);
}

function parseHebrew(html) {
  const paragraphs = [[]];
  const conditions = [];
  let small = 0;
  let bold = 0;
  const push = (text) => {
    const clean = decodeEntities(text).replace(/\s+/g, ' ');
    if (!clean) return;
    const run = { t: clean };
    if (small) run.s = 'n';
    else if (bold) run.s = 'b';
    if (conditions.length) run.when = conditions[conditions.length - 1];
    const runs = paragraphs[paragraphs.length - 1];
    const last = runs[runs.length - 1];
    if (last && sameRunStyle(last, run)) last.t += clean;
    else runs.push(run);
  };
  const tokens = withoutFootnotes(html).split(/(<[^>]+>)/);
  for (const token of tokens) {
    const tag = /^<\s*(\/)?\s*([a-z]+)/i.exec(token);
    if (!tag) {
      push(token);
      continue;
    }
    const closing = Boolean(tag[1]);
    const name = tag[2].toLowerCase();
    if (name === 'br') paragraphs.push([]);
    else if (name === 'small') small += closing ? -1 : 1;
    else if (name === 'b' || name === 'strong' || name === 'big') bold += closing ? -1 : 1;
    else if (name === 'if') {
      if (closing) conditions.pop();
      else conditions.push(parseCondition(token));
    }
  }
  return paragraphs.map(tidyRuns).filter((runs) => runs.length > 0);
}

function parseEnglish(html) {
  const text = decodeEntities(
    withoutFootnotes(html)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
  return /[A-Za-z]{2,}/.test(text) ? text.replace(/^\d+\.\s/, '') : '';
}

function tidyRuns(runs) {
  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && sameRunStyle(last, run)) last.t += run.t;
    else if (last && !run.t.trim() && !run.when && !last.when) last.t += run.t;
    else merged.push({ ...run });
  }
  const tidy = merged.map((run) => ({ ...run, t: run.t.replace(/\s+/g, ' ') }));
  if (tidy.length) {
    tidy[0].t = tidy[0].t.trimStart();
    tidy[tidy.length - 1].t = tidy[tidy.length - 1].t.trimEnd();
  }
  return tidy.filter((run) => run.t.length > 0);
}

function linearPunctuation(runs) {
  const tidy = tidyRuns(runs);
  return tidy.map((run, index) => ({
    ...run,
    t: run.t.replace(/\.(?=\s)/g, ',').replace(/\.\s*$/, index === tidy.length - 1 ? ':' : ','),
  }));
}

function isAlwaysSaid(segment) {
  const said = normalizeHebrew(
    segment.he
      .flat()
      .filter((run) => run.s !== 'n')
      .map((run) => run.t)
      .join(' '),
  );
  return ALWAYS_SAID.some((pattern) => pattern.test(said));
}

function plain(runs) {
  return runs
    .flat()
    .map((run) => run.t)
    .join(' ');
}

function normalizeHebrew(text) {
  return text
    .replace(/־/g, ' ')
    .replace(/[֑-ׇ]/g, '')
    .replace(/יהוה|יי|ה'/g, 'ה')
    .replace(/[.,:;!?״׳"'()[\]|׃<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeConditions(...conditions) {
  const present = conditions.filter(Boolean);
  if (!present.length) return undefined;
  const merged = {};
  const all = [...new Set(present.flatMap((c) => c.all ?? []))];
  const none = [...new Set(present.flatMap((c) => c.none ?? []))];
  const anys = [...new Set(present.filter((c) => c.any).map((c) => JSON.stringify([...c.any].sort())))];
  if (anys.length > 1) throw new Error(`cannot combine two "any" conditions: ${anys.join(' and ')}`);
  if (anys.length) merged.any = JSON.parse(anys[0]);
  const omerDays = [...new Set(present.map((c) => c.omerDay).filter((d) => d !== undefined))];
  if (omerDays.length > 1) throw new Error(`conflicting omer days ${omerDays}`);
  if (all.length) merged.all = all;
  if (none.length) merged.none = none;
  if (omerDays.length) merged.omerDay = omerDays[0];
  return merged;
}

function sameCondition(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function applyEdits(html, edits, label) {
  let out = html.normalize('NFC');
  for (const edit of edits) {
    const from = edit.from.normalize('NFC');
    const count = out.split(from).length - 1;
    const expected = edit.count ?? 1;
    if (count !== expected) throw new Error(`${label}: edit "${edit.from}" matched ${count}x, expected ${expected}`);
    out = out.split(from).join(edit.to.normalize('NFC'));
  }
  return out;
}

function applyEnMoves(enAll, moves, label) {
  if (!moves?.length) return enAll;
  const out = [...enAll];
  for (const move of moves) {
    const text = move.text.normalize('NFC');
    const current = (out[move.seg] ?? '').normalize('NFC');
    const count = current.split(text).length - 1;
    if (count !== 1) throw new Error(`${label} #${move.seg} (en): move "${text}" matched ${count}x, expected 1`);
    out[move.seg] = current.split(text).join(' ').replace(/ {2,}/g, ' ');
    const target = (out[move.to] ?? '').normalize('NFC');
    out[move.to] = (move.before ? [text, target] : [target, text]).filter(Boolean).join(' ');
  }
  return out;
}

function tagOmerDays(spec, label) {
  const { first, stride } = spec.omer;
  const days = {};
  for (let day = 1; day <= 49; day++) {
    for (let offset = 0; offset < stride; offset++) days[first + (day - 1) * stride + offset] = day;
  }
  return (index) => (days[index] === undefined ? undefined : { omerDay: days[index] });
}

const HEBREW_UNITS = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const HEBREW_TENS = ['', 'י', 'כ', 'ל'];
function gematriya(n) {
  if (n === 15) return 'טו';
  if (n === 16) return 'טז';
  return HEBREW_TENS[Math.floor(n / 10)] + HEBREW_UNITS[n % 10];
}
function omerDateLabel(day) {
  const nisan = 15 + day;
  if (nisan <= 30) return `${gematriya(nisan)} ניסן`;
  const iyar = nisan - 30;
  if (iyar <= 29) return `${gematriya(iyar)} אייר`;
  return `${gematriya(iyar - 29)} סיון`;
}
function normalizeLabel(text) {
  return normalizeHebrew(text.replace(/[״"׳']/g, '')).replace(/סיוון/g, 'סיון');
}

function verifyOmer(segments, label) {
  const byDay = new Map();
  for (const segment of segments) {
    const day = segment.when?.omerDay;
    if (day === undefined) continue;
    byDay.set(day, `${byDay.get(day) ?? ''} ${plain(segment.he)}`);
  }
  if (byDay.size !== 49) throw new Error(`${label}: expected 49 omer days, found ${byDay.size}`);
  for (const [day, text] of byDay) {
    const expected = normalizeLabel(omerDateLabel(day));
    if (!normalizeLabel(text).includes(expected)) {
      throw new Error(
        `${label}: omer day ${day} does not carry the date "${omerDateLabel(day)}": ${text.slice(0, 80)}`,
      );
    }
  }
}

function bySegment(edits) {
  const map = new Map();
  for (const edit of edits ?? []) map.set(edit.seg, [...(map.get(edit.seg) ?? []), edit]);
  return map;
}

function mergeSameTitledSections(sections) {
  const merged = [];
  for (const section of sections) {
    const previous = merged[merged.length - 1];
    if (previous && previous.title.he === section.title.he) {
      if (JSON.stringify(previous.optional ?? null) !== JSON.stringify(section.optional ?? null)) {
        throw new Error(`${section.title.he}: merged sections disagree on "optional"`);
      }
      if (section.chapter) throw new Error(`${section.title.he}: a chapter must open on the first spec of its section`);
      previous.segments.push(...section.segments);
    } else merged.push({ ...section, segments: [...section.segments] });
  }
  return merged.filter((section) => section.segments.length > 0);
}

const LABELED_PARTS = { optional: 'optionalParts', minyan: 'minyanParts' };

function checkLabel(label, where) {
  if (!label?.he?.trim() || !label?.en?.trim()) throw new Error(`${where}: a passage label needs Hebrew and English`);
}

function labeledPartsOf(spec, label) {
  if (spec.minyan && spec.minyanParts) throw new Error(`${label}: both "minyan" and "minyanParts"`);
  const parts = [];
  for (const [field, key] of Object.entries(LABELED_PARTS)) {
    const covered = new Map();
    for (const part of spec[key] ?? []) {
      const to = part.to ?? part.from;
      checkLabel(part.label, `${label} ${field} part #${part.from}`);
      if (part.en !== undefined && part.englishInPart)
        throw new Error(`${label}: a part carries both "en" and "englishInPart"`);
      if (part.englishInPart && part.englishOutside)
        throw new Error(`${label}: a part carries both "englishInPart" and "englishOutside"`);
      if (part.paragraph !== undefined && part.paragraph < 1)
        throw new Error(`${label} #${part.from}: starts at paragraph ${part.paragraph}`);
      if (part.until !== undefined && part.until < 1)
        throw new Error(`${label} #${to}: ends at paragraph ${part.until}`);
      for (let i = part.from; i <= to; i++) {
        const start = i === part.from ? (part.paragraph ?? 0) : 0;
        const end = i === to ? (part.until ?? Infinity) : Infinity;
        const taken = covered.get(i) ?? [];
        if (taken.some((other) => start < other.end && other.start < end))
          throw new Error(`${label} #${i}: two ${field} parts overlap`);
        covered.set(i, [...taken, { start, end }]);
      }
      parts.push({ ...part, to, field, source: part });
    }
  }
  return parts;
}

function partCovers(part, index, first, last) {
  return (
    index >= part.from &&
    index <= part.to &&
    (index > part.from || first >= (part.paragraph ?? 0)) &&
    (index < part.to || part.until === undefined || last < part.until)
  );
}

function englishLeftOver(draft, spoken, label) {
  let left = draft.en;
  for (const part of spoken) {
    const count = draft.en.split(part.en).length - 1;
    if (count !== 1)
      throw new Error(`${label} #${draft.index}: part English "${part.en}" matched ${count}x, expected 1`);
    left = left.split(part.en).join(' ');
  }
  return left.replace(/ {2,}/g, ' ').trim();
}

function withLabels(draft, parts, label) {
  const own = parts.filter((part) => draft.index >= part.from && draft.index <= part.to);
  const cuts = [
    ...own.filter((part) => part.from === draft.index && part.paragraph).map((part) => part.paragraph),
    ...own.filter((part) => part.to === draft.index && part.until).map((part) => part.until),
  ];
  for (const cut of cuts) {
    if (cut >= draft.he.length)
      throw new Error(`${label} #${draft.index}: cannot cut ${draft.he.length} paragraphs at ${cut}`);
  }
  const bounds = [...new Set([0, ...cuts, draft.he.length])].sort((a, b) => a - b);
  const spoken = own.filter((part) => part.en !== undefined);
  const leftOver = spoken.length ? englishLeftOver(draft, spoken, label) : draft.en;
  const pieces = bounds.slice(0, -1).map((first, n) => {
    const piece = { ...draft, he: draft.he.slice(first, bounds[n + 1]), en: '' };
    for (const part of own.filter((candidate) => partCovers(candidate, draft.index, first, bounds[n + 1] - 1))) {
      piece[part.field] = part.label;
      if (part.englishInPart) piece.en = leftOver;
    }
    return piece;
  });
  if (!own.some((part) => part.englishInPart && pieces.some((piece) => piece.en))) {
    const outside = own.some((part) => part.englishOutside) && pieces.find((piece) => !piece.optional && !piece.minyan);
    (outside || pieces[0]).en = leftOver;
  }
  for (const part of spoken) {
    bounds.slice(0, -1).forEach((first, n) => {
      if (partCovers(part, draft.index, first, bounds[n + 1] - 1))
        pieces[n].en = [pieces[n].en, part.en].filter(Boolean).join(' ');
    });
  }
  return pieces;
}

async function buildSection(spec, ctx) {
  const label = `${ctx.nusach}/${ctx.textId}/${spec.title.he}`;
  const used = new Set();
  const heAll = await segmentsOf(spec.he, spec.path, used);
  for (const key of used) ctx.credits.add(key);
  const enSource = spec.en ? await segmentsOf(spec.en, spec.enPath ?? spec.path) : [];
  const from = spec.from ?? 0;
  const to = spec.to ?? heAll.length - 1;
  if (to >= heAll.length) throw new Error(`${label}: range ends at ${to} but source has ${heAll.length} segments`);
  const omerOf = spec.omer ? tagOmerDays(spec, label) : () => undefined;
  const editsBySeg = bySegment(spec.edits);
  const enEditsBySeg = bySegment(spec.enEdits?.filter((edit) => !edit.memory));
  const memoryEditsBySeg = bySegment(spec.enEdits?.filter((edit) => edit.memory));
  const enDropped = new Set(spec.enDrop);
  for (const i of [...enEditsBySeg.keys(), ...memoryEditsBySeg.keys()]) {
    if (enDropped.has(i)) throw new Error(`${label} #${i}: enEdits on a segment in enDrop`);
  }
  const parts = labeledPartsOf(spec, label);
  const matchedParts = new Set();
  if (spec.optional) checkLabel(spec.optional, label);
  if (spec.minyan) checkLabel(spec.minyan, label);
  if (spec.chapter) checkLabel(spec.chapter, label);
  const selected = (i) => i >= from && i <= to && !spec.drop?.includes(i);
  const targets = [
    ...editsBySeg.keys(),
    ...enEditsBySeg.keys(),
    ...memoryEditsBySeg.keys(),
    ...(spec.enMoves ?? []).flatMap((move) => [move.seg, move.to]),
    ...enDropped,
    ...Object.keys(spec.at ?? {}).map(Number),
    ...(spec.groups ?? []).flat(),
    ...(spec.reviewed ?? []),
    ...parts.flatMap((part) => [part.from, part.to]),
  ];
  const stray = targets.filter((i) => !selected(i));
  if (stray.length) throw new Error(`${label}: edits, conditions or groups target unselected segments ${stray}`);
  const enAll = applyEnMoves(enSource, spec.enMoves, label);
  const vacated = new Set(
    (spec.enMoves ?? []).map((move) => move.seg).filter((seg) => !parseEnglish(enAll[seg] ?? '')),
  );
  const groups = spec.groups ?? [];
  const groupOf = new Map();
  groups.forEach(([start, end], gi) => {
    for (let i = start; i <= end; i++) groupOf.set(i, gi);
  });

  const drafts = [];
  for (let i = from; i <= to; i++) {
    if (spec.drop?.includes(i)) continue;
    for (const insert of (spec.insert ?? []).filter((item) => item.at === i)) {
      drafts.push({
        index: i - 0.5,
        he: parseHebrew(insert.he),
        en: insert.en ?? '',
        when: mergeConditions(spec.when, insert.when),
        authored: true,
      });
    }
    let html = heAll[i].replace(/‎/g, '').normalize('NFC');
    if (editsBySeg.has(i)) html = applyEdits(html, editsBySeg.get(i), `${label} #${i}`);
    if (spec.flattenSmall) html = flattenSmall(html);
    if (spec.transform) html = spec.transform(html, i);
    const classified = classifySmall(html);
    const he = parseHebrew(classified.html);
    if (!he.length) continue;
    let enHtml = enDropped.has(i) ? '' : (enAll[i] ?? '');
    if (enEditsBySeg.has(i)) enHtml = applyEdits(enHtml, enEditsBySeg.get(i), `${label} #${i} (en)`);
    const en = spec.en ? parseEnglish(enHtml) : '';
    if (en) ctx.credits.add(spec.en);
    const when = mergeConditions(spec.when, spec.at?.[i], omerOf(i));
    for (const part of parts.filter((candidate) => i >= candidate.from && i <= candidate.to)) matchedParts.add(part);
    const enGone = enDropped.has(i) || vacated.has(i);
    const memoryEdits = memoryEditsBySeg.get(i);
    const pieces = withLabels(
      {
        index: i,
        he,
        en,
        enDropped: enGone,
        when,
        group: groupOf.get(i),
        promoted: classified.promoted,
        ...(memoryEdits ? { memoryEdits: { edits: memoryEdits, label: `${label} #${i}` } } : {}),
      },
      parts,
      label,
    );
    if (memoryEdits && (pieces.length !== 1 || groupOf.has(i)))
      throw new Error(`${label} #${i}: a memory edit needs a segment that is neither cut by a part nor grouped`);
    drafts.push(...pieces);
  }
  const unmatched = parts.filter((part) => !matchedParts.has(part));
  if (unmatched.length)
    throw new Error(`${label}: labeled parts with no text at ${unmatched.map((part) => part.from)}`);
  for (const insert of (spec.insert ?? []).filter((item) => item.at > to)) {
    drafts.push({
      index: insert.at - 0.5,
      he: parseHebrew(insert.he),
      en: insert.en ?? '',
      when: mergeConditions(spec.when, insert.when),
      authored: true,
    });
  }

  if (spec.minyan) for (const draft of drafts.filter((candidate) => !candidate.authored)) draft.minyan = spec.minyan;

  const segments = [];
  for (const draft of drafts) {
    const previous = segments[segments.length - 1];
    if (draft.group !== undefined && previous && previous.group === draft.group) {
      if (!sameCondition(previous.when, draft.when))
        throw new Error(`${label}: group mixes conditions at #${draft.index}`);
      if (previous.optional !== draft.optional || previous.minyan !== draft.minyan) {
        throw new Error(`${label}: group mixes labeled and unlabeled text at #${draft.index}`);
      }
      const merged = previous.he[previous.he.length - 1];
      merged.push({ t: ' ' }, ...draft.he.flat());
      previous.en = [previous.en, draft.en].filter(Boolean).join(' ');
      previous.enDropped ||= draft.enDropped;
      continue;
    }
    segments.push({ ...draft, he: draft.he.map((runs) => runs.map((run) => ({ ...run }))) });
  }

  for (const segment of segments) {
    segment.he = segment.he.map((runs) => tidyRuns(spec.linear ? linearPunctuation(runs) : runs));
  }

  if (spec.omer) {
    verifyOmer(segments, label);
    if (spec.omer.stride === 1) {
      for (const segment of segments) {
        const day = segment.when?.omerDay;
        if (day !== undefined && !segment.en) segment.en = new OmerEvent(new HDate(), day).getTodayIs('en');
      }
    }
  }

  const namesADay = (runs) => {
    const notes = runs
      .filter((run) => run.s === 'n' && !run.when)
      .map((run) => run.t)
      .join(' ');
    return CONDITIONAL_INSTRUCTION.some((pattern) => pattern.test(normalizeHebrew(notes))) ? notes : null;
  };
  for (const segment of segments) {
    if (segment.authored || spec.reviewed?.includes(segment.index)) continue;
    const midText = segment.he.flatMap((runs) =>
      runs.filter((run, i) => runs.slice(0, i).some((prev) => prev.s !== 'n' && prev.t.trim())),
    );
    const inline = namesADay(midText);
    if (inline) ctx.unreviewed.push(`${label} #${segment.index}: inline instruction "${inline.slice(0, 90)}"`);
    if (inline || segment.when) continue;
    const notes = namesADay(segment.he.flat());
    if (notes) ctx.unreviewed.push(`${label} #${segment.index}: instruction "${notes.slice(0, 90)}"`);
    else if (segment.promoted && !isAlwaysSaid(segment))
      ctx.unreviewed.push(`${label} #${segment.index}: small vocalized text "${plain(segment.he).slice(0, 90)}"`);
  }

  const minyanOnly = MINYAN_ONLY_TITLES.includes(spec.title.he);
  if (minyanOnly) ctx.minyanOnlyTitles.add(spec.title.he);

  return {
    title: spec.title,
    ...(spec.chapter ? { chapter: spec.chapter } : {}),
    ...(spec.optional ? { optional: spec.optional } : {}),
    ...(minyanOnly ? { minyanOnly } : {}),
    segments: segments.map(({ he, en, enDropped, memoryEdits, when, optional, minyan }) => ({
      he,
      ...(en ? { en } : {}),
      ...(enDropped ? { enDropped } : {}),
      ...(memoryEdits ? { memoryEdits } : {}),
      ...(when ? { when } : {}),
      ...(optional ? { optional } : {}),
      ...(minyan ? { minyan } : {}),
    })),
  };
}

async function buildTranslationMemory() {
  const memory = new Map();
  for (const [heKey, enKey] of Object.entries(SOURCES)
    .filter(([, s]) => s.translationMemory)
    .map(([k, s]) => [k, s.translationMemory])) {
    const heTree = await loadSource(heKey);
    const enTree = await loadSource(enKey);
    const walk = (heNode, enNode) => {
      if (Array.isArray(heNode)) {
        const heFlat = heNode.flat(Infinity);
        const enFlat = Array.isArray(enNode) ? enNode.flat(Infinity) : [];
        heFlat.forEach((he, i) => {
          const en = typeof enFlat[i] === 'string' ? parseEnglish(enFlat[i]) : '';
          const key = typeof he === 'string' ? normalizeHebrew(plain(parseHebrew(he))) : '';
          if (key && en && !memory.has(key)) memory.set(key, { en, source: enKey });
        });
        return;
      }
      if (heNode && typeof heNode === 'object') {
        for (const key of Object.keys(heNode)) walk(heNode[key], enNode?.[key]);
      }
    };
    walk(heTree, enTree);
  }
  return memory;
}

function fillTranslations(sections, memory, credits) {
  let filled = 0;
  for (const section of sections) {
    for (const segment of section.segments) {
      if (segment.en || segment.enDropped) continue;
      const hit = memory.get(normalizeHebrew(plain(segment.he)));
      if (!hit) continue;
      segment.en = hit.en;
      segment.fromMemory = true;
      credits.add(hit.source);
      filled++;
    }
  }
  return filled;
}

function applyMemoryEdits(sections) {
  for (const section of sections) {
    for (const segment of section.segments) {
      if (!segment.memoryEdits) continue;
      const { edits, label } = segment.memoryEdits;
      if (!segment.fromMemory)
        throw new Error(`${label}: memory edit on a segment the translation memory did not fill`);
      segment.en = applyEdits(segment.en, edits, `${label} (memory en)`);
    }
  }
}

const SHARED_DIR = 'shared';

function assetMapSource(built, shared) {
  const lines = ['export const SIDDUR_ASSETS = {'];
  for (const nusach of NUSCHAOT) {
    lines.push(`  ${nusach}: {`);
    for (const id of built[nusach] ?? []) {
      const folder = shared.includes(id) ? SHARED_DIR : nusach;
      lines.push(`    ${id}: require('../../assets/siddur/${folder}/${id}.siddur'),`);
    }
    lines.push('  },');
  }
  lines.push('} as const;', '');
  lines.push(`export const SHARED_SIDDUR_TEXT_IDS = [${shared.map((id) => `'${id}'`).join(', ')}] as const;`, '');
  return lines.join('\n');
}

// A text whose manifest entry is `shared` is the same in every nusach: it is built once, into the
// shared folder, and carries no nusach.
async function buildText(textId, specs, nusach, run) {
  const { memory, report, outputs, unreviewed, minyanOnlyTitles } = run;
  const credits = new Set();
  const ctx = { nusach: nusach ?? SHARED_DIR, textId, credits, unreviewed, minyanOnlyTitles };
  const parts = [];
  for (const spec of specs) parts.push(await buildSection(spec, ctx));
  const sections = mergeSameTitledSections(parts);
  const filled = HEBREW_ONLY_TEXTS.includes(textId) ? 0 : fillTranslations(sections, memory, credits);
  applyMemoryEdits(sections);
  const segments = sections.flatMap((s) => s.segments);
  for (const segment of segments) {
    delete segment.enDropped;
    delete segment.fromMemory;
    delete segment.memoryEdits;
  }
  const translated = segments.filter((s) => s.en).length;
  report.push(
    `${ctx.nusach}/${textId}: ${segments.length} segments, ${translated} translated (${filled} via exact match)`,
  );
  const text = {
    ...(nusach ? { nusach } : {}),
    id: textId,
    sections,
    credits: [...new Map([...credits].map((key) => [SOURCES[key].credit.title, SOURCES[key].credit])).values()],
  };
  outputs.set(path.join(OUT_DIR, ctx.nusach, `${textId}.siddur`), JSON.stringify(text));
}

async function main() {
  const memory = await buildTranslationMemory();
  const unreviewed = [];
  const minyanOnlyTitles = new Set();
  const built = {};
  const report = [];
  const outputs = new Map();
  const run = { memory, report, outputs, unreviewed, minyanOnlyTitles };
  const shared = Object.keys(TEXTS).filter((textId) => TEXTS[textId].shared);
  for (const nusach of NUSCHAOT) {
    built[nusach] = [];
    for (const [textId, byNusach] of Object.entries(TEXTS)) {
      if (byNusach.shared) {
        built[nusach].push(textId);
        continue;
      }
      const specs = byNusach[nusach];
      if (!specs) continue;
      await buildText(textId, specs, nusach, run);
      built[nusach].push(textId);
    }
  }
  for (const textId of shared) await buildText(textId, TEXTS[textId].shared, null, run);
  if (unreviewed.length) {
    throw new Error(`conditional instructions without a condition or review:\n${unreviewed.join('\n')}`);
  }
  const unused = RULES.filter((entry) => !entry.hits).map((entry) => entry.name);
  if (unused.length) throw new Error(`manifest rules that never matched:\n${unused.join('\n')}`);
  const missing = MINYAN_ONLY_TITLES.filter((title) => !minyanOnlyTitles.has(title));
  if (missing.length) throw new Error(`minyan-only titles that no section carries:\n${missing.join('\n')}`);
  outputs.set(ASSET_MAP, assetMapSource(built, shared));
  writeOutputs(outputs);
  console.log(report.join('\n'));
}

function writeOutputs(outputs) {
  const existing = fs.existsSync(OUT_DIR)
    ? fs
        .readdirSync(OUT_DIR, { recursive: true })
        .map((file) => path.join(OUT_DIR, String(file)))
        .filter((file) => file.endsWith('.siddur'))
    : [];
  for (const stale of existing.filter((file) => !outputs.has(file))) fs.rmSync(stale);
  for (const [file, content] of outputs) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

async function inspect(sourceKey, nodePath) {
  const segments = await segmentsOf(sourceKey, nodePath);
  segments.forEach((html, index) => {
    const classified = classifySmall(html.normalize('NFC'));
    const he = parseHebrew(classified.html);
    if (!he.length) return;
    const text = he.map((runs) => runs.map((run) => (run.s === 'n' ? `[${run.t}]` : run.t)).join('')).join(' / ');
    const said = he.flat().some((run) => run.s !== 'n');
    console.log(
      `${String(index).padStart(3)} ${classified.promoted ? 'P' : ' '}${said ? ' ' : 'N'} ${text.slice(0, Number(process.env.WIDTH ?? 160))}`,
    );
  });
}

const [mode, ...args] = process.argv.slice(2);
(mode === '--inspect' ? inspect(...args) : main()).catch((error) => {
  console.error(error.message);
  process.exit(1);
});

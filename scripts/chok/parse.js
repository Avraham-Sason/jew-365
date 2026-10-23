const { TextDecoder } = require('util');

const DAY_SLOTS = {
  'יום ראשון': 'sun',
  'יום שני': 'mon',
  'יום שלישי': 'tue',
  'יום שלשי': 'tue',
  'יום רביעי': 'wed',
  'יום חמישי': 'thu',
  'ליל שישי': 'thuNight',
  'יום שישי': 'fri',
};
const COMMENTARIES = {
  "רש''י": { he: 'רש״י', en: 'Rashi' },
  ברטנורה: { he: 'ברטנורה', en: 'Bartenura' },
  'תרגום הזוהר': { he: 'תרגום הזוהר', en: 'Zohar translation' },
};
const KINDS = [
  ['נביאים', 'neviim'],
  ['כתובים', 'ketuvim'],
  ['משנה', 'mishnah'],
  ['גמרא', 'gemara'],
  ['זוהר', 'zohar'],
  ['הלכה פסוקה', 'halacha'],
  ['מוסר', 'mussar'],
  ['הפטרת', 'haftarah'],
];
const VERSE_KINDS = ['torah', 'neviim', 'ketuvim', 'haftarah'];
const VERSE_CODES = ['It', 'In', 'Ik', 'Ih'];
const STYLED = ['span', 'small', 'b', 'strong', 'big', 'font'];
const GEMATRIA = /^ק?(?:טו|טז|[יכלמנסעפצ]?[א-ט]?)$/;
const LETTER = /[א-ת]/;

function decodeSource(bytes) {
  return new TextDecoder('windows-1255').decode(bytes).normalize('NFC');
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

function normalizeText(text) {
  return text.replace(/''/g, '״').replace(/(?<=[א-ת][\u0591-\u05C7]*)"(?=[א-ת])/g, '״');
}

function tokenize(html) {
  const tokens = [];
  const re = /<!--([\s\S]*?)-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[1] !== undefined) {
      const body = m[1].trim();
      const code = /^(It|Io|Ir|In|Ip|Ik|IP|Ih)=\d+,c=(\d+),p=(\d+)$/.exec(body);
      if (code) tokens.push({ k: 'code', code: code[1], c: Number(code[2]), p: Number(code[3]) });
      else if (body === 'ep') tokens.push({ k: 'ep' });
    } else if (m[3] !== undefined) {
      tokens.push({ k: m[2] ? 'close' : 'open', tag: m[3].toLowerCase(), attrs: m[4] });
    } else if (m[5] !== undefined) {
      tokens.push({ k: 'text', v: decodeEntities(m[5]) });
    }
  }
  return tokens;
}

const attr = (token, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(token.attrs);
  return m?.[1] ?? m?.[2];
};
const isTag = (t, kind, tag) => t.k === kind && t.tag === tag;
const isVerseCode = (t) => t.k === 'code' && VERSE_CODES.includes(t.code);
const blank = (t) => t.k === 'text' && !t.v.trim();

function styleWalker() {
  const stack = [];
  return {
    step(t) {
      if (t.k === 'open' && STYLED.includes(t.tag)) {
        stack.push({ tag: t.tag, note: /background-color/i.test(attr(t, 'style') ?? '') });
        return true;
      }
      if (t.k === 'close' && STYLED.includes(t.tag)) {
        const at = stack.map((e) => e.tag).lastIndexOf(t.tag);
        if (at >= 0) stack.length = at;
        return true;
      }
      return false;
    },
    note: () => stack.some((e) => e.tag === 'small' || e.note),
    bold: () => stack.some((e) => e.tag === 'b' || e.tag === 'strong'),
    big: () => stack.some((e) => e.tag === 'big'),
  };
}

function collapseSpaces(runs) {
  const out = [];
  for (const run of runs) {
    const previous = out[out.length - 1];
    let t = run.t.replace(/\s+/g, ' ');
    if (previous && previous.t.endsWith(' ')) t = t.replace(/^ /, '');
    if (t) out.push({ ...run, t });
  }
  return out;
}

function tidy(runs) {
  const merged = [];
  for (const run of runs) {
    const t = normalizeText(run.t.replace(/\s+/g, ' '));
    const last = merged[merged.length - 1];
    if (last && (last.s === run.s || !t.trim())) last.t += t;
    else merged.push({ ...run, t });
  }
  const out = [];
  for (const run of merged) {
    const previous = out[out.length - 1];
    const t = !previous || /\s$/.test(previous.t) ? run.t.replace(/^\s+/, '') : run.t;
    if (t) out.push({ ...run, t });
  }
  while (out.length && !out[out.length - 1].t.trim()) out.pop();
  if (out.length) out[out.length - 1].t = out[out.length - 1].t.trimEnd();
  return out.some((r) => LETTER.test(r.t)) ? collapseSpaces(out) : [];
}

function paragraphsOf(tokens, base) {
  const paragraphs = [[]];
  const walker = styleWalker();
  for (const t of tokens) {
    if (walker.step(t)) continue;
    if ((t.k === 'open' || t.k === 'close') && (t.tag === 'br' || t.tag === 'p')) {
      paragraphs.push([]);
      continue;
    }
    if (t.k !== 'text') continue;
    const style = walker.note() ? 'n' : walker.bold() ? 'b' : base;
    const runs = paragraphs[paragraphs.length - 1];
    const last = runs[runs.length - 1];
    if (last && last.s === style) last.t += t.v;
    else runs.push(style ? { t: t.v, s: style } : { t: t.v });
  }
  return paragraphs.map(tidy).filter((p) => p.length);
}

const hasText = (paragraphs) => paragraphs.some((p) => p.some((r) => LETTER.test(r.t)));
const plainOf = (paragraphs) =>
  paragraphs
    .flat()
    .map((r) => r.t)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

function isNumberMarker(text, note, big) {
  const v = text.trim();
  const inParens = /^\(\s*([א-ת]{1,3})\s*\)$/.exec(v);
  if (note && inParens && GEMATRIA.test(inParens[1])) return true;
  return Boolean(big && v && GEMATRIA.test(v));
}

function withoutMarkers(tokens) {
  const walker = styleWalker();
  return tokens.filter((t) => walker.step(t) || !(t.k === 'text' && isNumberMarker(t.v, walker.note(), walker.big())));
}

function gematria(n) {
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const hundreds = n >= 100 ? 'ק' : '';
  const rest = n % 100;
  if (rest === 15) return `${hundreds}טו`;
  if (rest === 16) return `${hundreds}טז`;
  return hundreds + tens[Math.floor(rest / 10)] + ones[rest % 10];
}

function mergeRuns(runs) {
  const out = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && last.s === run.s) last.t += run.t;
    else out.push({ ...run });
  }
  return out;
}

function badgeAt(tokens, i) {
  if (!(isTag(tokens[i], 'open', 'span') && /background-color/i.test(attr(tokens[i], 'style') ?? ''))) return null;
  let j = i + 1;
  while (tokens[j] && blank(tokens[j])) j++;
  if (!(tokens[j] && isTag(tokens[j], 'open', 'small'))) return null;
  let text = '';
  let k = j + 1;
  for (; tokens[k] && !isTag(tokens[k], 'close', 'small'); k++) if (tokens[k].k === 'text') text += tokens[k].v;
  let m = k + 1;
  while (tokens[m] && blank(tokens[m])) m++;
  const label = COMMENTARIES[text.replace(/\s+/g, ' ').trim()];
  return label && tokens[m] && isTag(tokens[m], 'close', 'span') ? { label, end: m } : null;
}

function spanCloseFrom(tokens, from) {
  let depth = 0;
  for (let n = from; n < tokens.length; n++) {
    if (isTag(tokens[n], 'open', 'span')) depth++;
    if (isTag(tokens[n], 'close', 'span')) {
      if (depth === 0) return n;
      depth--;
    }
  }
  return -1;
}

function codeLeftOpen(body) {
  let open = false;
  for (const t of body) {
    if (t.k === 'code') open = true;
    if (t.k === 'ep') open = false;
  }
  return open;
}

function extractCommentaries(tokens, where) {
  const out = [];
  const spans = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const badge = badgeAt(tokens, i);
    if (badge) {
      if (!spans.length) throw new Error(`${where}: commentary badge outside a span`);
      const containerStyle = attr(spans[spans.length - 1], 'style');
      let end = spanCloseFrom(tokens, badge.end + 1);
      if (end < 0) throw new Error(`${where}: commentary never closes`);
      let body = tokens.slice(badge.end + 1, end);
      while (codeLeftOpen(body)) {
        let q = end + 1;
        while (
          tokens[q] &&
          (blank(tokens[q]) || (['open', 'close'].includes(tokens[q].k) && ['b', 'strong'].includes(tokens[q].tag)))
        )
          q++;
        if (!(tokens[q] && isTag(tokens[q], 'open', 'span') && attr(tokens[q], 'style') === containerStyle)) break;
        const close = spanCloseFrom(tokens, q + 1);
        if (close < 0) throw new Error(`${where}: commentary never closes`);
        body = body.concat(tokens.slice(q + 1, close));
        end = close;
      }
      spans.pop();
      const he = paragraphsOf(body.filter((u) => u.k !== 'code' && u.k !== 'ep'));
      if (!hasText(he)) throw new Error(`${where}: empty ${badge.label.en}`);
      out.push({ k: 'comment', label: badge.label, he });
      i = end;
      continue;
    }
    if (isTag(t, 'open', 'span')) spans.push(t);
    if (isTag(t, 'close', 'span')) spans.pop();
    out.push(t);
  }
  return out;
}

function dropEmptyClosings(tokens) {
  let textSince = false;
  return tokens.filter((t) => {
    if (t.k === 'text' && LETTER.test(t.v)) textSince = true;
    if (t.k === 'code' || t.k === 'comment') textSince = false;
    if (t.k !== 'ep') return true;
    const keep = textSince;
    textSince = false;
    return keep;
  });
}

function repairOpenings(tokens, where) {
  const out = [...tokens];
  const opened = new Set(out.filter(isVerseCode).map((t) => `${t.c}:${t.p}`));
  for (const io of out.filter((t) => t.k === 'code' && t.code === 'Io')) {
    if (opened.has(`${io.c}:${io.p}`)) continue;
    let ep = out.indexOf(io) - 1;
    while (ep >= 0 && out[ep].k !== 'ep') ep--;
    let marker = ep - 1;
    while (marker >= 0 && !(out[marker].k === 'text' && out[marker].v.trim() === `(${gematria(io.p)})`)) marker--;
    if (ep < 0 || marker < 0) throw new Error(`${where} ${io.c}:${io.p}: no opening code and no verse marker`);
    out.splice(marker + 1, 0, { k: 'code', code: 'It', c: io.c, p: io.p });
    opened.add(`${io.c}:${io.p}`);
  }
  return out;
}

function hasPlainText(tokens, from, to) {
  const walker = styleWalker();
  for (let n = from; n < to; n++) {
    if (walker.step(tokens[n])) continue;
    if (tokens[n].k === 'text' && LETTER.test(tokens[n].v) && !walker.note()) return true;
  }
  return false;
}

function repairClosings(tokens) {
  const out = [...tokens];
  let verse = null;
  for (let i = 0; i < out.length; i++) {
    if (isVerseCode(out[i])) verse = out[i];
    if (out[i].k !== 'code' || !(VERSE_CODES.includes(out[i].code) || out[i].code === 'Io')) continue;
    if (out[i].code === 'Io' && !(verse && verse.c === out[i].c && verse.p === out[i].p)) continue;
    let j = i + 1;
    while (j < out.length && out[j].k !== 'ep' && out[j].k !== 'code' && out[j].k !== 'comment') j++;
    if (out[j]?.k === 'ep') continue;
    const close = spanCloseFrom(out, i + 1);
    if (close < 0 || close > j || !hasPlainText(out, i + 1, close)) continue;
    out.splice(close, 0, { k: 'ep' });
  }
  return out;
}

function verseSection(raw, kind, where) {
  const kept = dropEmptyClosings(raw);
  const tokens = repairClosings(kind === 'torah' ? repairOpenings(kept, where) : kept);
  const units = [];
  const preamble = [];
  const seen = new Set();
  let unit = null;
  for (const t of tokens) {
    if (isVerseCode(t) && !seen.has(`${t.c}:${t.p}`)) {
      seen.add(`${t.c}:${t.p}`);
      unit = { c: t.c, p: t.p, tokens: [] };
      units.push(unit);
    }
    (unit ? unit.tokens : preamble).push(t);
  }
  if (preamble.some((t) => t.k === 'comment' || t.k === 'ep'))
    throw new Error(`${where}: an item before the first verse`);
  const segments = [];
  const lead = paragraphsOf(withoutMarkers(preamble), 'n');
  if (hasText(lead)) segments.push({ he: lead });
  let chapter = null;
  for (const { c, p, tokens: ts } of units) {
    const w = `${where} ${c}:${p}`;
    const ep1 = ts.findIndex((t) => t.k === 'ep');
    if (ep1 < 0) throw new Error(`${w}: verse never closes`);
    let open = -1;
    ts.forEach((t, n) => {
      if (n < ep1 && isVerseCode(t) && t.c === c && t.p === p) open = n;
    });
    if (ts.slice(0, ep1).some((t) => t.k === 'comment')) throw new Error(`${w}: commentary before the verse`);
    const before = plainOf(paragraphsOf(withoutMarkers(ts.slice(0, open))));
    const verse = paragraphsOf(ts.slice(open + 1, ep1));
    if (verse.length !== 1) throw new Error(`${w}: verse has ${verse.length} paragraphs`);
    const rest = ts.slice(ep1 + 1);
    const firstComment = rest.findIndex((t) => t.k === 'comment');
    const ep2 = rest.findIndex((t) => t.k === 'ep');
    let targumTokens = [];
    let after = rest;
    if (kind === 'torah' && ep2 >= 0 && (firstComment < 0 || ep2 < firstComment)) {
      targumTokens = rest.slice(0, ep2);
      after = rest.slice(ep2 + 1);
    } else if (kind !== 'haftarah') {
      const end = firstComment < 0 ? rest.length : firstComment;
      targumTokens = rest.slice(0, end);
      after = rest.slice(end);
    }
    if ([...targumTokens, ...after].some((t) => t.k === 'ep'))
      throw new Error(`${w}: an item without its opening code`);
    const targum = paragraphsOf(withoutMarkers(targumTokens), 't');
    const needsTargum = kind !== 'haftarah';
    if (needsTargum !== hasText(targum) || targum.length > 1)
      throw new Error(`${w}: targum has ${targum.length} paragraphs`);
    if (targum.length && /^[\u0591-\u05C7]/.test(targum[0][0].t)) {
      const dangling = segments.findLastIndex((g) => g.letter);
      if (dangling < 0 || segments.slice(dangling + 1).some((g) => g.verse))
        throw new Error(`${w}: targum starts with a mark`);
      targum[0][0] = { ...targum[0][0], t: segments[dangling].letter + targum[0][0].t };
      segments.splice(dangling, 1);
    }
    const label = p === 1 && c !== chapter ? `${gematria(c)} (${gematria(p)}) ` : `(${gematria(p)}) `;
    chapter = c;
    const first = collapseSpaces(
      mergeRuns([{ t: label, s: 'n' }, ...(before ? [{ t: `${before} `, s: 'n' }] : []), ...verse[0]]),
    );
    segments.push({ he: targum.length ? [first, targum[0]] : [first], verse: [c, p] });
    let notes = [];
    const flush = () => {
      const he = paragraphsOf(withoutMarkers(notes));
      if (/^[א-ת]$/.test(plainOf(he))) segments.push({ letter: plainOf(he) });
      else if (hasText(he)) segments.push({ he });
      notes = [];
    };
    for (const t of after) {
      if (t.k === 'comment') {
        flush();
        segments.push({ he: t.he, optional: t.label });
      } else notes.push(t);
    }
    flush();
  }
  if (segments.some((g) => g.letter)) throw new Error(`${where}: a stray letter no targum claims`);
  return segments;
}

function proseSection(tokens) {
  const segments = [];
  let chunk = [];
  const flush = () => {
    const he = paragraphsOf(chunk.filter((t) => t.k !== 'code' && t.k !== 'ep'));
    if (hasText(he)) segments.push({ he });
    chunk = [];
  };
  for (const t of tokens) {
    if (t.k === 'comment') {
      flush();
      segments.push({ he: t.he, optional: t.label });
    } else chunk.push(t);
  }
  flush();
  return segments;
}

const DAY_HEADING = /(יום ראשון|יום שני|יום שלישי|יום שלשי|יום רביעי|יום חמישי|ליל שישי|יום שישי)/;

function parseHeader(line) {
  const header = {};
  for (const part of line.replace(/^&/, '').split(/&(?=[A-Za-z]+=)/)) {
    const at = part.indexOf('=');
    header[part.slice(0, at)] = part.slice(at + 1);
  }
  return header;
}

function macroRules(cosmetics) {
  const rules = [];
  for (const part of cosmetics.split('#')) {
    if (!/^rep\d*=/.test(part)) continue;
    for (const pair of part.slice(part.indexOf('=') + 1).split('^^')) {
      const at = pair.indexOf('=');
      if (at < 1) throw new Error(`bad macro "${pair}"`);
      rules.push([pair.slice(0, at), pair.slice(at + 1)]);
    }
  }
  return rules;
}

function sourceRules(texts) {
  const headers = texts.map((text) => parseHeader(text.split(/\r?\n/)[0]));
  const cosmeticsOf = (header) => {
    const value = header.CosmeticsType ?? '';
    if (!value.startsWith('=')) return value;
    const id = value.slice(1);
    const target = headers.find((h) => h.UniqueId === id);
    if (!target) throw new Error(`cosmetics reference ${id} not found`);
    return cosmeticsOf(target);
  };
  return headers.map((header) => macroRules(cosmeticsOf(header)));
}

const badgeMacros = (rules) => rules.filter(([, to]) => to.includes('background-color')).map(([from]) => from);

function expandLine(line, rules) {
  let s = line;
  for (const [from, to] of rules) s = s.split(from).join(to);
  return s
    .replace(/<QM>/g, '?')
    .replace(/_nbsp;?/g, '&nbsp;')
    .replace(/&nbsp(?!;)/g, '&nbsp;');
}

function buildSlots(where, rawSlots) {
  const slots = {};
  for (const [slot, raw] of Object.entries(rawSlots)) {
    slots[slot] = raw
      .map((s) => ({ ...s, tokens: tokenize(s.lines.join('')) }))
      .filter((s) => !(s.kind === 'torah' && !s.tokens.some((t) => t.k === 'code')))
      .map((s) => {
        const w = `${where} ${slot} ${s.heading}`;
        const body = extractCommentaries(s.tokens, w);
        const segments = VERSE_KINDS.includes(s.kind) ? verseSection(body, s.kind, w) : proseSection(body);
        if (!segments.length) throw new Error(`${w}: empty section`);
        const variant = s.heading.includes('כמנהג הספרדים')
          ? 'sephardi'
          : s.heading.includes('כמנהג האשכנזים')
            ? 'ashkenazi'
            : null;
        return { kind: s.kind, heading: s.heading, ...(variant ? { variant } : {}), segments };
      });
  }
  return slots;
}

function parseBook(text, rules, where) {
  const macros = badgeMacros(rules);
  const book = [];
  let skipping = true;
  let current = null;
  let slot = null;
  const finish = () => {
    if (!current) return;
    book.push({
      heading: current.heading,
      slots: buildSlots(`${where} ${current.heading}`, current.raw),
      badges: current.badges,
    });
    current = null;
  };
  text.split(/\r?\n/).forEach((line, i) => {
    if (i === 0) return;
    const n = i + 1;
    if (line.includes('<TF>')) throw new Error(`${where} line ${n}: the te'amim encoding <TF> has no decoder`);
    if (line.startsWith('# ')) {
      finish();
      slot = null;
      const name = /^# פרשת (.+)$/.exec(line)?.[1];
      if (name) {
        skipping = false;
        current = { heading: name.trim(), raw: {}, badges: 0 };
      } else if (line.trim() === '# הקדמות') skipping = true;
      else throw new Error(`${where} line ${n}: unknown book heading "${line}"`);
      return;
    }
    if (skipping || line.startsWith('$ ') || line.startsWith('**')) return;
    current.badges += macros.reduce((sum, m) => sum + line.split(m).length - 1, 0);
    const at = `${where} ${current.heading}`;
    if (line.startsWith('@ ')) {
      const day = DAY_HEADING.exec(line)?.[1];
      if (!day) throw new Error(`${at}: unknown day heading "${line}"`);
      slot = DAY_SLOTS[day];
      if (current.raw[slot]) throw new Error(`${at} ${slot}: day appears twice`);
      current.raw[slot] = [{ kind: 'torah', heading: 'תורה', lines: [] }];
      return;
    }
    if (!slot) {
      if (line.trim()) throw new Error(`${where} line ${n}: text before the first day of ${current.heading}`);
      return;
    }
    const sections = current.raw[slot];
    if (line.startsWith('~ ')) {
      const heading = normalizeText(line.slice(2).replace(/\s+/g, ' ').trim());
      const kind = KINDS.find(([prefix]) => heading.startsWith(prefix))?.[1];
      if (!kind) throw new Error(`${at} ${slot}: unknown heading "${heading}"`);
      sections.push({ kind, heading, lines: [] });
      return;
    }
    sections[sections.length - 1].lines.push(`${expandLine(line, rules)}${line.trim() ? '<br>\n' : '\n'}`);
  });
  finish();
  return book;
}

module.exports = {
  decodeSource,
  parseHeader,
  macroRules,
  sourceRules,
  badgeMacros,
  expandLine,
  parseBook,
  gematria,
};

// Development tool for the siddur build, skipped unless SIDDUR_DUMP is set. It prints texts as the
// reader resolves them on chosen days, so a manifest change can be checked against the source.
//   SIDDUR_DUMP=1 DUMP_TEXTS=birkat_hamazon DUMP_NUSACH=sefard DUMP_DAYS="1 Cheshvan 5787,2026-10-08" \
//     DUMP_OUT=/tmp/dump.txt pnpm test -- src/data/__tests__/siddurDump.test.ts
// DUMP_DAYS takes Hebrew dates ("<day> <month name> <year>") or civil dates (YYYY-MM-DD, its daytime
// Hebrew day). DUMP_PLACE is israel (default), jerusalem or diaspora. DUMP_WIDTH cuts each line.
jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HDate } from '@hebcal/core';
import { Nusach } from '@/types/mitzvah';
import { Place, SiddurTextId } from '@/types/siddur';
import { readSiddurText } from '@/testing/siddur';
import { dayFeatures, resolveSiddurText } from '@/utils/siddur';

const PLACES: Record<string, Place> = {
  israel: { inIsrael: true, jerusalem: false },
  jerusalem: { inIsrael: true, jerusalem: true },
  diaspora: { inIsrael: false, jerusalem: false },
};

function parseDay(spec: string): HDate {
  const civil = /^(\d{4})-(\d{2})-(\d{2})$/.exec(spec);
  if (civil) return new HDate(new Date(Number(civil[1]), Number(civil[2]) - 1, Number(civil[3])));
  const [day, ...rest] = spec.trim().split(/\s+/);
  const year = Number(rest.pop());
  return new HDate(Number(day), rest.join(' '), year);
}

const run = process.env.SIDDUR_DUMP ? it : it.skip;

run('dumps resolved siddur texts', () => {
  const texts = (process.env.DUMP_TEXTS ?? '').split(',').filter(Boolean) as SiddurTextId[];
  const nuschaot = (process.env.DUMP_NUSACH ?? 'ashkenaz,sefard,edot_hamizrach,chabad').split(',') as Nusach[];
  const days = (process.env.DUMP_DAYS ?? '').split(',').filter(Boolean);
  const place = PLACES[process.env.DUMP_PLACE ?? 'israel'];
  const width = Number(process.env.DUMP_WIDTH ?? 140);
  const out: string[] = [];
  for (const nusach of nuschaot) {
    for (const id of texts) {
      const text = readSiddurText(nusach, id);
      for (const daySpec of days) {
        const hd = parseDay(daySpec);
        const features = dayFeatures(hd, place);
        out.push(`\n===== ${nusach} / ${id} / ${daySpec} = ${hd.render('en')} (${process.env.DUMP_PLACE ?? 'israel'})`);
        out.push(`flags: ${[...features.flags].join(' ')}${features.omerDay ? ` omer:${features.omerDay}` : ''}`);
        for (const section of resolveSiddurText(text, features)) {
          out.push(`--- [${section.title.he}]${section.optional ? ` {folded section: ${section.optional.he}}` : ''}`);
          section.segments.forEach((segment, i) => {
            const labels = [
              segment.optional ? `fold:${segment.optional.he}` : '',
              segment.minyan ? `by:${segment.minyan.he}` : '',
            ]
              .filter(Boolean)
              .join(' ');
            const said = segment.he
              .map((runs) => runs.map((r) => (r.s === 'n' ? `[${r.t}]` : r.t)).join(''))
              .join(' / ');
            out.push(
              `${String(i).padStart(3)} ${labels ? `(${labels}) ` : ''}${said.slice(0, width)}${segment.en ? ` || EN: ${segment.en.slice(0, 60)}` : ''}`,
            );
          });
        }
      }
    }
  }
  const file = process.env.DUMP_OUT ?? path.join(os.tmpdir(), `siddur-dump-${process.pid}.txt`);
  fs.writeFileSync(file, out.join('\n'));
  console.log(`siddur dump written to ${file}`);
});

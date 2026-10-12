import * as fs from 'fs';
import * as path from 'path';
import { SHARED_SIDDUR_TEXT_IDS } from '@/data/siddurAssets.generated';
import { Nusach } from '@/types/mitzvah';
import { SiddurText, SiddurTextId } from '@/types/siddur';

const ASSET_DIR = path.join(__dirname, '..', '..', 'assets', 'siddur');

export function siddurAssetFolder(nusach: Nusach, id: SiddurTextId): string {
  return (SHARED_SIDDUR_TEXT_IDS as readonly string[]).includes(id) ? 'shared' : nusach;
}

export function readSiddurText(nusach: Nusach, id: SiddurTextId): SiddurText {
  return JSON.parse(fs.readFileSync(path.join(ASSET_DIR, siddurAssetFolder(nusach, id), `${id}.siddur`), 'utf8'));
}

import { CHOK_ASSETS } from './chokAssets.generated';

export const CHOK_TEXT_ID = 'chok_leyisrael';

export function chokAsset(parasha: string): number | undefined {
  return CHOK_ASSETS[parasha];
}

export function hasChokContent(): boolean {
  return Object.keys(CHOK_ASSETS).length > 0;
}

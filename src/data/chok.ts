import { parshiot } from '@hebcal/core';
import { useChokStore } from '@/stores/useChokStore';

export const CHOK_TEXT_ID = 'chok_leyisrael';

export const CHOK_PARASHIYOT: readonly string[] = [...parshiot, 'Vezot Haberakhah'];

export function chokAsset(parasha: string): string | undefined {
  return useChokStore.getState().installed?.files[parasha];
}

export function hasChokContent(): boolean {
  return useChokStore.getState().installed !== null;
}

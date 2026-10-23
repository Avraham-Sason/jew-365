import { parshiot } from '@hebcal/core';
import { CHOK_PARASHIYOT, CHOK_TEXT_ID, chokAsset, hasChokContent } from '../chok';
import { useChokStore } from '@/stores/useChokStore';

afterEach(() => {
  useChokStore.getState().reset();
});

describe('chok asset registry', () => {
  it('has no content while nothing is installed', () => {
    useChokStore.getState().reset();
    expect(hasChokContent()).toBe(false);
    expect(chokAsset('Noach')).toBeUndefined();
  });

  it('finds the parashiyot the installed add-on lists, and only those', () => {
    useChokStore.setState({
      installed: {
        version: 3,
        bytes: 10,
        installedAt: 1,
        files: { Noach: 'noach.0000000a.json', 'Vezot Haberakhah': 'vezot-haberakhah.0000000b.json' },
      },
    });
    expect(hasChokContent()).toBe(true);
    expect(chokAsset('Noach')).toBe('noach.0000000a.json');
    expect(chokAsset('Vezot Haberakhah')).toBe('vezot-haberakhah.0000000b.json');
    expect(chokAsset('Bo')).toBeUndefined();
  });

  it('names the reader text chok_leyisrael', () => {
    expect(CHOK_TEXT_ID).toBe('chok_leyisrael');
  });

  it('lists the 54 parashiyot of the weekly cycle', () => {
    expect(CHOK_PARASHIYOT).toEqual([...parshiot, 'Vezot Haberakhah']);
    expect(CHOK_PARASHIYOT).toHaveLength(54);
  });
});

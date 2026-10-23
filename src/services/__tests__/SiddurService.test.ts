const mockFromModule = jest.fn();
const mockText = jest.fn();

jest.mock('expo-asset', () => ({ Asset: { fromModule: (id: number) => mockFromModule(id) } }));
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation(() => ({ text: () => mockText() })) }));
jest.mock('@/services/chokFiles', () => ({
  chokParashaFile: (_install: unknown, parasha: string) => (parasha === 'Noach' ? { text: () => mockText() } : null),
}));

import { clearChokCache, loadChokParasha } from '../SiddurService';
import { installChokFixture } from '@/testing/chok';
import type { ChokAsset } from '@/types/chok';
import { useChokStore } from '@/stores/useChokStore';

const ASSET: ChokAsset = {
  parasha: 'Noach',
  credit: { title: 'מקור', license: 'רישיון', url: 'https://example.org' },
  dedication: null,
  slots: { sun: [{ kind: 'mussar', heading: 'מוסר', segments: [{ he: [[{ t: 'טֶקְסְט' }]] }] }] },
};

beforeEach(() => {
  mockFromModule.mockReset();
  mockText.mockReset();
  mockText.mockResolvedValue(JSON.stringify(ASSET));
  clearChokCache();
  installChokFixture(['Noach'], 2);
});

afterEach(() => {
  useChokStore.getState().reset();
});

describe('loadChokParasha', () => {
  it('reads and parses the file the installed add-on holds', async () => {
    await expect(loadChokParasha('Noach')).resolves.toEqual(ASSET);
    expect(mockFromModule).not.toHaveBeenCalled();
  });

  it('reads a parasha once and serves the cached promise afterwards', async () => {
    const first = loadChokParasha('Noach');
    expect(loadChokParasha('Noach')).toBe(first);
    await first;
    expect(mockText).toHaveBeenCalledTimes(1);
  });

  it('reads again after a newer version is installed', async () => {
    await loadChokParasha('Noach');
    installChokFixture(['Noach'], 3);
    await loadChokParasha('Noach');
    expect(mockText).toHaveBeenCalledTimes(2);
  });

  it('rejects when nothing is installed, and for a parasha the install lacks', async () => {
    await expect(loadChokParasha('Bo')).rejects.toThrow('no chok text Bo');
    useChokStore.getState().reset();
    await expect(loadChokParasha('Noach')).rejects.toThrow('no chok text Noach');
    expect(mockText).not.toHaveBeenCalled();
  });

  it('forgets a failed read, so the next open reads again', async () => {
    mockText.mockRejectedValueOnce(new Error('disk'));
    await expect(loadChokParasha('Noach')).rejects.toThrow('disk');
    await expect(loadChokParasha('Noach')).resolves.toEqual(ASSET);
    expect(mockText).toHaveBeenCalledTimes(2);
  });

  it('reads again after clearChokCache()', async () => {
    await loadChokParasha('Noach');
    clearChokCache();
    await loadChokParasha('Noach');
    expect(mockText).toHaveBeenCalledTimes(2);
  });
});

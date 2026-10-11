const mockFromModule = jest.fn();
const mockText = jest.fn();

jest.mock('expo-asset', () => ({ Asset: { fromModule: (id: number) => mockFromModule(id) } }));
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation(() => ({ text: () => mockText() })) }));
jest.mock('@/data/chok', () => ({
  CHOK_TEXT_ID: 'chok_leyisrael',
  chokAsset: (parasha: string) => (parasha === 'Noach' ? 7 : undefined),
  hasChokContent: () => false,
}));

import type { ChokAsset } from '@/types/chok';

const ASSET: ChokAsset = {
  parasha: 'Noach',
  credit: { title: 'מקור', license: 'רישיון', url: 'https://example.org' },
  dedication: null,
  slots: { sun: [{ kind: 'mussar', heading: 'מוסר', segments: [{ he: [[{ t: 'טֶקְסְט' }]] }] }] },
};

function freshService(): typeof import('../SiddurService') {
  let service!: typeof import('../SiddurService');
  jest.isolateModules(() => {
    service = require('../SiddurService');
  });
  return service;
}

beforeEach(() => {
  mockFromModule.mockReset();
  mockText.mockReset();
  mockFromModule.mockImplementation(() => ({
    downloadAsync: jest.fn(async () => undefined),
    localUri: 'file:///noach.chok',
    uri: 'file:///noach.chok',
  }));
  mockText.mockResolvedValue(JSON.stringify(ASSET));
});

describe('loadChokParasha', () => {
  it('reads and parses the asset the registry names', async () => {
    const { loadChokParasha } = freshService();
    await expect(loadChokParasha('Noach')).resolves.toEqual(ASSET);
    expect(mockFromModule).toHaveBeenCalledWith(7);
  });

  it('reads a parasha once and serves the cached promise afterwards', async () => {
    const { loadChokParasha } = freshService();
    const first = loadChokParasha('Noach');
    expect(loadChokParasha('Noach')).toBe(first);
    await first;
    expect(mockFromModule).toHaveBeenCalledTimes(1);
    expect(mockText).toHaveBeenCalledTimes(1);
  });

  it('rejects a parasha without an asset and reads nothing', async () => {
    const { loadChokParasha } = freshService();
    await expect(loadChokParasha('Bo')).rejects.toThrow('no chok text Bo');
    expect(mockFromModule).not.toHaveBeenCalled();
  });

  it('forgets a failed read, so the next open reads again', async () => {
    const { loadChokParasha } = freshService();
    mockText.mockRejectedValueOnce(new Error('disk'));
    await expect(loadChokParasha('Noach')).rejects.toThrow('disk');
    await expect(loadChokParasha('Noach')).resolves.toEqual(ASSET);
    expect(mockText).toHaveBeenCalledTimes(2);
  });
});

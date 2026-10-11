function registryWith(assets: Partial<Record<string, number>>): typeof import('../chok') {
  let registry!: typeof import('../chok');
  jest.isolateModules(() => {
    jest.doMock('../chokAssets.generated', () => ({ CHOK_ASSETS: assets }));
    registry = require('../chok');
  });
  return registry;
}

describe('chok asset registry', () => {
  it('has no content while the generated map is empty', () => {
    const registry = registryWith({});
    expect(registry.hasChokContent()).toBe(false);
    expect(registry.chokAsset('Noach')).toBeUndefined();
  });

  it('finds the parashiyot the generated map lists, and only those', () => {
    const registry = registryWith({ Noach: 7, 'Vezot Haberakhah': 9 });
    expect(registry.hasChokContent()).toBe(true);
    expect(registry.chokAsset('Noach')).toBe(7);
    expect(registry.chokAsset('Vezot Haberakhah')).toBe(9);
    expect(registry.chokAsset('Bo')).toBeUndefined();
  });

  it('names the reader text chok_leyisrael', () => {
    expect(registryWith({}).CHOK_TEXT_ID).toBe('chok_leyisrael');
  });
});

const appConfig = require('../../app.json');
const { BACKED_UP, fullBackupContentXml, dataExtractionRulesXml } = require('../withAndroidBackupRules');

const includeLines = (xml) => xml.match(/<include [^>]+>/g) ?? [];

describe('Android backup rules', () => {
  it('backs up only the main MMKV file, its checksum and the RTL preference', () => {
    expect(BACKED_UP).toEqual([
      { domain: 'file', path: 'mmkv/jew-in-time' },
      { domain: 'file', path: 'mmkv/jew-in-time.crc' },
      { domain: 'sharedpref', path: 'com.facebook.react.modules.i18nmanager.I18nUtil.xml' },
    ]);
  });

  it('writes the same includes for Android 11 and below, cloud backup and device transfer', () => {
    const legacy = includeLines(fullBackupContentXml());
    const modern = dataExtractionRulesXml();
    expect(legacy).toHaveLength(BACKED_UP.length);
    expect(modern).toContain('<cloud-backup>');
    expect(modern).toContain('<device-transfer>');
    expect(includeLines(modern)).toEqual([...legacy, ...legacy]);
  });

  it('never names the taharah files, the secure store or an exclude that could widen the set', () => {
    for (const xml of [fullBackupContentXml(), dataExtractionRulesXml()]) {
      expect(xml).not.toMatch(/taharah|SecureStore|expo\.modules\.notifications|<exclude/);
    }
  });

  it('turns Android backup on and registers the rules plugin', () => {
    expect(appConfig.expo.android.allowBackup).toBe(true);
    expect(appConfig.expo.plugins).toContain('./scripts/withAndroidBackupRules');
  });

  // expo-secure-store writes its own rule files by default; two plugins setting the same manifest
  // attributes end with whichever runs last.
  it('keeps expo-secure-store from writing backup rules of its own', () => {
    const secureStore = appConfig.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-secure-store',
    );
    expect(secureStore?.[1]).toEqual({ configureAndroidBackup: false });
    expect(appConfig.expo.plugins).not.toContain('expo-secure-store');
  });
});

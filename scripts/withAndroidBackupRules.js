const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Android Auto Backup and device-to-device transfer carry only what is listed here: an <include>
// turns every other file off. That keeps out the taharah MMKV files (their key never leaves the
// device), expo-notifications' saved reminders (alarms the new phone never scheduled), expo-updates'
// bundles (built for another binary) and the secure store (Keystore-encrypted, unreadable elsewhere).
// The i18n preferences ride along so a restored Hebrew install starts right-to-left.
const BACKED_UP = [
  { domain: 'file', path: 'mmkv/jew-in-time' },
  { domain: 'file', path: 'mmkv/jew-in-time.crc' },
  { domain: 'sharedpref', path: 'com.facebook.react.modules.i18nmanager.I18nUtil.xml' },
];

const FULL_BACKUP_CONTENT = 'jew_in_time_backup_rules';
const DATA_EXTRACTION_RULES = 'jew_in_time_data_extraction_rules';

const includes = (indent) =>
  BACKED_UP.map(({ domain, path: file }) => `${indent}<include domain="${domain}" path="${file}" />`).join('\n');

const XML_HEADER = '<?xml version="1.0" encoding="utf-8"?>';

function fullBackupContentXml() {
  return `${XML_HEADER}
<full-backup-content>
${includes('  ')}
</full-backup-content>
`;
}

function dataExtractionRulesXml() {
  return `${XML_HEADER}
<data-extraction-rules>
  <cloud-backup>
${includes('    ')}
  </cloud-backup>
  <device-transfer>
${includes('    ')}
  </device-transfer>
</data-extraction-rules>
`;
}

function withAndroidBackupRules(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) throw new Error('withAndroidBackupRules: AndroidManifest has no <application>');
    application.$['android:fullBackupContent'] = `@xml/${FULL_BACKUP_CONTENT}`;
    application.$['android:dataExtractionRules'] = `@xml/${DATA_EXTRACTION_RULES}`;
    return modConfig;
  });

  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const xmlDir = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, `${FULL_BACKUP_CONTENT}.xml`), fullBackupContentXml());
      fs.writeFileSync(path.join(xmlDir, `${DATA_EXTRACTION_RULES}.xml`), dataExtractionRulesXml());
      return modConfig;
    },
  ]);
}

module.exports = withAndroidBackupRules;
module.exports.BACKED_UP = BACKED_UP;
module.exports.fullBackupContentXml = fullBackupContentXml;
module.exports.dataExtractionRulesXml = dataExtractionRulesXml;

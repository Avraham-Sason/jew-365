import { translate } from '@/i18n';
import heTable from '@/i18n/he.json';
import enTable from '@/i18n/en.json';
import { ICON_NAMES } from '@/components/MitzvahIcon';
import {
  SETTINGS_SEARCH_ITEMS,
  SETTINGS_SEARCH_LIMIT,
  buildSettingsSearchIndex,
  normalizeSearchText,
  searchSettings,
  typedInOtherLayout,
  type SettingsSearchContext,
} from '../settingsSearch';

const index = buildSettingsSearchIndex((key) => [
  translate(key, undefined, 'he', null),
  translate(key, undefined, 'en', null),
]);
const ALL: SettingsSearchContext = { taharah: true, backup: true, battery: true };
const ids = (query: string, context = ALL) => searchSettings(query, index, context).map((item) => item.id);
const top = (query: string, context = ALL) => ids(query, context)[0];

describe('settings search index', () => {
  it('gives every item a unique id, a real icon and keys both dictionaries hold', () => {
    expect(new Set(SETTINGS_SEARCH_ITEMS.map((item) => item.id)).size).toBe(SETTINGS_SEARCH_ITEMS.length);
    for (const item of SETTINGS_SEARCH_ITEMS) {
      expect(ICON_NAMES).toContain(item.icon);
      for (const key of [item.titleKey, ...(item.labelKeys ?? [])]) {
        expect(heTable).toHaveProperty([key]);
        expect(enTable).toHaveProperty([key]);
      }
      expect(Boolean(item.section) !== Boolean(item.route)).toBe(true);
    }
  });
});

describe('normalizeSearchText', () => {
  it('drops nikud, quotes and final letters, and lower-cases Latin', () => {
    expect(normalizeSearchText('הִתְרָאוֹת')).toBe('התראות');
    expect(normalizeSearchText('ק"ש')).toBe('קש');
    expect(normalizeSearchText('שלום')).toBe('שלומ');
    expect(normalizeSearchText('  Dark-Mode  ')).toBe('dark mode');
  });
});

describe('typedInOtherLayout', () => {
  it('reads Latin keys typed on a Hebrew keyboard and the reverse', () => {
    expect(typedInOtherLayout('v,rtu,')).toBe('התראות');
    expect(typedInOtherLayout('נשגל')).toBe('badk');
    expect(typedInOtherLayout('שפה 1')).toBe('apv 1');
    expect(typedInOtherLayout('123')).toBeNull();
  });
});

describe('searchSettings', () => {
  it('finds nothing for an empty or blank query', () => {
    expect(ids('')).toEqual([]);
    expect(ids('   ')).toEqual([]);
  });

  it.each([
    ['התראות', 'notifications'],
    ['נוסח', 'nusach'],
    ['ספרדי', 'nusach'],
    ['חבד', 'nusach'],
    ['גרא', 'opinion'],
    ['דעת זמן ק"ש', 'opinion'],
    ['מגן אברהם', 'opinion'],
    ['מניין', 'prayerMode'],
    ['גלילה', 'reading'],
    ['ירושלים', 'location'],
    ['London', 'location'],
    ['עיר', 'location'],
    ['צבע', 'theme'],
    ['מצב כהה', 'theme'],
    ['אנגלית', 'language'],
    ['איפוס', 'reset'],
    ['גרסה', 'version'],
    ['סוללה', 'battery'],
    ['דוח שבועי', 'weeklyReport'],
    ['שחזור', 'backupImport'],
    ['ייצוא', 'backupExport'],
    ['באג', 'contact'],
    ['טלפון', 'profilePhone'],
    ['נשוי', 'maritalStatus'],
    ['מקווה', 'taharah'],
    ['הילולות', 'hilulot'],
    ['ראש חודש', 'roshChodesh'],
    ['notifications', 'notifications'],
    ['backup', 'backupExport'],
  ])('%s leads to %s', (query, id) => {
    expect(top(query)).toBe(id);
  });

  it('forgives a typo, a missing letter and swapped letters', () => {
    expect(top('התרעות')).toBe('notifications');
    expect(top('התראת')).toBe('notifications');
    expect(top('נסוח')).toBe('nusach');
    expect(top('notifcations')).toBe('notifications');
  });

  it('matches a word with a Hebrew prefix letter', () => {
    expect(top('בהתראות')).toBe('notifications');
    expect(top('והשפה')).toBe('language');
  });

  it('matches a prefix while the user is still typing', () => {
    expect(top('התר')).toBe('notifications');
    expect(top('גיב')).toBe('backupExport');
  });

  it('understands a word typed with the wrong keyboard layout', () => {
    expect(top('v,rtu,')).toBe('notifications');
    expect(top('נשבלופ')).toBe('backupExport');
  });

  it('keeps typo matches out while an exact match exists', () => {
    expect(ids('גיבוי')).not.toContain('mitzvot');
  });

  it('requires every word of the query', () => {
    expect(ids('התראות ירושלים')).toEqual([]);
  });

  it('hides what this user or device does not have', () => {
    const plain: SettingsSearchContext = { taharah: false, backup: false, battery: false };
    expect(ids('טהרה', plain)).not.toEqual(expect.arrayContaining(['taharah']));
    expect(ids('טהרה', plain)).not.toEqual(expect.arrayContaining(['taharahDevice']));
    expect(ids('גיבוי', plain)).not.toEqual(expect.arrayContaining(['backupExport']));
    expect(ids('סוללה', plain)).not.toEqual(expect.arrayContaining(['battery']));
    expect(ids('טהרה')).toEqual(expect.arrayContaining(['taharah', 'taharahDevice']));
  });

  it('caps the list', () => {
    expect(ids('ה').length).toBeLessThanOrEqual(SETTINGS_SEARCH_LIMIT);
  });
});

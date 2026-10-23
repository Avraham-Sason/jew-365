const path = require('path');

const TEAMIM = false;

const SOURCE_DIR = path.join(__dirname, 'source');
const SITE_DIR = path.join(__dirname, '..', '..', 'docs', 'chok');

const sourceFiles = (teamim = TEAMIM) => [1, 2, 3, 4, 5].map((n) => `y_hok${n}${teamim ? 1 : 0}.txt`);

const PARASHIYOT = [
  ['Bereshit', 'בראשית'],
  ['Noach', 'נח'],
  ['Lech-Lecha', 'לך לך'],
  ['Vayera', 'וירא'],
  ['Chayei Sara', 'חיי שרה'],
  ['Toldot', 'תולדות'],
  ['Vayetzei', 'ויצא'],
  ['Vayishlach', 'וישלח'],
  ['Vayeshev', 'וישב'],
  ['Miketz', 'מקץ'],
  ['Vayigash', 'ויגש'],
  ['Vayechi', 'ויחי'],
  ['Shemot', 'שמות'],
  ['Vaera', 'וארא'],
  ['Bo', 'בא'],
  ['Beshalach', 'בשלח'],
  ['Yitro', 'יתרו'],
  ['Mishpatim', 'משפטים'],
  ['Terumah', 'תרומה'],
  ['Tetzaveh', 'תצוה'],
  ['Ki Tisa', 'כי תשא'],
  ['Vayakhel', 'ויקהל'],
  ['Pekudei', 'פקודי'],
  ['Vayikra', 'ויקרא'],
  ['Tzav', 'צו'],
  ['Shmini', 'שמיני'],
  ['Tazria', 'תזריע'],
  ['Metzora', 'מצורע'],
  ['Achrei Mot', 'אחרי מות'],
  ['Kedoshim', 'קדושים'],
  ['Emor', 'אמור'],
  ['Behar', 'בהר'],
  ['Bechukotai', 'בחוקותי'],
  ['Bamidbar', 'במדבר'],
  ['Nasso', 'נשא'],
  ["Beha'alotcha", 'בהעלותך'],
  ["Sh'lach", 'שלח'],
  ['Korach', 'קורח'],
  ['Chukat', 'חוקת'],
  ['Balak', 'בלק'],
  ['Pinchas', 'פינחס'],
  ['Matot', 'מטות'],
  ['Masei', 'מסעי'],
  ['Devarim', 'דברים'],
  ['Vaetchanan', 'ואתחנן'],
  ['Eikev', 'עקב'],
  ["Re'eh", 'ראה'],
  ['Shoftim', 'שופטים'],
  ['Ki Teitzei', 'כי תצא'],
  ['Ki Tavo', 'כי תבוא'],
  ['Nitzavim', 'נצבים'],
  ['Vayeilech', 'וילך'],
  ["Ha'azinu", 'האזינו'],
  ['Vezot Haberakhah', 'וזאת הברכה'],
].map(([parasha, heading]) => ({ parasha, heading }));

const CREDIT = {
  title: "ר' פנחס ראובן שליט״א, ר' שגיב מחפוד שליט״א ו-J. Alan Groves Center, מתוך מאגר תורת אמת",
  license: 'CC BY-NC-SA 2.5',
  url: 'https://creativecommons.org/licenses/by-nc-sa/2.5/',
};

const MANIFEST_CREDIT = {
  he: "ר' פנחס ראובן שליט״א, ר' שגיב מחפוד שליט״א ו-J. Alan Groves Center, תחת רישיון CC BY-NC-SA 2.5, מתוך מאגר תורת אמת",
  en: "R' Pinchas Reuven, R' Sagiv Mahfud and the J. Alan Groves Center, under CC BY-NC-SA 2.5, from the Torat Emet database",
};

const LICENSE = {
  name: 'CC BY-NC-SA 2.5',
  url: 'https://creativecommons.org/licenses/by-nc-sa/2.5/',
  urlHe: 'https://creativecommons.org/licenses/by-nc-sa/2.5/',
};

const DEDICATION = null;

const VERSE_COUNTS = { sun: 6, mon: 4, tue: 5, wed: 6, thu: 5, thuNight: 26 };

const VERSE_COUNT_EXCEPTIONS = {
  Nitzavim: { thuNight: 14 },
  Vayeilech: { thuNight: 4 },
  'Vezot Haberakhah': { thuNight: 15 },
};

const HAFTARAH_VARIANT_PARASHIYOT = ['Vayetzei', 'Shemot', 'Vayakhel', 'Pekudei', 'Achrei Mot', 'Kedoshim'];
const NO_HAFTARAH_PARASHIYOT = ['Tetzaveh'];
const TORAH_ENDS_THURSDAY_NIGHT = ['Nitzavim', 'Vayeilech', "Ha'azinu", 'Vezot Haberakhah'];

const assetSlug = (parasha) =>
  parasha
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const assetFileName = (parasha, sha8) => `${assetSlug(parasha)}.${sha8}.json`;

module.exports = {
  TEAMIM,
  SOURCE_DIR,
  sourceFiles,
  PARASHIYOT,
  CREDIT,
  MANIFEST_CREDIT,
  LICENSE,
  DEDICATION,
  SITE_DIR,
  assetSlug,
  assetFileName,
  VERSE_COUNTS,
  VERSE_COUNT_EXCEPTIONS,
  HAFTARAH_VARIANT_PARASHIYOT,
  NO_HAFTARAH_PARASHIYOT,
  TORAH_ENDS_THURSDAY_NIGHT,
};

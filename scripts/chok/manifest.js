const SOURCE = 'http://raktora.50webs.com/hokleisrael';

const PAGES = [
  ['Bereshit', 'bereshit'],
  ['Noach', 'noah'],
  ['Lech-Lecha', 'lehlecha'],
  ['Vayera', 'vayera'],
  ['Chayei Sara', 'hsara'],
  ['Toldot', 'toldot'],
  ['Vayetzei', 'vayetze'],
  ['Vayishlach', 'vaishlah'],
  ['Vayeshev', 'vayeshev'],
  ['Miketz', 'miketz'],
  ['Vayigash', 'vaigash'],
  ['Vayechi', 'vayehi'],
  ['Shemot', 'shmot'],
  ['Vaera', 'vaera'],
  ['Bo', 'bo'],
  ['Beshalach', 'beshalah'],
  ['Yitro', 'itro'],
  ['Mishpatim', 'mishpatim'],
  ['Terumah', 'teroma'],
  ['Tetzaveh', 'tetzave'],
  ['Ki Tisa', 'kitisa'],
  ['Vayakhel', 'vayakhel'],
  ['Pekudei', 'pikuday'],
  ['Vayikra', 'vaikra'],
  ['Tzav', 'tzav'],
  ['Shmini', 'shmini'],
  ['Tazria', 'tazria'],
  ['Metzora', 'metzora'],
  ['Achrei Mot', 'aharey'],
  ['Kedoshim', 'kedoshim'],
  ['Emor', 'emor'],
  ['Behar', 'bahar'],
  ['Bechukotai', 'behukotay'],
  ['Bamidbar', 'bamidbar'],
  ['Nasso', 'naso'],
  ["Beha'alotcha", 'behaaloteha'],
  ["Sh'lach", 'shlah'],
  ['Korach', 'korah'],
  ['Chukat', 'hukat'],
  ['Balak', 'balak'],
  ['Pinchas', 'pinhas'],
  ['Matot', 'matot'],
  ['Masei', 'masey'],
  ['Devarim', 'devarim'],
  ['Vaetchanan', 'vaethanan'],
  ['Eikev', 'ekev'],
  ["Re'eh", 'ree'],
  ['Shoftim', 'shoftim'],
  ['Ki Teitzei', 'kiteze'],
  ['Ki Tavo', 'kitavo'],
  ['Nitzavim', 'nitzavim'],
  ['Vayeilech', 'vayeleh'],
  ["Ha'azinu", 'haazino'],
  ['Vezot Haberakhah', 'habracha'],
].map(([parasha, file]) => ({ parasha, file }));

const CREDIT = {
  title: 'חוק לישראל השלם, רק תורה',
  license: 'באישור בעל האתר',
  url: 'http://raktora.50webs.com/hokleisrael.htm',
};

const DEDICATION = null;

const REPAIRS = {
  behukotay: { strayOpenings: ['It 30:13'] },
  habracha: { strayOpenings: ['It 32:29'] },
  pinhas: { noTargum: ['25:19'] },
};

const VERSE_COUNTS = { sun: 6, mon: 4, tue: 5, wed: 6, thu: 5, thuNight: 26 };

const VERSE_COUNT_EXCEPTIONS = {
  Pinchas: { mon: 5 },
  Nitzavim: { thuNight: 14 },
  Vayeilech: { thuNight: 4 },
  'Vezot Haberakhah': { thuNight: 15 },
};

const HAFTARAH_VARIANT_PARASHIYOT = ['Vayetzei', 'Shemot', 'Vayakhel', 'Pekudei', 'Achrei Mot', 'Kedoshim'];
const NO_HAFTARAH_PARASHIYOT = ['Tetzaveh'];
const TORAH_ENDS_THURSDAY_NIGHT = ['Nitzavim', 'Vayeilech', "Ha'azinu"];

const pageUrl = (file) => `${SOURCE}/${file}.htm`;

const assetFileName = (parasha) =>
  `${parasha
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.chok`;

module.exports = {
  PAGES,
  CREDIT,
  DEDICATION,
  REPAIRS,
  VERSE_COUNTS,
  VERSE_COUNT_EXCEPTIONS,
  HAFTARAH_VARIANT_PARASHIYOT,
  NO_HAFTARAH_PARASHIYOT,
  TORAH_ENDS_THURSDAY_NIGHT,
  pageUrl,
  assetFileName,
};

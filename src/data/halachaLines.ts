import type { Nusach } from '@/types/mitzvah';

type Localized = { he: string; en: string };

export type HalachaLine = {
  id: string;
  name: Localized;
  // Dialable digits, Israeli format.
  phone: string;
  // International format without "+", as wa.me expects; absent when the line takes no WhatsApp.
  whatsapp?: string;
  hours?: Localized;
};

export type HalachaRuling = 'ashkenazi' | 'sephardi';

// The numbers the user supplied on 2026-10-14. No Ashkenazi line has a WhatsApp number that could
// be verified, so those lines offer a call only.
export const HALACHA_LINES: Record<HalachaRuling, readonly HalachaLine[]> = {
  ashkenazi: [
    {
      id: 'karelitz',
      name: { he: 'בית ההוראה של הרב נסים קרליץ זצ״ל', en: 'Beit Hora’ah of Rav Nissim Karelitz' },
      phone: '0722152222',
      hours: {
        he: 'כל יום עד 2:00 בלילה, בערב שבת וחג עד הכניסה',
        en: 'Daily until 2:00 am, on erev Shabbat and Yom Tov until it begins',
      },
    },
    {
      id: 'gross',
      name: { he: 'בית ההוראה של הרב מרדכי גרוס שליט״א', en: 'Beit Hora’ah of Rav Mordechai Gross' },
      phone: '0737246000',
      hours: { he: '24 שעות ביממה, עד כניסת שבת וחג', en: 'Around the clock, until Shabbat and Yom Tov begin' },
    },
    {
      id: 'stern',
      name: { he: 'בית ההוראה בנשיאות הרב שמואל אליעזר שטרן שליט״א', en: 'Beit Hora’ah of Rav Shmuel Eliezer Stern' },
      phone: '036161616',
    },
    {
      id: 'general',
      name: { he: 'קו ההלכה הכללי', en: 'The general halacha line' },
      phone: '025363333',
      hours: { he: '24 שעות ביממה, שישה ימים בשבוע', en: 'Around the clock, six days a week' },
    },
  ],
  sephardi: [
    {
      id: 'maran',
      name: { he: 'קו ההלכה לפי פסקי מרן', en: 'Halacha line following Maran' },
      phone: '0737860860',
      whatsapp: '972737860860',
    },
  ],
};

// Edot HaMizrach follows the Sephardi poskim; Ashkenaz, Sefard and Chabad the Ashkenazi ones
// (the user's call, 2026-10-14).
export const halachaRulingFor = (nusach: Nusach): HalachaRuling =>
  nusach === 'edot_hamizrach' ? 'sephardi' : 'ashkenazi';

export const phoneLabel = (digits: string): string =>
  digits.length === 10
    ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
    : `${digits.slice(0, 2)}-${digits.slice(2)}`;

export const callUrl = (line: HalachaLine): string => `tel:${line.phone}`;

export const whatsappUrl = (line: HalachaLine): string | null =>
  line.whatsapp ? `https://wa.me/${line.whatsapp}` : null;

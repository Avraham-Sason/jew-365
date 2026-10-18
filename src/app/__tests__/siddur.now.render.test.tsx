jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { screen, within } from '@testing-library/react-native';
import SiddurScreen from '../(tabs)/siddur';
import { CITIES } from '@/data/cities';
import { useUserStore } from '@/stores/useUserStore';
import { renderWithTheme } from '@/testing/render';
import { at } from '@/testing/zmanim';
import type { Nusach } from '@/types/mitzvah';

const JERUSALEM = CITIES[0];
const ONLY_DATE = [
  'nextTick',
  'queueMicrotask',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

const BIRCHOT = 'ברכות השחר';
const SHACHARIT = 'תפילת שחרית';
const MINCHA = 'תפילת מנחה';
const MAARIV = 'תפילת ערבית';
const BEDTIME = 'קריאת שמע על המיטה';
const LEVANA = 'קידוש לבנה';
const SELICHOT = 'סליחות';
const NAMES = [
  BIRCHOT,
  'הנחת תפילין',
  'קריאת שמע שחרית',
  SHACHARIT,
  MINCHA,
  MAARIV,
  BEDTIME,
  LEVANA,
  SELICHOT,
  'הדלקת נרות חנוכה',
];
const EXCLUSIVE: [string, string][] = [
  [SHACHARIT, MINCHA],
  [MINCHA, MAARIV],
  [SHACHARIT, MAARIV],
  [BIRCHOT, BEDTIME],
  [BIRCHOT, MAARIV],
  [SHACHARIT, BEDTIME],
];

function nowCard(wallClock: string, nusach: Nusach = 'ashkenaz'): string[] {
  useUserStore.setState({ nusach });
  jest.useFakeTimers({ now: at(JERUSALEM, wallClock), doNotFake: [...ONLY_DATE] });
  const view = renderWithTheme(<SiddurScreen />);
  const card = screen.queryByTestId('siddur-now');
  const names = card ? NAMES.filter((name) => within(card).queryByText(name)) : [];
  view.unmount();
  jest.useRealTimers();
  return names;
}

describe('the siddur tab’s "now" card', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({
      language: 'he',
      location: JERUSALEM,
      inIsrael: true,
      isOnboarded: true,
      locationStatus: 'ready',
      locationSource: 'manual',
    });
  });

  afterEach(() => jest.useRealTimers());

  it('is titled "now" and lists only what is said at that hour, never a later window', () => {
    expect(nowCard('2027-06-15T05:00')).toEqual([BIRCHOT, 'הנחת תפילין']);
    expect(nowCard('2027-06-15T07:30')).toEqual([BIRCHOT, 'הנחת תפילין', 'קריאת שמע שחרית', SHACHARIT]);
    expect(nowCard('2027-06-15T14:00')).toEqual(['הנחת תפילין', MINCHA]);
    expect(nowCard('2027-06-15T21:30')).toEqual([MAARIV, BEDTIME, LEVANA]);
    expect(nowCard('2027-06-16T02:00')).toEqual([BEDTIME, LEVANA]);
    jest.useFakeTimers({ now: at(JERUSALEM, '2027-06-15T07:30'), doNotFake: [...ONLY_DATE] });
    renderWithTheme(<SiddurScreen />);
    expect(screen.getByText('עכשיו')).toBeOnTheScreen();
    expect(screen.queryByText('היום')).toBeNull();
    expect(within(screen.getByTestId('siddur-now')).queryByText(/^מ-/)).toBeNull();
  });

  it('is absent while nothing is said', () => {
    useUserStore.setState({ nusach: 'ashkenaz' });
    jest.useFakeTimers({ now: at(JERUSALEM, '2027-06-23T20:05'), doNotFake: [...ONLY_DATE] });
    renderWithTheme(<SiddurScreen />);
    expect(screen.queryByTestId('siddur-now')).toBeNull();
    expect(screen.queryByText('עכשיו')).toBeNull();
  });

  it('offers Selichot from midnight through the morning prayer in its season, by each nusach’s first day', () => {
    expect(nowCard('2027-09-08T01:30', 'edot_hamizrach')).toEqual([BEDTIME, LEVANA, SELICHOT]);
    expect(nowCard('2027-09-08T07:00', 'edot_hamizrach')).toEqual(
      expect.arrayContaining([BIRCHOT, SHACHARIT, SELICHOT]),
    );
    expect(nowCard('2027-09-08T23:00', 'edot_hamizrach')).not.toContain(SELICHOT);
    expect(nowCard('2027-09-08T01:30', 'ashkenaz')).not.toContain(SELICHOT);
    expect(nowCard('2027-09-27T01:30', 'ashkenaz')).toEqual([BEDTIME, SELICHOT]);
    expect(nowCard('2027-09-27T05:30', 'ashkenaz')).toEqual(expect.arrayContaining([BIRCHOT, SELICHOT]));
    expect(nowCard('2027-09-27T05:30', 'ashkenaz')).not.toContain(BEDTIME);
  });

  it('never shows two prayers that cannot both be said, at any hour of a week', () => {
    for (const [day, nusach] of [
      ['2027-06-14', 'ashkenaz'],
      ['2027-09-27', 'ashkenaz'],
      ['2027-12-27', 'sefard'],
      ['2027-09-08', 'edot_hamizrach'],
    ] as const) {
      for (let hour = 0; hour < 24; hour++) {
        for (const minute of ['00', '30']) {
          const shown = nowCard(`${day}T${String(hour).padStart(2, '0')}:${minute}`, nusach);
          for (const [a, b] of EXCLUSIVE) {
            expect({ day, hour, minute, both: shown.includes(a) && shown.includes(b), a, b }).toMatchObject({
              both: false,
            });
          }
        }
      }
    }
  });
});

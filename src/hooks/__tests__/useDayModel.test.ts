jest.mock('@/data/mitzvot', () => {
  const actual = jest.requireActual('@/data/mitzvot');
  const chabadOnly = {
    ...actual.MITZVOT[0],
    id: 'chabad_only',
    name: { he: 'רק חב"ד', en: 'Chabad only' },
    nuschaotSupported: ['chabad'],
  };
  return { ...actual, MITZVOT: [...actual.MITZVOT, chabadOnly] };
});

import { MITZVOT } from '@/data/mitzvot';
import { CITIES } from '@/data/cities';
import { useCompletionsStore } from '@/stores/useCompletionsStore';
import { CustomMitzvah } from '@/types/mitzvah';
import { DayModelState, dayModelFrom } from '../useDayModel';

const custom = (id: string, createdAt: number, name = 'משימה'): CustomMitzvah => ({
  id,
  name,
  startHHMM: '08:00',
  endHHMM: '09:00',
  reminders: [],
  skipOn: [],
  createdAt,
});

const state = (overrides: Partial<DayModelState> = {}): DayModelState => ({
  location: CITIES[0],
  nusach: 'ashkenaz',
  inIsrael: true,
  language: 'he',
  halachicOpinions: { ksSofZman: 'GRA' },
  activeMitzvot: {},
  customItems: {},
  ...overrides,
});

describe('dayModelFrom', () => {
  afterEach(() => {
    useCompletionsStore.setState({ completions: {}, skipped: {}, checkIns: {} });
  });

  it('lists the registry first, then the custom mitzvot in the order they were created', () => {
    const model = dayModelFrom(
      state({ customItems: { late: custom('late', 300), early: custom('early', 100), middle: custom('middle', 200) } }),
    );
    const ids = model.allMitzvot.map((mitzvah) => mitzvah.id);
    expect(ids.slice(-3)).toEqual(['early', 'middle', 'late']);
    expect(ids.slice(0, -3)).toEqual(MITZVOT.map((mitzvah) => mitzvah.id).filter((id) => id !== 'chabad_only'));
  });

  it('keeps only the mitzvot the nusach supports', () => {
    const ashkenaz = dayModelFrom(state({ nusach: 'ashkenaz' })).allMitzvot.map((mitzvah) => mitzvah.id);
    const chabad = dayModelFrom(state({ nusach: 'chabad' })).allMitzvot.map((mitzvah) => mitzvah.id);
    expect(ashkenaz).not.toContain('chabad_only');
    expect(chabad).toContain('chabad_only');
    expect(chabad).toHaveLength(ashkenaz.length + 1);
  });

  it('enables exactly the mitzvot whose active state says so, customs included', () => {
    const model = dayModelFrom(
      state({
        nusach: 'chabad',
        customItems: { mine: custom('mine', 1), other: custom('other', 2) },
        activeMitzvot: {
          tefillin: { enabled: true },
          mincha: { enabled: false },
          chabad_only: { enabled: true },
          mine: { enabled: true },
          unknown_id: { enabled: true },
        },
      }),
    );
    expect(model.enabled.map((mitzvah) => mitzvah.id)).toEqual(['tefillin', 'chabad_only', 'mine']);
  });

  it('does not enable a mitzvah the nusach filtered out, even when its state says enabled', () => {
    const model = dayModelFrom(state({ nusach: 'ashkenaz', activeMitzvot: { chabad_only: { enabled: true } } }));
    expect(model.enabled).toEqual([]);
  });

  it('exposes the location, nusach, language and the settings built from them', () => {
    const model = dayModelFrom(
      state({ nusach: 'sefard', inIsrael: false, language: 'en', halachicOpinions: { ksSofZman: 'MA' } }),
    );
    expect(model.location).toBe(CITIES[0]);
    expect(model.nusach).toBe('sefard');
    expect(model.inIsrael).toBe(false);
    expect(model.language).toBe('en');
    expect(model.settings).toEqual({ nusach: 'sefard', halachicOpinions: { ksSofZman: 'MA' }, inIsrael: false });
  });

  describe('nameFor', () => {
    const tefillin = MITZVOT.find((mitzvah) => mitzvah.id === 'tefillin')!;
    const mine = dayModelFrom(state({ customItems: { mine: custom('mine', 1, 'המשימה שלי') } })).allMitzvot.find(
      (mitzvah) => mitzvah.id === 'mine',
    )!;

    it('names a mitzvah in the language of the model', () => {
      expect(dayModelFrom(state({ language: 'he' })).nameFor(tefillin)).toBe(tefillin.name.he);
      expect(dayModelFrom(state({ language: 'en' })).nameFor(tefillin)).toBe(tefillin.name.en);
    });

    it('falls back to Hebrew in English when the mitzvah has no English name', () => {
      expect(mine.name.en).toBeUndefined();
      expect(dayModelFrom(state({ language: 'en' })).nameFor(mine)).toBe('המשימה שלי');
    });
  });

  describe('checkInInput', () => {
    it('hands the check-in the enabled mitzvot, settings and location of the model', () => {
      const model = dayModelFrom(
        state({
          activeMitzvot: { tefillin: { enabled: true, enabledAt: 1_700_000_000_000 }, mincha: { enabled: true } },
        }),
      );
      const input = model.checkInInput();
      expect(input.mitzvot).toBe(model.enabled);
      expect(input.settings).toBe(model.settings);
      expect(input.location).toBe(CITIES[0]);
      expect(input.enabledSince).toEqual({ tefillin: 1_700_000_000_000 });
    });

    it('reads completions, skips and check-ins from the store when it is called, not when the model was built', () => {
      const model = dayModelFrom(state());
      expect(model.checkInInput()).toMatchObject({ completions: {}, skipped: {}, checkIns: {} });

      useCompletionsStore.setState({
        completions: { '2026-11-13': { tefillin: 111 } },
        skipped: { '2026-11-14': { mincha: 222 } },
        checkIns: { '2026-11-13': 333 },
      });
      expect(model.checkInInput()).toMatchObject({
        completions: { '2026-11-13': { tefillin: 111 } },
        skipped: { '2026-11-14': { mincha: 222 } },
        checkIns: { '2026-11-13': 333 },
      });

      useCompletionsStore.setState({ completions: { '2026-11-15': { maariv: 444 } } });
      expect(model.checkInInput().completions).toEqual({ '2026-11-15': { maariv: 444 } });
    });
  });
});

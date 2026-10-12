jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

import { useTaharahStore } from '../useTaharahStore';
import { useUserStore } from '../useUserStore';
import { storage } from '@/services/StorageService';
import { taharahStorage } from '@/services/TaharahStorage';
import { rulesFor } from '@/data/taharahPresets';

const get = () => useTaharahStore.getState();

const onset = { type: 'onset', onah: { abs: 740000, kind: 'night' } } as const;
const hefsek = { type: 'hefsek', day: 5, result: 'clean' } as const;
const bedika = { type: 'bedika', day: 6, slot: 'morning', result: 'clean' } as const;

describe('useTaharahStore', () => {
  it('keeps a persisted state across a version bump (identity migrate)', () => {
    const options = useTaharahStore.persist.getOptions();
    expect(options.name).toBe('taharah-store');
    const saved = { marker: 'taharah' };
    expect(options.migrate?.(saved, 0)).toBe(saved);
  });

  beforeEach(() => get().reset());
  afterEach(() => jest.restoreAllMocks());

  it('starts from the ashkenaz preset as a woman with discreet notifications and the lock on', () => {
    expect(get().events).toEqual([]);
    expect(get().settings).toEqual({ preset: 'ashkenaz', rules: rulesFor('ashkenaz'), role: 'woman' });
    expect(get().discreetNotifications).toBe(true);
    expect(get().lockEnabled).toBe(true);
    expect(get().hefsekLeadMin).toBe(90);
    expect(get().bedikaEveningLeadMin).toBe(60);
    expect(get().tevilaPrepLeadMin).toBe(180);
  });

  describe('events', () => {
    it('addEvent stamps an id and recordedAt, returns the id and keeps insertion order', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      const first = get().addEvent(onset);
      const second = get().addEvent(hefsek);
      const third = get().addEvent(bedika);

      expect(get().events.map((e) => e.id)).toEqual([first, second, third]);
      expect(get().events.map((e) => e.type)).toEqual(['onset', 'hefsek', 'bedika']);
      expect(get().events[0]).toEqual({ ...onset, id: first, recordedAt: 1_700_000_000_000 });
      expect(first).toMatch(/^taharah_1700000000000_[0-9a-z]{4}$/);
    });

    it('gives every event within the same millisecond its own id', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      const ids = Array.from({ length: 200 }, () => get().addEvent(onset));
      expect(new Set(ids).size).toBe(200);
    });

    it('draws a new suffix when the random one is already taken in the same millisecond', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      jest.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.5).mockReturnValueOnce(0.25);
      const first = get().addEvent(onset);
      const second = get().addEvent(hefsek);
      expect(second).not.toBe(first);
      expect(get().events.map((e) => e.id)).toEqual([first, second]);
    });

    it('removeEvent removes only that id', () => {
      const first = get().addEvent(onset);
      const second = get().addEvent(hefsek);
      const third = get().addEvent(bedika);

      get().removeEvent(second);

      expect(get().events.map((e) => e.id)).toEqual([first, third]);
    });

    it('removeEvent of an unknown id changes nothing', () => {
      const id = get().addEvent(onset);
      get().removeEvent('taharah_0_none');
      expect(get().events.map((e) => e.id)).toEqual([id]);
    });

    it('clearEvents empties the log and keeps every setting', () => {
      get().addEvent(onset);
      get().setPreset('chabad');
      get().setRole('husband');
      get().setLockEnabled(false);
      get().setLeads({ hefsekLeadMin: 45 });

      get().clearEvents();

      expect(get().events).toEqual([]);
      expect(get().settings.preset).toBe('chabad');
      expect(get().settings.role).toBe('husband');
      expect(get().lockEnabled).toBe(false);
      expect(get().hefsekLeadMin).toBe(45);
    });
  });

  describe('settings', () => {
    it('setPreset replaces the rules with that preset and keeps the role', () => {
      get().setRole('husband');
      get().setPreset('chabad');
      expect(get().settings).toEqual({ preset: 'chabad', rules: rulesFor('chabad'), role: 'husband' });
    });

    it('setPreset drops earlier single-rule overrides', () => {
      get().setRule('ohrZarua', true);
      get().setPreset('ashkenaz');
      expect(get().settings.rules).toEqual(rulesFor('ashkenaz'));
    });

    it('setRule overrides one rule, keeps the preset id and touches nothing else', () => {
      expect(get().settings.rules.ohrZarua).toBe(false);

      get().setRule('ohrZarua', true);

      expect(get().settings.preset).toBe('ashkenaz');
      expect(get().settings.rules).toEqual({ ...rulesFor('ashkenaz'), ohrZarua: true });
    });

    it('setRule accepts a list rule and a rule of another type', () => {
      get().setRule('onahBeinonitDays', [30]);
      get().setRule('hefsekEarliestDay', 4);
      expect(get().settings.rules.onahBeinonitDays).toEqual([30]);
      expect(get().settings.rules.hefsekEarliestDay).toBe(4);
    });

    it('never shares rule arrays with the preset table', () => {
      get().setPreset('chassidic');
      expect(get().settings.rules.onahBeinonitDays).not.toBe(rulesFor('chassidic').onahBeinonitDays);
    });

    it('setRole switches between woman and husband', () => {
      get().setRole('husband');
      expect(get().settings.role).toBe('husband');
      get().setRole('woman');
      expect(get().settings.role).toBe('woman');
    });

    it('setLeads updates only the leads it is given', () => {
      get().setLeads({ bedikaEveningLeadMin: 30 });
      expect(get().hefsekLeadMin).toBe(90);
      expect(get().bedikaEveningLeadMin).toBe(30);
      expect(get().tevilaPrepLeadMin).toBe(180);

      get().setLeads({ hefsekLeadMin: 120, tevilaPrepLeadMin: 240 });
      expect(get().hefsekLeadMin).toBe(120);
      expect(get().bedikaEveningLeadMin).toBe(30);
      expect(get().tevilaPrepLeadMin).toBe(240);
    });

    it('toggles discreet notifications and the lock', () => {
      get().setDiscreetNotifications(false);
      get().setLockEnabled(false);
      expect(get().discreetNotifications).toBe(false);
      expect(get().lockEnabled).toBe(false);
    });
  });

  describe('setRoleForGender', () => {
    it('makes a woman of a female and a husband of a male, and touches nothing else', () => {
      get().setPreset('chabad');

      get().setRoleForGender('male');
      expect(get().settings).toEqual({ preset: 'chabad', rules: rulesFor('chabad'), role: 'husband' });

      get().setRoleForGender('female');
      expect(get().settings).toEqual({ preset: 'chabad', rules: rulesFor('chabad'), role: 'woman' });
    });
  });

  describe('startTracking', () => {
    it('sets the role from the gender and the preset from the nusach on a fresh store', () => {
      get().startTracking('male', 'chabad');
      expect(get().settings).toEqual({ preset: 'chabad', rules: rulesFor('chabad'), role: 'husband' });

      get().startTracking('female', 'edot_hamizrach');
      expect(get().settings).toEqual({ preset: 'sephardi_ovadia', rules: rulesFor('sephardi_ovadia'), role: 'woman' });
    });

    it('keeps the ashkenaz preset for nusach ashkenaz and never shares rule arrays with the table', () => {
      get().startTracking('female', 'ashkenaz');
      expect(get().settings).toEqual({ preset: 'ashkenaz', rules: rulesFor('ashkenaz'), role: 'woman' });

      get().startTracking('female', 'sefard');
      expect(get().settings.preset).toBe('chassidic');
      expect(get().settings.rules.onahBeinonitDays).not.toBe(rulesFor('chassidic').onahBeinonitDays);
    });

    it('does not clobber an edited rule set, only the role follows', () => {
      get().setRule('ohrZarua', true);

      get().startTracking('male', 'chabad');

      expect(get().settings).toEqual({
        preset: 'ashkenaz',
        rules: { ...rulesFor('ashkenaz'), ohrZarua: true },
        role: 'husband',
      });
    });

    it('does not clobber an edited rule set on a preset picked earlier', () => {
      get().setPreset('chassidic');
      get().setRule('mochDachuk', 'optional');

      get().startTracking('female', 'chabad');

      expect(get().settings.preset).toBe('chassidic');
      expect(get().settings.rules).toEqual({ ...rulesFor('chassidic'), mochDachuk: 'optional' });
    });

    it('does not clobber the preset once events exist, only the role follows', () => {
      get().addEvent(onset);

      get().startTracking('male', 'chabad');

      expect(get().events).toHaveLength(1);
      expect(get().settings).toEqual({ preset: 'ashkenaz', rules: rulesFor('ashkenaz'), role: 'husband' });
    });

    it('keeps the log and every other setting', () => {
      get().setLockEnabled(false);
      get().setLeads({ hefsekLeadMin: 45 });

      get().startTracking('female', 'chabad');

      expect(get().lockEnabled).toBe(false);
      expect(get().hefsekLeadMin).toBe(45);
    });
  });

  describe('adoptPresetFor', () => {
    it('sets the preset for the nusach on a fresh store and leaves the role alone', () => {
      get().setRole('husband');

      get().adoptPresetFor('sefard');

      expect(get().settings).toEqual({ preset: 'chassidic', rules: rulesFor('chassidic'), role: 'husband' });
    });

    it("follows a changed mind while the rules are still the picked preset's own", () => {
      get().adoptPresetFor('sefard');
      get().adoptPresetFor('chabad');
      expect(get().settings.preset).toBe('chabad');
      expect(get().settings.rules).toEqual(rulesFor('chabad'));

      get().adoptPresetFor('ashkenaz');
      expect(get().settings.preset).toBe('ashkenaz');
    });

    it('does not clobber an edited rule set', () => {
      get().setRule('onahBeinonitDays', [30]);

      get().adoptPresetFor('chabad');

      expect(get().settings.preset).toBe('ashkenaz');
      expect(get().settings.rules).toEqual({ ...rulesFor('ashkenaz'), onahBeinonitDays: [30] });
    });

    it('does not clobber once events exist', () => {
      get().addEvent(onset);

      get().adoptPresetFor('chabad');

      expect(get().settings).toEqual({ preset: 'ashkenaz', rules: rulesFor('ashkenaz'), role: 'woman' });
    });
  });

  it('reset restores every default, with fresh rules', () => {
    get().addEvent(onset);
    get().setPreset('sephardi_ovadia');
    get().setRule('ohrZarua', true);
    get().setRole('husband');
    get().setDiscreetNotifications(false);
    get().setLockEnabled(false);
    get().setLeads({ hefsekLeadMin: 1, bedikaEveningLeadMin: 2, tevilaPrepLeadMin: 3 });
    const before = get().settings.rules;

    get().reset();

    expect(get().events).toEqual([]);
    expect(get().settings).toEqual({ preset: 'ashkenaz', rules: rulesFor('ashkenaz'), role: 'woman' });
    expect(get().discreetNotifications).toBe(true);
    expect(get().lockEnabled).toBe(true);
    expect(get().hefsekLeadMin).toBe(90);
    expect(get().bedikaEveningLeadMin).toBe(60);
    expect(get().tevilaPrepLeadMin).toBe(180);
    expect(get().settings.rules).not.toBe(before);
  });

  describe('persistence', () => {
    it('writes to the taharah storage under its own key and never to the plain storage', () => {
      const id = get().addEvent(onset);

      const saved = JSON.parse(taharahStorage.getString('taharah-store') as string);
      expect(saved.version).toBe(1);
      expect(saved.state.events.map((e: { id: string }) => e.id)).toEqual([id]);
      expect(storage.getAllKeys().filter((key) => key.includes('taharah'))).toEqual([]);
      expect(storage.getString('taharah-store')).toBeUndefined();
    });

    it('does not keep taharah fields in the user store payload', () => {
      get().addEvent(onset);
      useUserStore.getState().setGender('female');

      const saved = JSON.parse(storage.getString('user-store') as string);
      expect(Object.keys(saved.state)).not.toEqual(expect.arrayContaining(['events', 'settings']));
      expect(JSON.stringify(saved)).not.toContain('taharah_');
    });

    it('hydrates events and settings back from the storage', async () => {
      const id = get().addEvent(hefsek);
      get().setPreset('chabad');
      get().setRule('mochDachuk', 'optional');
      const persisted = taharahStorage.getString('taharah-store') as string;

      get().reset();
      taharahStorage.set('taharah-store', persisted);
      await useTaharahStore.persist.rehydrate();

      expect(get().events.map((e) => e.id)).toEqual([id]);
      expect(get().settings.preset).toBe('chabad');
      expect(get().settings.rules).toEqual({ ...rulesFor('chabad'), mochDachuk: 'optional' });
    });

    it('fills a rule missing from an older saved shape from the saved preset', async () => {
      const { ohrZarua: _dropped, ...older } = rulesFor('chabad');
      taharahStorage.set(
        'taharah-store',
        JSON.stringify({
          version: 1,
          state: { settings: { preset: 'chabad', rules: older, role: 'woman' }, lockEnabled: false },
        }),
      );

      await useTaharahStore.persist.rehydrate();

      expect(get().settings.rules).toEqual(rulesFor('chabad'));
      expect(get().lockEnabled).toBe(false);
      expect(get().hefsekLeadMin).toBe(90);
    });

    it('keeps the saved data when the saved preset id is unknown to this build', async () => {
      taharahStorage.set(
        'taharah-store',
        JSON.stringify({
          version: 1,
          state: {
            events: [{ type: 'onset', onah: { abs: 739909, kind: 'day' }, id: 'e1', recordedAt: 1 }],
            settings: { preset: 'from_the_future', rules: { ...rulesFor('chabad'), ohrZarua: false }, role: 'husband' },
            hefsekLeadMin: 45,
          },
        }),
      );

      await useTaharahStore.persist.rehydrate();

      expect(get().events.map((e) => e.id)).toEqual(['e1']);
      expect(get().settings.preset).toBe('ashkenaz');
      expect(get().settings.rules).toEqual({ ...rulesFor('chabad'), ohrZarua: false });
      expect(get().settings.role).toBe('husband');
      expect(get().hefsekLeadMin).toBe(45);
    });

    it('drops a corrupt payload from the taharah storage, not the plain one', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      storage.set('taharah-store', 'plain copy stays');
      taharahStorage.set('taharah-store', '{not json');

      await useTaharahStore.persist.rehydrate();

      expect(taharahStorage.getString('taharah-store')).toBeUndefined();
      expect(storage.getString('taharah-store')).toBe('plain copy stays');
      storage.delete('taharah-store');
    });
  });
});

describe('useUserStore taharah fields', () => {
  beforeEach(() => useUserStore.getState().reset());

  it('defaults gender and marital status to not answered and taharah off', () => {
    expect(useUserStore.getState().gender).toBeNull();
    expect(useUserStore.getState().maritalStatus).toBeNull();
    expect(useUserStore.getState().taharahEnabled).toBe(false);
  });

  it('sets and clears gender', () => {
    useUserStore.getState().setGender('female');
    expect(useUserStore.getState().gender).toBe('female');
    useUserStore.getState().setGender('male');
    expect(useUserStore.getState().gender).toBe('male');
    useUserStore.getState().setGender(null);
    expect(useUserStore.getState().gender).toBeNull();
  });

  it('sets and clears maritalStatus', () => {
    useUserStore.getState().setMaritalStatus('married');
    expect(useUserStore.getState().maritalStatus).toBe('married');
    useUserStore.getState().setMaritalStatus('single');
    expect(useUserStore.getState().maritalStatus).toBe('single');
    useUserStore.getState().setMaritalStatus(null);
    expect(useUserStore.getState().maritalStatus).toBeNull();
  });

  it('sets taharahEnabled', () => {
    useUserStore.getState().setTaharahEnabled(true);
    expect(useUserStore.getState().taharahEnabled).toBe(true);
  });

  it('reset clears all three', () => {
    useUserStore.getState().setGender('female');
    useUserStore.getState().setMaritalStatus('married');
    useUserStore.getState().setTaharahEnabled(true);

    useUserStore.getState().reset();

    expect(useUserStore.getState().gender).toBeNull();
    expect(useUserStore.getState().maritalStatus).toBeNull();
    expect(useUserStore.getState().taharahEnabled).toBe(false);
  });

  it('a cold start on a payload saved before the fields existed gets the defaults', () => {
    jest.isolateModules(() => {
      const { storage: freshStorage } = require('@/services/StorageService');
      freshStorage.set('user-store', JSON.stringify({ version: 1, state: { nusach: 'sefard', isOnboarded: true } }));

      const { useUserStore: coldStart } = require('../useUserStore');

      expect(coldStart.getState().nusach).toBe('sefard');
      expect(coldStart.getState().isOnboarded).toBe(true);
      expect(coldStart.getState().gender).toBeNull();
      expect(coldStart.getState().maritalStatus).toBeNull();
      expect(coldStart.getState().taharahEnabled).toBe(false);
    });
  });

  it('a cold start on a payload with tracking on and no marital status infers married', () => {
    jest.isolateModules(() => {
      const { storage: freshStorage } = require('@/services/StorageService');
      freshStorage.set(
        'user-store',
        JSON.stringify({
          version: 1,
          state: { nusach: 'sefard', isOnboarded: true, gender: 'female', taharahEnabled: true },
        }),
      );

      const { useUserStore: coldStart } = require('../useUserStore');

      expect(coldStart.getState().maritalStatus).toBe('married');
      expect(coldStart.getState().taharahEnabled).toBe(true);
      expect(coldStart.getState().gender).toBe('female');
    });
  });

  it('a cold start on a payload with tracking off and no marital status keeps it unanswered', () => {
    jest.isolateModules(() => {
      const { storage: freshStorage } = require('@/services/StorageService');
      freshStorage.set(
        'user-store',
        JSON.stringify({ version: 1, state: { isOnboarded: true, gender: 'male', taharahEnabled: false } }),
      );

      const { useUserStore: coldStart } = require('../useUserStore');

      expect(coldStart.getState().maritalStatus).toBeNull();
      expect(coldStart.getState().taharahEnabled).toBe(false);
    });
  });

  it('a cold start keeps a saved single status', () => {
    jest.isolateModules(() => {
      const { storage: freshStorage } = require('@/services/StorageService');
      freshStorage.set(
        'user-store',
        JSON.stringify({ version: 1, state: { taharahEnabled: false, maritalStatus: 'single' } }),
      );

      const { useUserStore: coldStart } = require('../useUserStore');

      expect(coldStart.getState().maritalStatus).toBe('single');
    });
  });
});

jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

import {
  MENS_MITZVOT,
  chooseGender,
  chooseMaritalStatus,
  chooseNusach,
  setTaharahTracking,
  taharahOffered,
} from '../taharahOptIn';
import { useMitzvotStore } from '../useMitzvotStore';
import { useTaharahStore } from '../useTaharahStore';
import { useUserStore } from '../useUserStore';
import { rulesFor } from '@/data/taharahPresets';

const taharah = () => useTaharahStore.getState();
const user = () => useUserStore.getState();
const enabled = (id: string) => Boolean(useMitzvotStore.getState().activeMitzvot[id]?.enabled);

describe('taharahOptIn', () => {
  beforeEach(() => {
    user().reset();
    taharah().reset();
    useMitzvotStore.getState().reset();
  });

  describe('chooseGender', () => {
    it('stores the gender and flips the taharah role while tracking is on', () => {
      user().setTaharahEnabled(true);

      chooseGender('male');
      expect(user().gender).toBe('male');
      expect(taharah().settings.role).toBe('husband');

      chooseGender('female');
      expect(user().gender).toBe('female');
      expect(taharah().settings.role).toBe('woman');
    });

    it('leaves the taharah store alone while tracking is off', () => {
      taharah().setRole('husband');

      chooseGender('female');

      expect(user().gender).toBe('female');
      expect(taharah().settings.role).toBe('husband');
    });

    it('switches tefillin off for a woman and leaves the prayers on', () => {
      expect(MENS_MITZVOT).toEqual(['tefillin']);
      chooseGender('female');
      expect(MENS_MITZVOT.map(enabled)).toEqual([false]);
      expect(['shacharit', 'mincha', 'maariv', 'krias_shma_shacharit'].map(enabled)).toEqual([true, true, true, true]);
    });

    it('keeps the defaults for a man answering for the first time', () => {
      useMitzvotStore.getState().setEnabled('tefillin', false);
      chooseGender('male');
      expect(enabled('tefillin')).toBe(false);
      expect(enabled('shacharit')).toBe(true);
    });

    it('restores tefillin when the answer changes from woman to man', () => {
      chooseGender('female');
      chooseGender('male');
      expect(MENS_MITZVOT.map(enabled)).toEqual([true]);
    });

    it('re-choosing the same gender never touches the library', () => {
      chooseGender('female');
      useMitzvotStore.getState().setEnabled('tefillin', true);
      chooseGender('female');
      expect(enabled('tefillin')).toBe(true);
    });

    it('keeps gold for a man answering for the first time', () => {
      chooseGender('male');
      expect(user().theme).toBe('gold');
    });

    it('switches gold to pink for a woman answering for the first time', () => {
      chooseGender('female');
      expect(user().theme).toBe('pink');
    });

    it('stays inside the dark class: a woman on dark gets plum and a man on plum gets dark', () => {
      user().setTheme('dark');
      chooseGender('female');
      expect(user().theme).toBe('plum');

      chooseGender('male');
      expect(user().theme).toBe('dark');
    });

    it('moves a light palette that is not gold or pink to pink for a woman', () => {
      user().setTheme('purple');
      chooseGender('female');
      expect(user().theme).toBe('pink');
    });

    it('lets the user pick any palette after the answer and re-choosing the same gender keeps it', () => {
      chooseGender('female');
      user().setTheme('blue');

      chooseGender('female');

      expect(user().theme).toBe('blue');
    });

    it('a later change of gender sets the palette again', () => {
      chooseGender('female');
      user().setTheme('blue');

      chooseGender('male');

      expect(user().theme).toBe('gold');
    });
  });

  describe('taharahOffered', () => {
    it('is offered only to a married user who answered the gender question', () => {
      expect(taharahOffered({ gender: 'female', maritalStatus: 'married' })).toBe(true);
      expect(taharahOffered({ gender: 'male', maritalStatus: 'married' })).toBe(true);
      expect(taharahOffered({ gender: null, maritalStatus: 'married' })).toBe(false);
      expect(taharahOffered({ gender: 'female', maritalStatus: 'single' })).toBe(false);
      expect(taharahOffered({ gender: 'female', maritalStatus: null })).toBe(false);
      expect(taharahOffered({ gender: null, maritalStatus: null })).toBe(false);
    });
  });

  describe('chooseMaritalStatus', () => {
    it('stores the status', () => {
      chooseMaritalStatus('married');
      expect(user().maritalStatus).toBe('married');

      chooseMaritalStatus('single');
      expect(user().maritalStatus).toBe('single');
    });

    it('choosing single while tracking is on switches tracking off and keeps the taharah log', () => {
      user().setGender('female');
      user().setMaritalStatus('married');
      setTaharahTracking(true);
      taharah().addEvent({ type: 'onset', onah: { abs: 740000, kind: 'night' } });
      taharah().setRule('ohrZarua', true);
      expect(user().taharahEnabled).toBe(true);

      chooseMaritalStatus('single');

      expect(user().taharahEnabled).toBe(false);
      expect(user().maritalStatus).toBe('single');
      expect(taharah().events.length).toBe(1);
      expect(taharah().settings.rules.ohrZarua).toBe(true);
      expect(taharah().settings.role).toBe('woman');
    });

    it('choosing married leaves tracking as it is', () => {
      user().setGender('female');
      user().setMaritalStatus('married');
      setTaharahTracking(true);

      chooseMaritalStatus('married');
      expect(user().taharahEnabled).toBe(true);

      setTaharahTracking(false);
      chooseMaritalStatus('married');
      expect(user().taharahEnabled).toBe(false);
    });
  });

  describe('setTaharahTracking', () => {
    it('switching on sets the role from the gender and the preset from the nusach', () => {
      user().setGender('male');
      user().setMaritalStatus('married');
      user().setNusach('sefard');

      setTaharahTracking(true);

      expect(user().taharahEnabled).toBe(true);
      expect(taharah().settings.role).toBe('husband');
      expect(taharah().settings.preset).toBe('chassidic');
      expect(taharah().settings.rules).toEqual(rulesFor('chassidic'));
    });

    it('switching on as a woman with the default nusach keeps ashkenaz', () => {
      user().setGender('female');
      user().setMaritalStatus('married');

      setTaharahTracking(true);

      expect(taharah().settings.role).toBe('woman');
      expect(taharah().settings.preset).toBe('ashkenaz');
    });

    it('switching on keeps a preset the user already worked on', () => {
      taharah().setPreset('chabad');
      taharah().addEvent({ type: 'onset', onah: { abs: 740000, kind: 'night' } });
      user().setGender('female');
      user().setMaritalStatus('married');
      user().setNusach('edot_hamizrach');

      setTaharahTracking(true);

      expect(taharah().settings.preset).toBe('chabad');
      expect(taharah().settings.role).toBe('woman');
    });

    it.each([
      ['no marital status', 'female', null],
      ['a single status', 'female', 'single'],
      ['no gender', null, 'married'],
    ] as const)('switching on is ignored with %s', (_label, gender, maritalStatus) => {
      user().setGender(gender);
      user().setMaritalStatus(maritalStatus);
      user().setNusach('chabad');

      setTaharahTracking(true);

      expect(user().taharahEnabled).toBe(false);
      expect(taharah().settings).toEqual(useTaharahStore.getInitialState().settings);
    });

    it('switching off touches only the user store', () => {
      user().setGender('female');
      user().setMaritalStatus('married');
      setTaharahTracking(true);
      taharah().setRole('husband');

      setTaharahTracking(false);

      expect(user().taharahEnabled).toBe(false);
      expect(taharah().settings.role).toBe('husband');
    });

    it('switching off is never ignored', () => {
      user().setTaharahEnabled(true);

      setTaharahTracking(false);

      expect(user().taharahEnabled).toBe(false);
    });
  });

  describe('chooseNusach', () => {
    it('adopts the matching preset while tracking is on and the store is untouched', () => {
      user().setTaharahEnabled(true);

      chooseNusach('chabad');

      expect(user().nusach).toBe('chabad');
      expect(taharah().settings.preset).toBe('chabad');
      expect(taharah().settings.rules).toEqual(rulesFor('chabad'));
    });

    it('follows a second nusach choice while the store stays untouched', () => {
      user().setTaharahEnabled(true);

      chooseNusach('chabad');
      chooseNusach('edot_hamizrach');

      expect(taharah().settings.preset).toBe('sephardi_ovadia');
    });

    it('keeps the preset once an event is recorded', () => {
      user().setTaharahEnabled(true);
      taharah().addEvent({ type: 'onset', onah: { abs: 740000, kind: 'night' } });

      chooseNusach('chabad');

      expect(user().nusach).toBe('chabad');
      expect(taharah().settings.preset).toBe('ashkenaz');
    });

    it('keeps a hand-edited rule', () => {
      user().setTaharahEnabled(true);
      taharah().setRule('ohrZarua', true);

      chooseNusach('chabad');

      expect(taharah().settings.preset).toBe('ashkenaz');
      expect(taharah().settings.rules.ohrZarua).toBe(true);
    });

    it('leaves the taharah store alone while tracking is off', () => {
      chooseNusach('chabad');

      expect(user().nusach).toBe('chabad');
      expect(taharah().settings.preset).toBe('ashkenaz');
    });
  });
});

jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

import he from '../he.json';
import en from '../en.json';
import { useUserStore } from '@/stores/useUserStore';
import { t, translate, setLocale } from '../index';

describe('i18n', () => {
  it('0.4.a parity — same keys in he+en', () => {
    const heKeys = Object.keys(he).sort();
    const enKeys = Object.keys(en).sort();
    expect(heKeys).toEqual(enKeys);
    expect(heKeys.length).toBeGreaterThan(100);
  });

  it('0.4.b no key has empty value', () => {
    for (const k of Object.keys(he)) {
      expect((he as Record<string, string>)[k]).toBeTruthy();
      expect((en as Record<string, string>)[k]).toBeTruthy();
    }
  });

  it('15.7.a runtime — t("onboarding.welcomeTitle") must NOT return [missing ...] (BUG-011 regression)', () => {
    setLocale('he');
    const out = t('onboarding.welcomeTitle');
    expect(out).not.toMatch(/^\[missing/);
    expect(out).toBe((he as Record<string, string>)['onboarding.welcomeTitle']);
  });

  it('15.7.b runtime — every single translation key resolves (BUG-011 regression, all keys)', () => {
    setLocale('he');
    const broken: string[] = [];
    for (const k of Object.keys(he)) {
      const out = t(k);
      if (/^\[missing/.test(out)) broken.push(k);
    }
    expect(broken).toEqual([]);
  });

  it('15.7.c setLocale("en") resolves english keys (BUG-011 regression)', () => {
    setLocale('en');
    const out = t('onboarding.welcomeTitle');
    expect(out).not.toMatch(/^\[missing/);
    expect(out).toBe((en as Record<string, string>)['onboarding.welcomeTitle']);
  });

  it('every brand mention in the translations is the app name', () => {
    const heName = (he as Record<string, string>)['app.name'];
    const enName = (en as Record<string, string>)['app.name'];
    expect(heName).toBe('יהודי 365');
    expect(enName).toBe('Jew 365');
    const heBrand = /(^|[^\u0590-\u05FF])יהודי(?![\u0590-\u05FF])/g;
    const enBrand = /\bJew(?:ish)?\b/g;
    for (const value of Object.values(he)) {
      expect(value.match(heBrand)?.length ?? 0).toBe(value.split(heName).length - 1);
    }
    for (const value of Object.values(en)) {
      expect(value.match(enBrand)?.length ?? 0).toBe(value.split(enName).length - 1);
    }
  });
});

describe('i18n gender-aware lookup', () => {
  const heTable = he as Record<string, string>;
  const enTable = en as Record<string, string>;
  const feminineKeys = Object.keys(heTable).filter((k) => k.endsWith('.f'));

  beforeEach(() => {
    useUserStore.setState({ language: 'he', gender: null });
  });

  afterAll(() => {
    useUserStore.setState({ language: 'he', gender: null });
  });

  it('every .f key has a base key and says something different in Hebrew', () => {
    expect(feminineKeys.length).toBeGreaterThan(0);
    for (const k of feminineKeys) {
      const base = k.slice(0, -2);
      expect(heTable[base]).toBeTruthy();
      expect(heTable[k]).not.toBe(heTable[base]);
      expect(enTable[k]).toBe(enTable[base]);
    }
  });

  it('a female user reads the .f variant', () => {
    useUserStore.setState({ gender: 'female' });
    expect(t('onboarding.registerTitle')).toBe(heTable['onboarding.registerTitle.f']);
    expect(t('onboarding.registerTitle')).not.toBe(heTable['onboarding.registerTitle']);
    expect(t('checkin.banner', { in: 'x', deadline: 'y' })).toBe('סמני מה עשית x, עד y');
  });

  it('a male or unanswered user reads the base key', () => {
    expect(t('onboarding.registerTitle')).toBe(heTable['onboarding.registerTitle']);
    useUserStore.setState({ gender: 'male' });
    expect(t('onboarding.registerTitle')).toBe(heTable['onboarding.registerTitle']);
  });

  it('a key without a .f variant is unchanged for a female user', () => {
    useUserStore.setState({ gender: 'female' });
    expect(t('home.quick.skipToday')).toBe(heTable['home.quick.skipToday']);
  });

  it('a .f key called directly returns itself', () => {
    for (const gender of [null, 'male', 'female'] as const) {
      useUserStore.setState({ gender });
      expect(t('onboarding.registerTitle.f')).toBe(heTable['onboarding.registerTitle.f']);
    }
  });

  it('translate takes an explicit gender and ignores the store', () => {
    expect(translate('onboarding.locationTitle', undefined, 'he', 'female')).toBe(
      heTable['onboarding.locationTitle.f'],
    );
    useUserStore.setState({ gender: 'female' });
    expect(translate('onboarding.locationTitle', undefined, 'he', 'male')).toBe(heTable['onboarding.locationTitle']);
  });

  it('English follows the same lookup', () => {
    useUserStore.setState({ language: 'en', gender: 'female' });
    expect(t('onboarding.registerTitle')).toBe(enTable['onboarding.registerTitle.f']);
  });

  it('interpolates the home next-mitzvah line', () => {
    expect(t('home.nextAt', { name: 'x', time: 'y' })).toBe('x · y');
  });
});

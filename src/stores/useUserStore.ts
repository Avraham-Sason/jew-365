import { Appearance } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from './zustandMiddleware';
import { createZustandStorage } from '@/services/StorageService';
import { STORE_VERSION, migrate, onRehydrateStorage } from './persistOptions';
import { Nusach, HalachicOpinion } from '@/types/mitzvah';
import { Location } from '@/types/zmanim';
import { ChokDoubleChoice } from '@/types/chok';
import { CITIES } from '@/data/cities';
import type { LocationSource, LocationStatus } from '@/services/LocationService';
import { THEME_NAMES, ThemeName } from '@/theme/colors';

export type Language = 'he' | 'en';
export type NotificationPermissionStatus = 'unknown' | 'granted' | 'denied';
export type Gender = 'male' | 'female';
export type MaritalStatus = 'married' | 'single';
export type PrayerMode = 'minyan' | 'alone';

export const SIDDUR_FONT_SIZES = [18, 20, 22, 25, 28, 32] as const;
const DEFAULT_SIDDUR_FONT_SIZE = 22;
// Reading pace of each auto-scroll speed level, in lines per minute, slowest first.
export const SIDDUR_SCROLL_SPEEDS = [5, 7, 9, 12, 15, 19, 24, 30, 38, 48, 60, 75, 95, 120, 150] as const;
const DEFAULT_SIDDUR_SCROLL_SPEED = 5;

export function scrollSpeedLevel(level: number): number {
  if (!Number.isFinite(level)) return DEFAULT_SIDDUR_SCROLL_SPEED;
  return Math.min(SIDDUR_SCROLL_SPEEDS.length, Math.max(1, Math.round(level)));
}

type UserState = {
  nusach: Nusach;
  location: Location;
  locationStatus: LocationStatus;
  locationSource: LocationSource;
  theme: ThemeName;
  language: Language;
  notificationPermission: NotificationPermissionStatus;
  notificationsEnabled: boolean;
  profileName: string;
  profilePhone: string;
  halachicOpinions: { ksSofZman: HalachicOpinion };
  inIsrael: boolean;
  isOnboarded: boolean;
  siddurFontSize: number;
  siddurAutoScroll: boolean;
  siddurScrollSpeed: number;
  prayerMode: PrayerMode;
  hilulotEnabled: boolean;
  roshChodeshEnabled: boolean;
  weeklyReportEnabled: boolean;
  chokDoubleChoice: ChokDoubleChoice | null;
  gender: Gender | null;
  maritalStatus: MaritalStatus | null;
  taharahEnabled: boolean;
  setNusach: (n: Nusach) => void;
  setLocation: (l: Location) => void;
  setLocationState: (l: Location, status: LocationStatus, source: LocationSource) => void;
  setLocationStatus: (status: LocationStatus) => void;
  setTheme: (t: ThemeName) => void;
  setLanguage: (l: Language) => void;
  setNotificationPermission: (status: NotificationPermissionStatus) => void;
  setNotificationsEnabled: (v: boolean) => void;
  setProfileName: (v: string) => void;
  setProfilePhone: (v: string) => void;
  setKsOpinion: (o: HalachicOpinion) => void;
  setInIsrael: (v: boolean) => void;
  setOnboarded: (v: boolean) => void;
  setSiddurFontSize: (size: number) => void;
  setSiddurAutoScroll: (v: boolean) => void;
  setSiddurScrollSpeed: (level: number) => void;
  setPrayerMode: (mode: PrayerMode) => void;
  setHilulotEnabled: (v: boolean) => void;
  setRoshChodeshEnabled: (v: boolean) => void;
  setWeeklyReportEnabled: (v: boolean) => void;
  setChokDoubleChoice: (choice: ChokDoubleChoice) => void;
  setGender: (g: Gender | null) => void;
  setMaritalStatus: (m: MaritalStatus | null) => void;
  setTaharahEnabled: (v: boolean) => void;
  reset: () => void;
};

type PersistedUserState = Partial<Pick<UserState, 'taharahEnabled' | 'maritalStatus'>> & { theme?: unknown };

const DEFAULT_LOCATION = CITIES[0];
const DEFAULT_THEME: ThemeName = 'gold';

const savedThemeName = (saved: unknown): ThemeName => {
  if (THEME_NAMES.includes(saved as ThemeName)) return saved as ThemeName;
  if (saved === 'system' && Appearance.getColorScheme() === 'dark') return 'dark';
  return DEFAULT_THEME;
};

const mergeSavedUserState = (persisted: unknown, current: UserState): UserState => {
  const { theme, ...saved } = (persisted ?? {}) as PersistedUserState;
  const merged = { ...current, ...saved, theme: theme === undefined ? current.theme : savedThemeName(theme) };
  if (merged.taharahEnabled && merged.maritalStatus == null) merged.maritalStatus = 'married';
  return merged;
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      nusach: 'ashkenaz',
      location: DEFAULT_LOCATION,
      // The default city is a guess until GPS or a city pick confirms it; 'ready' claimed otherwise.
      locationStatus: 'missing',
      locationSource: 'manual',
      theme: DEFAULT_THEME,
      language: 'he',
      notificationPermission: 'unknown',
      notificationsEnabled: true,
      profileName: '',
      profilePhone: '',
      halachicOpinions: { ksSofZman: 'GRA' },
      inIsrael: true,
      isOnboarded: false,
      siddurFontSize: DEFAULT_SIDDUR_FONT_SIZE,
      siddurAutoScroll: false,
      siddurScrollSpeed: DEFAULT_SIDDUR_SCROLL_SPEED,
      prayerMode: 'minyan',
      hilulotEnabled: false,
      roshChodeshEnabled: false,
      weeklyReportEnabled: true,
      chokDoubleChoice: null,
      gender: null,
      maritalStatus: null,
      taharahEnabled: false,
      setNusach: (n) => set({ nusach: n }),
      setLocation: (l) => set({ location: l, inIsrael: l.inIsrael }),
      setLocationState: (l, status, source) =>
        set({ location: l, inIsrael: l.inIsrael, locationStatus: status, locationSource: source }),
      // Records that a lookup failed without touching the chosen location.
      setLocationStatus: (status) => set({ locationStatus: status }),
      setTheme: (t) => set({ theme: t }),
      setLanguage: (l) => set({ language: l }),
      setNotificationPermission: (status) => set({ notificationPermission: status }),
      setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
      setProfileName: (v) => set({ profileName: v }),
      setProfilePhone: (v) => set({ profilePhone: v }),
      setKsOpinion: (o) => set((s) => ({ halachicOpinions: { ...s.halachicOpinions, ksSofZman: o } })),
      setInIsrael: (v) => set({ inIsrael: v }),
      setOnboarded: (v) => set({ isOnboarded: v }),
      setSiddurFontSize: (size) => set({ siddurFontSize: size }),
      setSiddurAutoScroll: (v) => set({ siddurAutoScroll: v }),
      setSiddurScrollSpeed: (level) => set({ siddurScrollSpeed: scrollSpeedLevel(level) }),
      setPrayerMode: (mode) => set({ prayerMode: mode }),
      setHilulotEnabled: (v) => set({ hilulotEnabled: v }),
      setRoshChodeshEnabled: (v) => set({ roshChodeshEnabled: v }),
      setWeeklyReportEnabled: (v) => set({ weeklyReportEnabled: v }),
      setChokDoubleChoice: (choice) => set({ chokDoubleChoice: choice }),
      setGender: (g) => set({ gender: g }),
      setMaritalStatus: (m) => set({ maritalStatus: m }),
      setTaharahEnabled: (v) => set({ taharahEnabled: v }),
      reset: () =>
        set({
          nusach: 'ashkenaz',
          location: DEFAULT_LOCATION,
          locationStatus: 'missing',
          locationSource: 'manual',
          theme: DEFAULT_THEME,
          language: 'he',
          notificationPermission: 'unknown',
          notificationsEnabled: true,
          profileName: '',
          profilePhone: '',
          halachicOpinions: { ksSofZman: 'GRA' },
          inIsrael: true,
          isOnboarded: false,
          siddurFontSize: DEFAULT_SIDDUR_FONT_SIZE,
          siddurAutoScroll: false,
          siddurScrollSpeed: DEFAULT_SIDDUR_SCROLL_SPEED,
          prayerMode: 'minyan',
          hilulotEnabled: false,
          roshChodeshEnabled: false,
          weeklyReportEnabled: true,
          chokDoubleChoice: null,
          gender: null,
          maritalStatus: null,
          taharahEnabled: false,
        }),
    }),
    {
      name: 'user-store',
      storage: createJSONStorage(() => createZustandStorage()),
      version: STORE_VERSION,
      migrate,
      merge: mergeSavedUserState,
      onRehydrateStorage: onRehydrateStorage('user-store'),
    },
  ),
);

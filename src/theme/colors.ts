export type ThemeColors = {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  textSub: string;
  textMuted: string;
  border: string;
  gold: string;
  onGold: string;
  goldLight: string;
  goldText: string;
  goldWash: string;
  goldWashStrong: string;
  urgent: string;
  onUrgent: string;
  urgentBg: string;
  urgentBorder: string;
  warning: string;
  safe: string;
  optional: string;
  optionalBg: string;
  minyan: string;
  tabBg: string;
  shadow: string;
  shadowStrong: string;
  overlay: string;
};

export type ThemeName = 'gold' | 'pink' | 'purple' | 'blue' | 'dark' | 'plum';

export const THEME_NAMES: readonly ThemeName[] = ['gold', 'pink', 'purple', 'blue', 'dark', 'plum'];
export const DARK_THEMES: readonly ThemeName[] = ['dark', 'plum'];

export const T_LIGHT: ThemeColors = {
  bg: '#F6F1E8',
  surface: '#FFFDF9',
  surface2: '#F1EADF',
  text: '#1D2240',
  textSub: '#69645D',
  textMuted: '#6A655E',
  border: '#EBE3D6',
  gold: '#F08A3C',
  // White on this orange is 2.6:1, so the label on an orange fill is dark ink.
  onGold: '#2B1608',
  goldLight: '#FDE9D5',
  // The orange reads 2.5:1 on the card, so accent text uses this darker orange-brown.
  goldText: '#A04A0C',
  goldWash: '#F08A3C09',
  goldWashStrong: '#F08A3C18',
  urgent: '#CC2A2A',
  onUrgent: '#FFFFFF',
  urgentBg: '#FEF2F2',
  urgentBorder: '#FECACA',
  warning: '#B7791F',
  safe: '#0F9060',
  optional: '#1F5F6E',
  optionalBg: '#E8F2F4',
  minyan: '#6B3FA0',
  tabBg: '#FFFDF9',
  shadow: 'rgba(94,62,28,0.08)',
  shadowStrong: 'rgba(94,62,28,0.18)',
  overlay: 'rgba(29,34,64,0.45)',
};

export const T_PINK: ThemeColors = {
  bg: '#F8F0EE',
  surface: '#FFFDF9',
  surface2: '#F3E6E4',
  text: '#2E1D2A',
  textSub: '#6E6068',
  textMuted: '#72646C',
  border: '#EEDFDD',
  gold: '#E2617F',
  onGold: '#2A0C15',
  goldLight: '#FBE3E6',
  goldText: '#A8304F',
  goldWash: '#E2617F09',
  goldWashStrong: '#E2617F18',
  urgent: '#CC2A2A',
  onUrgent: '#FFFFFF',
  urgentBg: '#FEF2F2',
  urgentBorder: '#FECACA',
  warning: '#B7791F',
  safe: '#0F9060',
  optional: '#1F5F6E',
  optionalBg: '#E8F2F4',
  minyan: '#6B3FA0',
  tabBg: '#FFFDF9',
  shadow: 'rgba(110,40,60,0.08)',
  shadowStrong: 'rgba(110,40,60,0.18)',
  overlay: 'rgba(46,29,42,0.45)',
};

export const T_PURPLE: ThemeColors = {
  bg: '#F7F4FE',
  surface: '#FFFFFF',
  surface2: '#ECE6FA',
  text: '#261C3F',
  textSub: '#6E6686',
  textMuted: '#746C8C',
  border: '#DCD2F2',
  gold: '#7538E0',
  onGold: '#FFFFFF',
  goldLight: '#EDE4FF',
  goldText: '#7538E0',
  goldWash: '#7538E009',
  goldWashStrong: '#7538E018',
  urgent: '#CC2A2A',
  onUrgent: '#FFFFFF',
  urgentBg: '#FEF2F2',
  urgentBorder: '#FECACA',
  warning: '#B7791F',
  safe: '#0F9060',
  optional: '#1F5F6E',
  optionalBg: '#E8F2F4',
  minyan: '#0F766E',
  tabBg: '#FFFFFF',
  shadow: 'rgba(74,31,158,0.10)',
  shadowStrong: 'rgba(74,31,158,0.22)',
  overlay: 'rgba(42,19,102,0.5)',
};

export const T_BLUE: ThemeColors = {
  bg: '#F2F6FC',
  surface: '#FFFFFF',
  surface2: '#E4ECF7',
  text: '#14213D',
  textSub: '#5C6B84',
  textMuted: '#66758C',
  border: '#CDDAEB',
  gold: '#1F5FD0',
  onGold: '#FFFFFF',
  goldLight: '#DEE9FB',
  goldText: '#1F5FD0',
  goldWash: '#1F5FD009',
  goldWashStrong: '#1F5FD018',
  urgent: '#CC2A2A',
  onUrgent: '#FFFFFF',
  urgentBg: '#FEF2F2',
  urgentBorder: '#FECACA',
  warning: '#B7791F',
  safe: '#0F9060',
  optional: '#1F5F6E',
  optionalBg: '#E8F2F4',
  minyan: '#6B3FA0',
  tabBg: '#FFFFFF',
  shadow: 'rgba(27,58,128,0.10)',
  shadowStrong: 'rgba(27,58,128,0.22)',
  overlay: 'rgba(11,26,58,0.5)',
};

export const T_DARK: ThemeColors = {
  bg: '#0E1626',
  surface: '#172238',
  surface2: '#1E2B45',
  text: '#EEF1F7',
  textSub: '#9DA9BF',
  textMuted: '#A3AEC3',
  border: '#26334D',
  gold: '#F59A4A',
  onGold: '#1E1006',
  goldLight: '#3A2D26',
  goldText: '#F7A65E',
  goldWash: '#F59A4A09',
  goldWashStrong: '#F59A4A18',
  urgent: '#F45F5F',
  onUrgent: '#0E1626',
  urgentBg: '#2A1515',
  urgentBorder: '#7F1D1D',
  warning: '#FBBF24',
  safe: '#10B981',
  optional: '#8FCFDC',
  optionalBg: '#1C3646',
  minyan: '#C9A8EE',
  tabBg: '#172238',
  shadow: 'rgba(0,0,0,0.35)',
  shadowStrong: 'rgba(0,0,0,0.55)',
  overlay: 'rgba(0,0,0,0.6)',
};

export const T_PLUM: ThemeColors = {
  bg: '#1A1026',
  surface: '#261735',
  surface2: '#31204A',
  text: '#F4E9F8',
  textSub: '#BBA3CC',
  textMuted: '#C4AED3',
  border: '#3E2A56',
  gold: '#F48FBC',
  onGold: '#2A0F20',
  goldLight: '#3C2238',
  goldText: '#F48FBC',
  goldWash: '#F48FBC09',
  goldWashStrong: '#F48FBC18',
  urgent: '#FF6B6B',
  onUrgent: '#1A1026',
  urgentBg: '#3A1A24',
  urgentBorder: '#7F2A3A',
  warning: '#F5B041',
  safe: '#3DD598',
  optional: '#9DD6E8',
  optionalBg: '#1E3240',
  minyan: '#C9A8EE',
  tabBg: '#261735',
  shadow: 'rgba(0,0,0,0.35)',
  shadowStrong: 'rgba(0,0,0,0.60)',
  overlay: 'rgba(0,0,0,0.6)',
};

export const THEMES: Record<ThemeName, ThemeColors> = {
  gold: T_LIGHT,
  pink: T_PINK,
  purple: T_PURPLE,
  blue: T_BLUE,
  dark: T_DARK,
  plum: T_PLUM,
};

export const BRAND = {
  navy: T_LIGHT.text,
  gold: T_LIGHT.gold,
  onGold: T_LIGHT.onGold,
  parchment: T_LIGHT.bg,
  white: '#FFFFFF',
} as const;

export const isDarkTheme = (name: ThemeName): boolean => DARK_THEMES.includes(name);

export function paletteForGender(gender: 'male' | 'female', current: ThemeName): ThemeName {
  if (isDarkTheme(current)) return gender === 'female' ? 'plum' : 'dark';
  return gender === 'female' ? 'pink' : 'gold';
}

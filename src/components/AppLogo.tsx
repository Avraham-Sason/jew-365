import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { LOGO_ASPECT, LOGO_SVG } from './logo.generated';
import { useTheme } from '@/theme/ThemeProvider';

export type AppLogoVariant = 'mark' | 'icon' | 'wordmark';

type Props = { variant?: AppLogoVariant; size?: number };

const ON_DARK = { mark: LOGO_SVG.markOnDark, wordmark: LOGO_SVG.wordmarkOnDark } as const;

export function AppLogo({ variant = 'mark', size = 32 }: Props) {
  const { isDark } = useTheme();
  const xml = isDark && variant !== 'icon' ? ON_DARK[variant] : LOGO_SVG[variant];
  const height = size;
  const width = Math.round(size * LOGO_ASPECT[variant]);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      pointerEvents="none"
      style={{ width, height }}
    >
      <SvgXml xml={xml} width={width} height={height} />
    </View>
  );
}

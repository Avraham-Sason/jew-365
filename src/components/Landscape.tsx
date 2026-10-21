import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

type Props = { height: number };

const FAR_HILL = 'M0 190 C60 150 120 160 170 175 C230 192 280 150 340 158 C370 162 390 170 400 168 L400 300 L0 300 Z';
const MID_HILL = 'M0 215 C50 195 110 200 160 214 C220 230 270 205 330 208 C365 210 385 216 400 214 L400 300 L0 300 Z';
const NEAR_HILL = 'M0 240 C70 225 130 232 200 246 C260 258 320 236 400 240 L400 300 L0 300 Z';
const TREES =
  'M30 204 L41 238 L19 238 Z M52 214 L60 238 L44 238 Z M342 208 L352 240 L332 240 Z M362 200 L374 240 L350 240 Z M384 212 L393 240 L375 240 Z';

export function Landscape({ height }: Props) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height }}
    >
      <Svg width="100%" height={height} viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice">
        <Defs>
          <LinearGradient id="landscapeSky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity={1} />
            <Stop offset="0.55" stopColor={colors.goldLight} stopOpacity={0.9} />
            <Stop offset="1" stopColor={colors.goldLight} stopOpacity={0.6} />
          </LinearGradient>
          <RadialGradient id="landscapeSun" cx="50%" cy="58%" r="45%">
            <Stop offset="0" stopColor={colors.gold} stopOpacity={0.55} />
            <Stop offset="0.4" stopColor={colors.gold} stopOpacity={0.18} />
            <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="landscapeFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.6" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={400} height={300} fill="url(#landscapeSky)" />
        <Rect x={0} y={0} width={400} height={300} fill="url(#landscapeSun)" />
        <Path d={FAR_HILL} fill={colors.goldText} fillOpacity={0.1} />
        <Path d={MID_HILL} fill={colors.gold} fillOpacity={0.16} />
        <Path d={NEAR_HILL} fill={colors.goldText} fillOpacity={0.2} />
        <Path d={TREES} fill={colors.goldText} fillOpacity={0.24} />
        <Rect x={0} y={0} width={400} height={300} fill="url(#landscapeFade)" />
      </Svg>
    </View>
  );
}

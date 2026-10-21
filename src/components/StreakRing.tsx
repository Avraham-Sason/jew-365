import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, typography } from '@/theme/typography';
import { streakGoalProgress } from '@/utils/streakGoal';
import { useI18n } from '@/i18n';

type Props = { streak: number; size?: number };

const DISC_OPACITY = 0.72;

export function StreakRing({ streak, size = 220 }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const days = Math.max(0, Math.floor(streak));
  const stroke = Math.round(size * 0.055);
  const center = size / 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = streakGoalProgress(days);
  const one = days === 1;
  return (
    <View
      accessible
      accessibilityLabel={t(one ? 'history.streak.once' : 'history.streak', { count: days })}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={center} cy={center} r={r} fill={colors.surface} fillOpacity={DISC_OPACITY} />
        <Circle cx={center} cy={center} r={r} fill="none" stroke={colors.surface2} strokeWidth={stroke} />
        {progress > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={colors.gold}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - progress)}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>
      <View style={styles.center}>
        <Text
          style={[
            styles.number,
            { fontSize: Math.round(size * 0.29), lineHeight: Math.round(size * 0.33), color: colors.text },
          ]}
        >
          {days}
        </Text>
        <Text style={[typography.heading, { color: colors.text }]}>
          {t(one ? 'history.streakDays.once' : 'history.streakDays')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    fontFamily: fontFamilies.heebo.black,
  },
});

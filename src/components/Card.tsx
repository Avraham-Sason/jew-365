import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { shadowPresets, shadowStyle } from '@/theme/shadowStyle';
import { radius, spacing } from '@/theme/tokens';

type Props = {
  children: React.ReactNode;
  padded?: boolean;
  divided?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, padded = false, divided = false, style }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface },
        shadowStyle(colors.shadow, shadowPresets.cardSoft),
        style,
      ]}
    >
      <View style={[styles.clip, padded && styles.padded]}>
        {divided
          ? React.Children.toArray(children).map((child, index) => (
              <React.Fragment key={React.isValidElement(child) && child.key !== null ? child.key : index}>
                {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                {child}
              </React.Fragment>
            ))
          : children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
  },
  clip: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  padded: {
    padding: spacing.lg,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
  },
});

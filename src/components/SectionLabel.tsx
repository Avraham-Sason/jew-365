import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';

type Props = { text: string; count?: number; variant?: 'section' | 'field'; style?: StyleProp<TextStyle> };

export function SectionLabel({ text, count, variant = 'section', style }: Props) {
  const { colors } = useTheme();
  const section = variant === 'section';
  return (
    <Text
      accessibilityRole={section ? 'header' : undefined}
      style={[
        section ? typography.heading : typography.captionBold,
        section ? styles.section : styles.field,
        { color: section ? colors.text : colors.textSub },
        style,
      ]}
    >
      {count === undefined ? text : `${text} (${count})`}
    </Text>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  field: {
    marginBottom: spacing.sm,
  },
});

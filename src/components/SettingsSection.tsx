import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
};

export function SettingsSection({ title, subtitle, children, collapsible = false, expanded = false, onToggle }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {collapsible ? (
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          aria-expanded={expanded}
          hitSlop={6}
          style={({ pressed }) => [
            styles.header,
            { marginBottom: expanded ? spacing.md : 0, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <View style={styles.headerTitle}>
            <Text style={[typography.subheading, { color: colors.text }]}>{title}</Text>
            {subtitle ? (
              <Text style={[typography.small, styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
            ) : null}
          </View>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path
              d={expanded ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}
              stroke={colors.textSub}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      ) : (
        <View style={styles.title}>
          <Text style={[typography.subheading, { color: colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[typography.small, styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
          ) : null}
        </View>
      )}
      {collapsible && !expanded ? null : children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTitle: {
    flex: 1,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
});

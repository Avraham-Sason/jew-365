import React from 'react';
import { Linking, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';

export function ChokLicenseNotice({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[{ gap: spacing.xs }, style]}>
      <Text style={[typography.caption, { color: colors.textSub }]}>{t('chok.credit')}</Text>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{t('chok.shareAlike')}</Text>
      <Pressable
        accessibilityRole="link"
        hitSlop={8}
        onPress={() => {
          Linking.openURL(t('chok.licenseUrl')).catch(() => {});
        }}
      >
        <Text style={[typography.captionBold, { color: colors.goldText }]}>{t('chok.license')}</Text>
      </Pressable>
    </View>
  );
}

import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, ViewProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { useQuietBlock } from './ShabbatScreen';

type BottomSheetProps = {
  visible: boolean;
  title?: string;
  caption?: string;
  onClose: () => void;
  children: React.ReactNode;
};

export function BottomSheet({ visible, title, caption, onClose, children }: BottomSheetProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const quiet = useQuietBlock() !== null;

  return (
    <Modal visible={visible && !quiet} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            {title || caption ? (
              <View style={styles.heading}>
                {title ? <Text style={[typography.heading, { color: colors.text }]}>{title}</Text> : null}
                {caption ? (
                  <Text style={[typography.caption, styles.caption, { color: colors.textMuted }]}>{caption}</Text>
                ) : null}
              </View>
            ) : null}
            {children}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={[styles.closeBtn, { backgroundColor: colors.surface2 }]}
            >
              <Text style={[typography.bodyBold, { color: colors.text }]}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type SheetActionProps = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  selected?: boolean;
  onLayout?: ViewProps['onLayout'];
};

export function SheetAction({ label, onPress, destructive = false, selected = false, onLayout }: SheetActionProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityState={selected ? { selected: true } : undefined}
      style={[
        styles.action,
        { borderBottomColor: selected ? 'transparent' : colors.border },
        selected ? [styles.actionSelected, { backgroundColor: colors.goldLight }] : null,
      ]}
    >
      <Text style={[typography.subheading, { color: destructive ? colors.urgent : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  sheet: {
    borderRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  heading: {
    marginBottom: spacing.lg,
  },
  caption: {
    marginTop: spacing.xs,
  },
  closeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  action: {
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionSelected: {
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
});

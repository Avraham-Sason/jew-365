import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { useQuietBlock } from './ShabbatScreen';

type Props = {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const quiet = useQuietBlock() !== null;

  return (
    <Modal visible={visible && !quiet} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        {/* A sibling of the card, not its ancestor: a plain child View does not stop a tap reaching a parent Pressable. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessible={false} />
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[typography.heading, { color: colors.text }]}>{title}</Text>
          {body ? <Text style={[typography.body, styles.body, { color: colors.textSub }]}>{body}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.button, { backgroundColor: colors.surface2 }]}
            >
              <Text style={[typography.bodyBold, { color: colors.text }]}>{cancelLabel ?? t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              style={[
                styles.button,
                { backgroundColor: destructive ? colors.urgent : colors.gold, opacity: busy ? 0.6 : 1 },
              ]}
            >
              <Text style={[typography.bodyBold, { color: destructive ? colors.onUrgent : colors.onGold }]}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.xxl,
    padding: spacing.xl,
  },
  body: {
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    paddingVertical: spacing.md,
  },
});

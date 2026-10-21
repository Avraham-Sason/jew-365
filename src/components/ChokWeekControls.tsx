import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet, SheetAction } from '@/components/BottomSheet';
import { SegmentedControl } from '@/components/SegmentedControl';
import { spacing } from '@/theme/tokens';
import { useI18n } from '@/i18n';
import { ChokDoubleChoice, ChokSlot } from '@/types/chok';

type Props = {
  slots: readonly ChokSlot[];
  slot: ChokSlot;
  onSlot: (slot: ChokSlot) => void;
  names: readonly string[];
  choice: ChokDoubleChoice;
  onChoice: (choice: ChokDoubleChoice) => void;
  asking: boolean;
  onAskClose: () => void;
};

const CHOICES: readonly ChokDoubleChoice[] = ['first', 'second', 'both'];

export function ChokWeekControls({ slots, slot, onSlot, names, choice, onChoice, asking, onAskClose }: Props) {
  const { t } = useI18n();
  const double = names.length > 1;
  const choiceLabel = (value: ChokDoubleChoice) =>
    value === 'both' ? t('chok.both') : names[value === 'first' ? 0 : 1];
  return (
    <View style={styles.rows}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('chok.slotPicker')}>
        <SegmentedControl
          options={slots.map((value) => ({
            value,
            label: t(`chok.slotShort.${value}`),
            accessibilityLabel: t(`chok.slot.${value}`),
          }))}
          value={slot}
          onChange={onSlot}
        />
      </View>
      {double ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={t('chok.doubleWeek')}>
          <SegmentedControl
            options={CHOICES.map((value) => ({ value, label: choiceLabel(value) }))}
            value={choice}
            onChange={onChoice}
          />
        </View>
      ) : null}
      {double ? (
        <BottomSheet visible={asking} title={t('chok.askTitle')} caption={t('chok.askCaption')} onClose={onAskClose}>
          <SheetAction label={t('chok.onlyParasha', { name: names[0] })} onPress={() => onChoice('first')} />
          <SheetAction label={t('chok.onlyParasha', { name: names[1] })} onPress={() => onChoice('second')} />
          <SheetAction label={t('chok.bothParashiyot')} onPress={() => onChoice('both')} />
        </BottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: spacing.sm,
  },
});

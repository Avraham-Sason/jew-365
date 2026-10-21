import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { MitzvahIcon, type IconName } from '@/components/MitzvahIcon';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  name: IconName;
  tone?: 'accent' | 'muted' | 'done';
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_SIZE = 44;
const RADIUS_SHARE = 0.4;
const ICON_SHARE = 0.55;

export function IconTile({ name, tone = 'accent', size = DEFAULT_SIZE, style }: Props) {
  const { colors } = useTheme();
  const accent = tone === 'accent';
  const background = accent ? colors.goldLight : colors.surface2;
  return (
    <View
      accessible={false}
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: Math.round(size * RADIUS_SHARE), backgroundColor: background },
        style,
      ]}
    >
      <MitzvahIcon
        name={name}
        size={Math.round(size * ICON_SHARE)}
        color={accent ? colors.gold : colors.textMuted}
        tint={background}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});

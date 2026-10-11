import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps, BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { MitzvahIcon } from '@/components/MitzvahIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { fontFamilies, typography } from '@/theme/typography';
import { useI18n } from '@/i18n';

type TabOptionsWithHref = BottomTabNavigationOptions & { href?: string | null };

const HOME_TAB = 'home';

function HomeIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" stroke={color} strokeWidth={2.2} strokeLinejoin="round" />
    </Svg>
  );
}

function MoreIcon({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={7} height={7} rx={2} stroke={color} strokeWidth={2} />
      <Rect x={14} y={3} width={7} height={7} rx={2} stroke={color} strokeWidth={2} />
      <Rect x={3} y={14} width={7} height={7} rx={2} stroke={color} strokeWidth={2} />
      <Rect x={14} y={14} width={7} height={7} rx={2} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function HistoryIcon({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="M4 19V5M4 19H21" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Rect x={7} y={11} width={3} height={5} rx={1} stroke={color} strokeWidth={2} />
      <Rect x={12} y={8} width={3} height={8} rx={1} stroke={color} strokeWidth={2} />
      <Rect x={17} y={4} width={3} height={12} rx={1} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function SettingsIcon({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} />
      <Path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BottomTabs({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const visibleRoutes = state.routes.filter(
    (route) => route.name !== 'index' && (descriptors[route.key].options as TabOptionsWithHref).href !== null,
  );
  const labels: Record<string, string> = {
    home: t('nav.home'),
    more: t('nav.more'),
    history: t('nav.history'),
    siddur: t('nav.siddur'),
    settings: t('nav.settings'),
  };
  const icons: Record<string, (color: string) => React.ReactNode> = {
    home: (color) => <HomeIcon color={color} />,
    more: (color) => <MoreIcon color={color} />,
    history: (color) => <HistoryIcon color={color} />,
    siddur: (color) => <MitzvahIcon name="siddur" size={19} color={color} />,
    settings: (color) => <SettingsIcon color={color} />,
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.tabBg, borderTopColor: colors.tabBorder }]}>
      {visibleRoutes.map((route) => {
        const focused = state.routes[state.index]?.key === route.key;
        const color = focused ? colors.gold : colors.textMuted;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };
        const label = labels[route.name] ?? descriptors[route.key].options.title ?? route.name;
        const icon = icons[route.name];
        const home = route.name === HOME_TAB;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={styles.tab}
          >
            {home ? (
              <View
                style={[
                  styles.homeBadge,
                  {
                    backgroundColor: focused ? colors.gold : colors.goldLight,
                    borderColor: colors.tabBg,
                  },
                ]}
              >
                {icon?.(focused ? colors.onGold : colors.gold)}
              </View>
            ) : (
              icon?.(color)
            )}
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              style={[
                typography.micro,
                { color, fontFamily: focused ? fontFamilies.heebo.bold : fontFamilies.heebo.regular },
              ]}
            >
              {label}
            </Text>
            {focused ? (
              <View style={[styles.indicator, { backgroundColor: colors.gold }]} />
            ) : (
              <View style={styles.indicatorPlaceholder} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    // minHeight, not height: the label scales with the system font, so a fixed bar clips it at
    // accessibility text sizes.
    minHeight: 58,
    borderTopWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  // The home tab's raised disc: lifted above the bar's top edge, with a bar-colored ring so it
  // reads as sitting on top of the border rather than cut by it.
  homeBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.xxl,
    borderWidth: 3,
    marginTop: -14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    width: 18,
    height: 3,
    borderRadius: 2,
    marginTop: -1,
  },
  indicatorPlaceholder: {
    width: 18,
    height: 3,
    marginTop: -1,
  },
});

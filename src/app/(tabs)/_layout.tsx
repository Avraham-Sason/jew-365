import React from 'react';
import { Tabs } from 'expo-router';
import { BottomTabs } from '@/components/BottomTabs';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      initialRouteName="home"
      tabBar={(props) => <BottomTabs {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        animation: 'fade',
        lazy: false,
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      {/* Home sits in the middle of the bar and is drawn raised by BottomTabs. */}
      <Tabs.Screen name="more" />
      <Tabs.Screen name="siddur" />
      <Tabs.Screen name="home" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

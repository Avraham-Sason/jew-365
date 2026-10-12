import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ListRow } from '@/components/ListRow';
import { NavBar } from '@/components/NavBar';
import { CHOK_TEXT_ID, hasChokContent } from '@/data/chok';
import { STANDALONE_TEXTS } from '@/data/siddur';
import { useNow } from '@/hooks/useNow';
import { useUserStore } from '@/stores/useUserStore';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { chokPortionAt, chokWeekName } from '@/utils/chok';
import { useI18n } from '@/i18n';

export default function MoreScreen() {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const router = useRouter();
  const now = useNow();
  const location = useUserStore((s) => s.location);
  const inIsrael = useUserStore((s) => s.inIsrael);
  const chok = hasChokContent();
  const portion = chok ? chokPortionAt(now, location, inIsrael) : null;
  const chokCaption = portion
    ? `${t('chok.parashaOf', { name: chokWeekName(portion.parashiyot, language) })} · ${t(`chok.slot.${portion.slot}`)}`
    : t('chok.nothingToday');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <NavBar title={t('more.title')} />
      <ScrollView contentContainerStyle={styles.list}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ListRow
            icon="calendar"
            title={t('schedule.title')}
            caption={t('more.scheduleCaption')}
            chevron
            onPress={() => router.push('/schedule')}
          />
          {chok ? (
            <ListRow
              icon="chok"
              title={t('chok.title')}
              caption={chokCaption}
              chevron
              onPress={() => router.push({ pathname: '/siddur/[id]', params: { id: CHOK_TEXT_ID } })}
            />
          ) : null}
          <ListRow
            icon="tehillim"
            title={STANDALONE_TEXTS.tehillim.name[language]}
            caption={t('more.tehillimCaption')}
            chevron
            onPress={() => router.push({ pathname: '/siddur/[id]', params: { id: 'tehillim' } })}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  list: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
});

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { HDate } from '@hebcal/core';
import { DateTime } from 'luxon';
import { MITZVOT } from '@/data/mitzvot';
import {
  SIDDUR_GROUPS,
  STANDALONE_TEXTS,
  standaloneAvailability,
  hasSiddurText,
  hasStandaloneText,
  mitzvahTextId,
  siddurPlace,
  standaloneHoursAt,
  standaloneTextDay,
  standaloneTextsIn,
} from '@/data/siddur';
import { ListRow } from '@/components/ListRow';
import { iconFor } from '@/components/MitzvahIcon';
import { NavBar } from '@/components/NavBar';
import { SectionLabel } from '@/components/SectionLabel';
import { useDayModel } from '@/hooks/useDayModel';
import { useNow } from '@/hooks/useNow';
import { dateKey } from '@/stores/useCompletionsStore';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { SiddurGroup, StandaloneTextId } from '@/types/siddur';
import { currentOrNextWindow } from '@/utils/buildDayTimeline';
import { clockOf } from '@/utils/clock';
import { dayFeatures } from '@/utils/siddur';
import { useI18n } from '@/i18n';

const MITZVAH_TEXTS = MITZVOT.filter((mitzvah) => mitzvahTextId(mitzvah.id));
const PRAYER_IDS = ['shacharit', 'mincha', 'maariv'];

function CatalogSection({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.group} testID={testID}>
      <SectionLabel text={title} />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>
    </View>
  );
}

export default function SiddurScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { settings, location, nusach, inIsrael, language, nameFor } = useDayModel();
  const router = useRouter();
  const now = useNow();
  const groups = useMemo(
    () => SIDDUR_GROUPS.map((group) => ({ group, ids: standaloneTextsIn(group) })).filter(({ ids }) => ids.length),
    [],
  );
  // Keyed by each text's day number, so the clock tick re-checks availability only when a day turns.
  const dayKey = groups.flatMap(({ ids }) => ids.map((id) => standaloneTextDay(id, now, location).abs())).join(',');
  const available = useMemo(() => {
    const place = siddurPlace(location, inIsrael);
    const days = dayKey.split(',').map(Number);
    const ids = groups.flatMap((entry) => entry.ids);
    return new Map(
      ids.map((id, index) => [id, hasStandaloneText(id, nusach, dayFeatures(new HDate(days[index]), place))]),
    );
  }, [dayKey, groups, location, inIsrael, nusach]);
  const today = useMemo(() => {
    const place = siddurPlace(location, inIsrael);
    return MITZVAH_TEXTS.map((mitzvah) => {
      const window = currentOrNextWindow(mitzvah, location, settings, now);
      const hasText = window !== null && hasSiddurText(mitzvah, nusach, window.date, place);
      return { mitzvah, window, hasText, openNow: hasText && window.start.getTime() <= now.getTime() };
    }).sort(
      (a, b) =>
        (a.window?.start.getTime() ?? Number.POSITIVE_INFINITY) -
        (b.window?.start.getTime() ?? Number.POSITIVE_INFINITY),
    );
  }, [nusach, settings, inIsrael, location, now]);
  const label = (entry: { he: string; en: string }) => (language === 'en' ? entry.en : entry.he);
  // The day belongs to the instant whose clock is printed, so it is read off `start`, not off the window's date.
  const laterCaption = (start: Date) => {
    const startKey = dateKey(start);
    if (startKey === dateKey(now)) return t('siddur.today.later', { time: clockOf(start) });
    const isTomorrow = startKey === dateKey(DateTime.fromJSDate(now).plus({ days: 1 }).toJSDate());
    const day = isTomorrow ? t('common.tomorrow') : DateTime.fromJSDate(start).setLocale(language).toFormat('cccc');
    return t('siddur.today.laterOn', { day, time: clockOf(start) });
  };
  const standaloneNow = useMemo(() => {
    const place = siddurPlace(location, inIsrael);
    return groups.flatMap(({ group, ids }) =>
      ids.flatMap((id) => {
        const hours = standaloneHoursAt(id, nusach, now, location, place);
        return hours ? [{ id, group, hours }] : [];
      }),
    );
  }, [groups, nusach, now, location, inIsrael]);
  // What is said now: the mitzvah texts whose window is open and the standalone texts whose hours hold,
  // by opening time, so later windows never share the card with the one open now.
  type NowEntry =
    | { start: Date; mitzvah: (typeof today)[number]; standalone?: undefined }
    | { start: Date; standalone: (typeof standaloneNow)[number]; mitzvah?: undefined };
  const openNow: NowEntry[] = [
    ...today.filter((entry) => entry.openNow).map((entry) => ({ start: entry.window!.start, mitzvah: entry })),
    ...standaloneNow.map((entry) => ({ start: entry.hours.start, standalone: entry })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());
  const prayers = PRAYER_IDS.flatMap((id) => today.filter(({ mitzvah }) => mitzvah.id === id));

  const mitzvahRow = ({ mitzvah, window, hasText, openNow }: (typeof today)[number]) => (
    <ListRow
      key={mitzvah.id}
      icon={iconFor(mitzvah.icon)}
      iconTone={hasText ? 'accent' : 'muted'}
      title={nameFor(mitzvah)}
      caption={
        openNow ? t('siddur.today.open') : hasText && window ? laterCaption(window.start) : t('siddur.catalog.notToday')
      }
      chevron={hasText}
      onPress={() =>
        window && router.push({ pathname: '/siddur/[id]', params: { id: mitzvah.id, date: dateKey(window.date) } })
      }
      disabled={!hasText}
    />
  );

  const nowRow = (entry: NowEntry) => {
    if (entry.mitzvah) {
      const { mitzvah, window } = entry.mitzvah;
      return (
        <ListRow
          key={mitzvah.id}
          icon={iconFor(mitzvah.icon)}
          iconTone="accent"
          title={nameFor(mitzvah)}
          caption={t('siddur.now.until', { time: clockOf(window!.end) })}
          chevron
          onPress={() =>
            router.push({ pathname: '/siddur/[id]', params: { id: mitzvah.id, date: dateKey(window!.date) } })
          }
        />
      );
    }
    const { id, group, hours } = entry.standalone;
    return (
      <ListRow
        key={id}
        icon={group}
        iconTone="accent"
        title={label(STANDALONE_TEXTS[id].name)}
        caption={t('siddur.now.until', { time: clockOf(hours.end) })}
        chevron
        onPress={() => router.push({ pathname: '/siddur/[id]', params: { id } })}
      />
    );
  };

  const row = (id: StandaloneTextId, group: SiddurGroup) => {
    const { name } = STANDALONE_TEXTS[id];
    const { availableLabel } = standaloneAvailability(id, nusach);
    const open = available.get(id) ?? false;
    return (
      <ListRow
        key={id}
        icon={group}
        iconTone={open ? 'accent' : 'muted'}
        title={label(name)}
        caption={open ? undefined : availableLabel ? label(availableLabel) : t('siddur.catalog.notToday')}
        chevron={open}
        onPress={() => router.push({ pathname: '/siddur/[id]', params: { id } })}
        disabled={!open}
      />
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <NavBar
        title={t('siddur.catalog.title')}
        subtitle={`${t('siddur.catalog.subtitle')} · ${t(`nusach.${nusach}`)}`}
      />
      <ScrollView contentContainerStyle={styles.list}>
        {openNow.length > 0 && (
          <CatalogSection title={t('siddur.group.now')} testID="siddur-now">
            {openNow.map(nowRow)}
          </CatalogSection>
        )}
        <CatalogSection title={t('siddur.group.prayers')}>{prayers.map(mitzvahRow)}</CatalogSection>
        {groups.map(({ group, ids }) => (
          <CatalogSection key={group} title={t(`siddur.group.${group}`)}>
            {ids.map((id) => row(id, group))}
          </CatalogSection>
        ))}
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
  group: {
    marginBottom: spacing.xl,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
});

import React, { useEffect, useMemo, useState } from 'react';
import { InteractionManager, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useShallow } from 'zustand/react/shallow';
import { BottomSheet } from '@/components/BottomSheet';
import { formatDayLine } from '@/components/DayStepper';
import { HeaderPill, ScreenHeader } from '@/components/ScreenHeader';
import { useNow } from '@/hooks/useNow';
import { HebcalService } from '@/services/HebcalService';
import { useTaharahStore } from '@/stores/useTaharahStore';
import { useUserStore } from '@/stores/useUserStore';
import { BRAND } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { fontFamilies, typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { Onah, OnahKind, PerishaOnah } from '@/types/taharah';
import { locationNoon } from '@/utils/locationDay';
import { deriveCycle } from '@/utils/taharah/cycle';
import { civilHebrewDayAt } from '@/utils/taharah/onot';
import { perishaOnot } from '@/utils/taharah/vestot';

type Translate = (scope: string, options?: Record<string, unknown>) => string;

type DayMarks = {
  onsets: OnahKind[];
  cleanIndex: number | null;
  tevila: boolean;
  perisha: PerishaOnah[];
};

type Cell = {
  key: string;
  day: DateTime;
  inMonth: boolean;
  isToday: boolean;
  hebrewDay: number;
  marks: DayMarks | undefined;
};

const WEEKS = 6;
const SUN = '☀︎';
const MOON = '☾';

// A night onah opens at the previous day's shkia, so it is drawn on the evening cell before its own day.
const cellOf = (onah: Onah) => (onah.kind === 'night' ? onah.abs - 1 : onah.abs);
const glyphOf = (kind: OnahKind) => (kind === 'day' ? SUN : MOON);

function cellItems(marks: DayMarks, t: Translate) {
  const items: { key: string; title: string; detail: string; disputed: boolean }[] = [];
  marks.onsets.forEach((kind) =>
    items.push({
      key: `onset-${kind}`,
      title: t('taharah.event.onset'),
      detail: t(`taharah.onah.${kind}`),
      disputed: false,
    }),
  );
  if (marks.cleanIndex !== null) {
    items.push({
      key: 'clean',
      title: t('taharah.calendar.legend.clean'),
      detail: t('taharah.cleanDays.day', { index: marks.cleanIndex }),
      disputed: false,
    });
  }
  if (marks.tevila) {
    items.push({ key: 'tevila', title: t('taharah.event.tevila'), detail: t('taharah.onah.night'), disputed: false });
  }
  marks.perisha.forEach((entry) =>
    items.push({
      key: `perisha-${entry.onah.kind}`,
      title: t('taharah.task.perisha'),
      detail: [
        t(`taharah.onah.${entry.onah.kind}`),
        entry.reasons.map((reason) => t(`taharah.reason.${reason}`)).join(' · '),
      ].join(' · '),
      disputed: entry.disputed,
    }),
  );
  return items;
}

export default function TaharahCalendar() {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const router = useRouter();
  const { events, settings } = useTaharahStore(useShallow((s) => ({ events: s.events, settings: s.settings })));
  const location = useUserStore((s) => s.location);
  const husband = settings.role === 'husband';
  const now = useNow();
  const [cursor, setCursor] = useState(() => DateTime.now().startOf('month'));
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Cell | null>(null);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel?.();
  }, []);

  const marksByDay = useMemo(() => {
    const map = new Map<number, DayMarks>();
    const at = (abs: number) => {
      let marks = map.get(abs);
      if (!marks) {
        marks = { onsets: [], cleanIndex: null, tevila: false, perisha: [] };
        map.set(abs, marks);
      }
      return marks;
    };
    for (const event of events) {
      if (event.type === 'onset') at(cellOf(event.onah)).onsets.push(event.onah.kind);
    }
    const state = deriveCycle(events, settings.rules, location, now);
    if (!husband) state.cleanDays.forEach((day) => (at(day.day).cleanIndex = day.index));
    if (state.tevilaDay !== null) at(state.tevilaDay - 1).tevila = true;
    perishaOnot(events, settings.rules).forEach((entry) => at(cellOf(entry.onah)).perisha.push(entry));
    return map;
  }, [events, settings.rules, location, now, husband]);

  const weeks = useMemo(() => {
    if (!ready) return [];
    const gridStart = cursor.minus({ days: cursor.weekday % 7 });
    const cells = Array.from({ length: WEEKS * 7 }, (_, index): Cell => {
      const day = gridStart.plus({ days: index });
      const date = day.toJSDate();
      const abs = civilHebrewDayAt(locationNoon(date, location), location).abs();
      return {
        key: day.toISODate() ?? String(index),
        day,
        inMonth: day.month === cursor.month,
        isToday: day.hasSame(DateTime.fromJSDate(now), 'day'),
        hebrewDay: HebcalService.getHebrewDate(date).day,
        marks: marksByDay.get(abs),
      };
    });
    return Array.from({ length: WEEKS }, (_, week) => cells.slice(week * 7, week * 7 + 7));
  }, [ready, cursor, location, marksByDay, now]);

  const monthEmpty = ready && !weeks.some((week) => week.some((cell) => cell.inMonth && cell.marks));
  const prevArrow = language === 'he' ? '→' : '←';
  const nextArrow = language === 'he' ? '←' : '→';
  const monthLabel = (month: DateTime) => `${t(`month.${month.month - 1}`)} ${month.year}`;
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/taharah');
  };
  const items = selected?.marks ? cellItems(selected.marks, t) : [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={t('taharah.calendar.title')} onBack={close}>
        <View style={styles.monthBand}>
          <HeaderPill
            label={prevArrow}
            onPress={() => setCursor((prev) => prev.minus({ months: 1 }))}
            accessibilityLabel={monthLabel(cursor.minus({ months: 1 }))}
          />
          <Text style={[typography.captionBold, { color: colors.headerText }]}>{monthLabel(cursor)}</Text>
          <HeaderPill
            label={nextArrow}
            onPress={() => setCursor((prev) => prev.plus({ months: 1 }))}
            accessibilityLabel={monthLabel(cursor.plus({ months: 1 }))}
          />
        </View>
      </ScreenHeader>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.weekRow}>
          {Array.from({ length: 7 }).map((_, index) => (
            <Text key={index} style={[typography.micro, styles.headerCell, { color: colors.textMuted }]}>
              {t(`weekday.short.${index}`)}
            </Text>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={week[0].key} style={styles.weekRow}>
            {week.map((cell) => (
              <DayCell key={cell.key} cell={cell} onPress={() => setSelected(cell)} />
            ))}
          </View>
        ))}

        {monthEmpty ? (
          <Text style={[typography.body, styles.empty, { color: colors.textSub }]}>{t('taharah.calendar.empty')}</Text>
        ) : null}

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.onsetDot, { backgroundColor: colors.gold }]} />
            <Text style={[typography.small, { color: colors.textSub }]}>{t('taharah.event.onset')}</Text>
          </View>
          {husband ? null : (
            <View style={styles.legendItem}>
              <View style={[styles.cleanSample, { borderColor: colors.safe }]} />
              <Text style={[typography.small, { color: colors.textSub }]}>{t('taharah.calendar.legend.clean')}</Text>
            </View>
          )}
          <View style={styles.legendItem}>
            <Text style={[typography.captionBold, { color: colors.optional }]}>{MOON}</Text>
            <Text style={[typography.small, { color: colors.textSub }]}>{t('taharah.event.tevila')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.perishaBadge, { backgroundColor: colors.warning }]}>
              <Text style={[typography.micro, styles.perishaGlyph]}>
                {SUN}
                {MOON}
              </Text>
            </View>
            <Text style={[typography.small, { color: colors.textSub }]}>{t('taharah.calendar.legend.perisha')}</Text>
          </View>
        </View>
      </ScrollView>

      <BottomSheet
        visible={selected !== null}
        title={selected ? formatDayLine(selected.day.toJSDate(), language) : undefined}
        caption={selected ? HebcalService.getHebrewDate(selected.day.toJSDate()).hebrewDateStr : undefined}
        onClose={() => setSelected(null)}
      >
        {items.map((item) => (
          <View key={item.key} style={[styles.sheetRow, { borderTopColor: colors.border }]}>
            <Text style={[typography.bodyBold, { color: colors.text }]}>{item.title}</Text>
            <Text style={[typography.caption, { color: colors.textSub }]}>{item.detail}</Text>
            {item.disputed ? (
              <Text style={[typography.captionBold, { color: colors.warning }]}>{t('taharah.disputed')}</Text>
            ) : null}
          </View>
        ))}
      </BottomSheet>
    </SafeAreaView>
  );
}

function DayCell({ cell, onPress }: { cell: Cell; onPress: () => void }) {
  const { colors } = useTheme();
  const { language } = useI18n();
  const { marks, isToday } = cell;
  const clean = marks?.cleanIndex ?? null;
  const perishaKinds = new Set(marks?.perisha.map((entry) => entry.onah.kind));

  return (
    <Pressable
      onPress={onPress}
      disabled={!marks}
      accessibilityRole="button"
      accessibilityLabel={formatDayLine(cell.day.toJSDate(), language)}
      style={[
        styles.cell,
        {
          backgroundColor: isToday ? colors.goldWashStrong : colors.surface,
          borderColor: clean !== null ? colors.safe : colors.border,
          borderWidth: clean !== null ? 2 : 1,
          opacity: cell.inMonth ? 1 : 0.45,
        },
      ]}
    >
      {clean !== null ? (
        <View style={[styles.indexBadge, { backgroundColor: colors.safe }]}>
          <Text style={[typography.micro, styles.badgeText]}>{clean}</Text>
        </View>
      ) : null}
      <Text style={[typography.captionBold, { color: colors.text }]}>{cell.day.day}</Text>
      <Text style={[typography.micro, { color: colors.textMuted }]}>{cell.hebrewDay}</Text>
      <View style={styles.marks}>
        {marks?.onsets.length ? <View style={[styles.onsetDot, { backgroundColor: colors.gold }]} /> : null}
        {marks?.tevila ? <Text style={[typography.micro, { color: colors.optional }]}>{MOON}</Text> : null}
        {(['day', 'night'] as const)
          .filter((kind) => perishaKinds.has(kind))
          .map((kind) => (
            <View key={kind} style={[styles.perishaBadge, { backgroundColor: colors.warning }]}>
              <Text style={[typography.micro, styles.perishaGlyph]}>{glyphOf(kind)}</Text>
            </View>
          ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  monthBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  weekRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerCell: {
    flex: 1,
    textAlign: 'center',
  },
  cell: {
    flex: 1,
    aspectRatio: 0.85,
    borderRadius: radius.md,
    padding: spacing.xs,
    position: 'relative',
  },
  indexBadge: {
    position: 'absolute',
    top: 3,
    end: 3,
    minWidth: 15,
    height: 15,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: BRAND.white,
    fontFamily: fontFamilies.heebo.bold,
  },
  marks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 3,
    marginTop: 'auto',
  },
  onsetDot: {
    width: 7,
    height: 7,
    borderRadius: radius.sm,
  },
  perishaBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  perishaGlyph: {
    color: BRAND.white,
  },
  empty: {
    textAlign: 'center',
    paddingTop: spacing.lg,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    justifyContent: 'center',
    paddingTop: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cleanSample: {
    width: 14,
    height: 14,
    borderRadius: radius.xs,
    borderWidth: 2,
  },
  sheetRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    gap: 2,
  },
});

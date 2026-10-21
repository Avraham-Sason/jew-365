import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useShallow } from 'zustand/react/shallow';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { DayStepper, formatDayLine } from '@/components/DayStepper';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionLabel } from '@/components/SectionLabel';
import { useNow } from '@/hooks/useNow';
import { HebcalService } from '@/services/HebcalService';
import { ZmanimService } from '@/services/ZmanimService';
import { useTaharahStore } from '@/stores/useTaharahStore';
import { useUserStore } from '@/stores/useUserStore';
import { BRAND } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n';
import { BedikaResult, OnahKind, PauseReason } from '@/types/taharah';
import { TIME_PATTERN, clockOf } from '@/utils/clock';
import { locationNoon } from '@/utils/locationDay';
import { HefsekOutcome, deriveCycle, earliestTevilaNight, hefsekOutcome } from '@/utils/taharah/cycle';
import { OnahResolution, civilHebrewDayAt, currentOnah, hebrewDay, onahAt, onahIndex } from '@/utils/taharah/onot';

const LOG_TYPES = ['onset', 'hefsek', 'tevila', 'pause'] as const;
type LogType = (typeof LOG_TYPES)[number];
const HUSBAND_TYPES: readonly LogType[] = ['onset', 'tevila'];

const TYPE_LABEL: Record<LogType, string> = {
  onset: 'taharah.log.onset',
  hefsek: 'taharah.event.hefsek',
  tevila: 'taharah.log.tevila',
  pause: 'taharah.log.pause',
};

const SAVED_DELAY_MS = 700;
const ONAH_KINDS: OnahKind[] = ['day', 'night'];
const BEDIKA_RESULTS: BedikaResult[] = ['clean', 'notClean', 'doubtful'];
const PAUSE_REASONS: PauseReason[] = ['pregnancy', 'postpartum', 'menopause', 'other'];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const hebrewDateOf = (abs: number) => HebcalService.getHebrewDate(hebrewDay(abs).greg()).hebrewDateStr;
const HEFSEK_BLOCKED_KEY: Partial<Record<HefsekOutcome, string>> = {
  noCycle: 'taharah.log.hefsekNoCycle',
  tahor: 'taharah.log.hefsekAfterTevila',
  restartsCount: 'taharah.log.hefsekDuringCount',
};

export default function TaharahLog() {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const router = useRouter();
  const { type: rawType } = useLocalSearchParams<{ type?: string }>();
  const { events, settings } = useTaharahStore(useShallow((s) => ({ events: s.events, settings: s.settings })));
  const addEvent = useTaharahStore((s) => s.addEvent);
  const location = useUserStore((s) => s.location);
  const now = useNow();
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  const types: readonly LogType[] = settings.role === 'husband' ? HUSBAND_TYPES : LOG_TYPES;
  const [type, setType] = useState<LogType>(() => types.find((value) => value === rawType) ?? 'onset');
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [time, setTime] = useState(() => clockOf(new Date(), location.tz));
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [kind, setKind] = useState<OnahKind>('day');
  const [result, setResult] = useState<BedikaResult>('clean');
  // Off until she says so: the switch records what was placed, not what the custom expects.
  const [moch, setMoch] = useState(false);
  const [reason, setReason] = useState<PauseReason | null>(null);
  const [saved, setSaved] = useState(false);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/taharah');
  }, [router]);

  useEffect(() => {
    if (!saved) return undefined;
    const timeout = setTimeout(close, SAVED_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [saved, close]);

  const today = startOfDay(now);
  const isToday = date.getTime() === today.getTime();
  const dayAbs = useMemo(() => civilHebrewDayAt(locationNoon(date, location), location).abs(), [date, location]);
  const state = useMemo(
    () => deriveCycle(events, settings.rules, location, now),
    [events, settings.rules, location, now],
  );

  const instant = useMemo(() => {
    if (timeUnknown || !TIME_PATTERN.test(time)) return null;
    const [hour, minute] = time.split(':').map(Number);
    return DateTime.fromObject(
      { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour, minute },
      { zone: location.tz },
    ).toJSDate();
  }, [timeUnknown, time, date, location.tz]);

  const resolution = useMemo<OnahResolution | null>(() => {
    if (timeUnknown) return { onah: { abs: dayAbs + (kind === 'night' ? 1 : 0), kind }, doubtful: false };
    if (!instant) return null;
    return onahAt(instant, location) ?? { onah: currentOnah(instant, location), doubtful: false };
  }, [timeUnknown, kind, dayAbs, instant, location]);

  const zmanim = useMemo(() => ZmanimService.getZmanim(locationNoon(date, location), location), [date, location]);
  const shkia = zmanim?.shkia ?? null;
  const tzeit = zmanim?.tzeitHakochavim ?? null;
  const afterSunsetAt = (at: Date) => isToday && shkia !== null && at.getTime() > shkia.getTime();
  const afterSunset = type === 'hefsek' && afterSunsetAt(new Date());
  const timeInFuture = type === 'onset' && instant !== null && instant.getTime() > Date.now();

  const latestBegunOnah = useMemo(() => {
    const resolved = onahAt(now, location);
    return resolved ? onahIndex(resolved.onah) + (resolved.doubtful ? 1 : 0) : onahIndex(currentOnah(now, location));
  }, [now, location]);
  const onahInFuture =
    type === 'onset' && timeUnknown && resolution !== null && onahIndex(resolution.onah) > latestBegunOnah;

  const hefsekVerdict = type === 'hefsek' ? hefsekOutcome(state, dayAbs, result) : 'accepted';
  const hefsekEarliest =
    state.hefsekEarliestDay === null ? '' : formatDayLine(hebrewDay(state.hefsekEarliestDay).greg(), language);
  const hefsekBlockedKey = HEFSEK_BLOCKED_KEY[hefsekVerdict];
  const hefsekBlockedText =
    hefsekVerdict === 'tooEarly'
      ? t('taharah.log.hefsekTooEarly', { date: hefsekEarliest })
      : hefsekBlockedKey
        ? t(hefsekBlockedKey)
        : null;

  const isWoman = settings.role === 'woman';
  const firstTevilaNight = earliestTevilaNight(state, location);
  const tevilaNeedsHefsek = type === 'tevila' && isWoman && state.hefsekDay === null;
  const tevilaTooEarly = type === 'tevila' && isWoman && firstTevilaNight !== null && dayAbs + 1 < firstTevilaNight;
  const tevilaBeforeTzeit = type === 'tevila' && isToday && tzeit !== null && now.getTime() < tzeit.getTime();

  const canSave =
    !saved &&
    {
      onset: resolution !== null && !timeInFuture && !onahInFuture,
      hefsek: hefsekBlockedText === null && !afterSunset,
      tevila: !tevilaNeedsHefsek && !tevilaTooEarly && !tevilaBeforeTzeit,
      pause: reason !== null,
    }[type];

  const save = () => {
    if (!canSave) return;
    if (type === 'hefsek' && afterSunsetAt(new Date())) {
      refresh();
      return;
    }
    if (type === 'onset' && resolution) {
      addEvent({ type: 'onset', onah: resolution.onah, doubtful: resolution.doubtful, instant: instant?.getTime() });
    } else if (type === 'hefsek') {
      addEvent({ type: 'hefsek', day: dayAbs, result, moch });
    } else if (type === 'tevila') {
      addEvent({ type: 'tevila', day: dayAbs + 1 });
    } else if (type === 'pause' && reason) {
      addEvent({ type: 'pause', day: dayAbs, reason });
    }
    setSaved(true);
  };

  const timeInvalid = !timeUnknown && !instant;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={t('taharah.log.title')} onBack={close} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ChipRow values={types} selected={type} onSelect={setType} renderLabel={(value) => t(TYPE_LABEL[value])} />

        <SectionLabel variant="field" text={t('taharah.log.date')} style={styles.label} />
        <DayStepper value={date} onChange={setDate} max={today} />

        {type === 'onset' ? (
          <>
            <SectionLabel
              variant="field"
              text={timeUnknown ? t('taharah.log.onahChoice') : t('taharah.log.time')}
              style={styles.label}
            />
            {timeUnknown ? (
              <ChipRow
                values={ONAH_KINDS}
                selected={kind}
                onSelect={setKind}
                renderLabel={(value) => t(`taharah.onah.${value}`)}
              />
            ) : (
              <>
                <TextInput
                  value={time}
                  onChangeText={setTime}
                  placeholder="HH:mm"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.surface2,
                      color: colors.text,
                      borderColor: timeInvalid ? colors.urgent : colors.border,
                    },
                  ]}
                />
                <Text style={[typography.small, { color: colors.textMuted, marginTop: spacing.sm }]}>
                  {t('custom.timeFormatHint')}
                </Text>
              </>
            )}
            <View style={styles.switchRow}>
              <Text style={[typography.bodyBold, styles.switchLabel, { color: colors.text }]}>
                {t('taharah.log.timeUnknown')}
              </Text>
              <Switch
                value={timeUnknown}
                onValueChange={setTimeUnknown}
                thumbColor={BRAND.white}
                trackColor={{ false: colors.border, true: colors.gold }}
              />
            </View>
            {resolution ? (
              <Card padded style={styles.previewGap}>
                <Text style={[typography.bodyBold, { color: colors.text }]}>
                  {hebrewDateOf(resolution.onah.abs)} · {t(`taharah.onah.${resolution.onah.kind}`)}
                </Text>
              </Card>
            ) : null}
            {timeInFuture ? <Banner tone="urgent" text={t('taharah.log.timeInFuture')} style={styles.notice} /> : null}
            {onahInFuture ? <Banner tone="urgent" text={t('taharah.log.onahInFuture')} style={styles.notice} /> : null}
            {resolution?.doubtful ? (
              <Banner tone="warning" text={t('taharah.log.doubtfulOnset')} style={styles.notice} />
            ) : null}
          </>
        ) : null}

        {type === 'hefsek' ? (
          <>
            <SectionLabel variant="field" text={t('taharah.log.resultLabel')} style={styles.label} />
            <ChipRow
              values={BEDIKA_RESULTS}
              selected={result}
              onSelect={setResult}
              renderLabel={(value) => t(`taharah.bedika.result.${value}`)}
            />
            <View style={styles.switchRow}>
              <Text style={[typography.bodyBold, styles.switchLabel, { color: colors.text }]}>
                {t('taharah.log.moch')}
              </Text>
              <Switch
                value={moch}
                onValueChange={setMoch}
                thumbColor={BRAND.white}
                trackColor={{ false: colors.border, true: colors.gold }}
              />
            </View>
            <Text style={[typography.small, { color: colors.textMuted }]}>
              {`${t('taharah.rule.mochDachuk')}: ${t(`taharah.moch.${settings.rules.mochDachuk}`)}`}
            </Text>
            {!moch && settings.rules.mochDachuk === 'required' ? (
              <Banner tone="warning" text={t('taharah.log.mochRequired')} style={styles.notice} />
            ) : null}
            {hefsekBlockedText ? <Banner tone="urgent" text={hefsekBlockedText} style={styles.notice} /> : null}
            {hefsekVerdict === 'notClean' ? (
              <Banner tone="warning" text={t('taharah.log.hefsekNotClean')} style={styles.notice} />
            ) : null}
            {afterSunset ? (
              <Banner tone="urgent" text={t('taharah.log.hefsekAfterSunset')} style={styles.notice} />
            ) : null}
          </>
        ) : null}

        {type === 'tevila' ? (
          <>
            <Card padded style={styles.previewGap}>
              <Text style={[typography.bodyBold, { color: colors.text }]}>
                {t('taharah.onah.night')} · {hebrewDateOf(dayAbs + 1)}
              </Text>
            </Card>
            {tevilaNeedsHefsek ? (
              <Banner tone="urgent" text={t('taharah.log.tevilaNeedsHefsek')} style={styles.notice} />
            ) : null}
            {tevilaTooEarly && firstTevilaNight !== null ? (
              <Banner
                tone="urgent"
                text={t('taharah.log.tevilaTooEarly', {
                  date: formatDayLine(hebrewDay(firstTevilaNight - 1).greg(), language),
                })}
                style={styles.notice}
              />
            ) : null}
            {tevilaBeforeTzeit && tzeit !== null ? (
              <Banner
                tone="urgent"
                text={t('taharah.log.tevilaBeforeTzeit', {
                  time: clockOf(tzeit, location.tz),
                })}
                style={styles.notice}
              />
            ) : null}
          </>
        ) : null}

        {type === 'pause' ? (
          <>
            <SectionLabel variant="field" text={t('taharah.log.pauseReason')} style={styles.label} />
            <ChipRow
              values={PAUSE_REASONS}
              selected={reason}
              onSelect={setReason}
              renderLabel={(value) => t(`taharah.pause.${value}`)}
            />
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={saved ? t('taharah.log.saved') : t('common.save')}
          icon={saved ? 'check' : undefined}
          onPress={save}
          disabled={!canSave && !saved}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  label: {
    marginTop: spacing.xl,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  switchLabel: {
    flex: 1,
  },
  previewGap: {
    marginTop: spacing.md,
  },
  notice: {
    marginTop: spacing.md,
    marginBottom: 0,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
});

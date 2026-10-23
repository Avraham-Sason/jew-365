import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChokLicenseNotice } from '@/components/ChokLicenseNotice';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useI18n } from '@/i18n';
import {
  CHOK_SIZE_ESTIMATE_MB,
  CHOK_SPACE_NEEDED_MB,
  cancelChokDownload,
  checkChokUpdate,
  chokDownloadSupported,
  chokMegabytes,
  deleteChok,
  installChok,
  prepareChokDownload,
} from '@/services/ChokContentService';
import { selectChokUpdateAvailable, useChokStore } from '@/stores/useChokStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { ChokDownload, ChokManifest } from '@/types/chok';

export function chokAddonCaption(
  download: ChokDownload,
  t: (key: string, o?: Record<string, unknown>) => string,
): string {
  if (download.status === 'downloading') {
    return t('chok.addon.progressShort', { done: String(download.done), total: String(download.total) });
  }
  if (download.status === 'failed') return t('chok.addon.failedShort');
  return t('chok.addon.listCaption', { size: String(CHOK_SIZE_ESTIMATE_MB) });
}

export function useChokDownloadFlow(): {
  preparing: boolean;
  prepare: () => Promise<void>;
  dialog: React.ReactElement;
} {
  const { t } = useI18n();
  const installed = useChokStore((s) => s.installed);
  const [preparing, setPreparing] = useState(false);
  const [pending, setPending] = useState<ChokManifest | null>(null);

  const prepare = async () => {
    setPreparing(true);
    const manifest = await prepareChokDownload();
    setPreparing(false);
    setPending(manifest);
  };

  const dialog = (
    <ConfirmDialog
      visible={pending !== null}
      title={installed ? t('chok.addon.updateTitle') : t('chok.addon.downloadTitle')}
      body={t('chok.addon.downloadBody', { size: chokMegabytes(pending?.bytes ?? 0) })}
      confirmLabel={installed ? t('chok.addon.update') : t('chok.addon.downloadConfirm')}
      onConfirm={() => {
        const manifest = pending;
        setPending(null);
        if (manifest) void installChok(manifest);
      }}
      onCancel={() => setPending(null)}
    />
  );

  return { preparing, prepare, dialog };
}

export function ChokAddonCard() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const installed = useChokStore((s) => s.installed);
  const download = useChokStore((s) => s.download);
  const updateAvailable = useChokStore(selectChokUpdateAvailable);
  const { preparing, prepare, dialog } = useChokDownloadFlow();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void checkChokUpdate();
  }, []);

  const failure =
    download.status === 'failed' ? (
      <Banner
        tone="urgent"
        text={
          download.reason === 'space'
            ? t('chok.addon.error.space', { size: String(CHOK_SPACE_NEEDED_MB) })
            : t(`chok.addon.error.${download.reason}`)
        }
      />
    ) : null;

  let body: React.ReactNode;
  if (!chokDownloadSupported()) {
    body = <Text style={[typography.body, { color: colors.textSub }]}>{t('chok.addon.webOnly')}</Text>;
  } else if (download.status === 'downloading') {
    body = (
      <>
        <Text style={[typography.body, { color: colors.text }]}>
          {t('chok.addon.progress', {
            done: download.done,
            total: download.total,
            mb: chokMegabytes(download.bytes),
            totalMb: chokMegabytes(download.totalBytes),
          })}
        </Text>
        <Button variant="secondary" label={t('chok.addon.cancel')} onPress={cancelChokDownload} />
      </>
    );
  } else if (installed) {
    body = (
      <>
        <Text style={[typography.body, { color: colors.text }]}>
          {t('chok.addon.installed', { size: chokMegabytes(installed.bytes) })}
        </Text>
        {failure}
        {updateAvailable ? (
          <>
            <Banner tone="accent" text={t('chok.addon.updateAvailable')} />
            <Button label={t('chok.addon.update')} busy={preparing} onPress={prepare} />
          </>
        ) : null}
        <Button variant="danger" size="compact" label={t('chok.addon.delete')} onPress={() => setConfirmDelete(true)} />
      </>
    );
  } else {
    body = (
      <>
        <Text style={[typography.body, { color: colors.textSub }]}>{t('chok.addon.about')}</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('chok.addon.estimate', { size: String(CHOK_SIZE_ESTIMATE_MB) })}
        </Text>
        {failure}
        <Button
          label={download.status === 'failed' ? t('chok.addon.retry') : t('chok.addon.download')}
          busy={preparing}
          onPress={prepare}
        />
      </>
    );
  }

  return (
    <Card padded>
      <Text style={[typography.subheading, { color: colors.text }]}>{t('chok.addon.title')}</Text>
      <View style={{ gap: spacing.md }}>{body}</View>
      <ChokLicenseNotice style={{ marginTop: spacing.md }} />
      {dialog}
      <ConfirmDialog
        destructive
        visible={confirmDelete}
        title={t('chok.addon.deleteTitle')}
        body={t('chok.addon.deleteBody')}
        confirmLabel={t('chok.addon.deleteConfirm')}
        onConfirm={() => {
          setConfirmDelete(false);
          deleteChok();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Card>
  );
}

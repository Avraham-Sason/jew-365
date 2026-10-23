jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});
jest.mock('@/services/ChokContentService', () => ({
  ...jest.requireActual('@/services/ChokContentService'),
  prepareChokDownload: jest.fn(),
  installChok: jest.fn(async () => true),
  cancelChokDownload: jest.fn(),
  deleteChok: jest.fn(),
  checkChokUpdate: jest.fn(async () => {}),
  chokDownloadSupported: jest.fn(() => true),
}));

import { Linking } from 'react-native';
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native';
import { ChokAddonCard, chokAddonCaption } from '../ChokAddonCard';
import { t } from '@/i18n';
import {
  CHOK_SIZE_ESTIMATE_MB,
  cancelChokDownload,
  checkChokUpdate,
  chokDownloadSupported,
  deleteChok,
  installChok,
  prepareChokDownload,
} from '@/services/ChokContentService';
import { useChokStore } from '@/stores/useChokStore';
import { useUserStore } from '@/stores/useUserStore';
import { installChokFixture } from '@/testing/chok';
import { renderWithTheme } from '@/testing/render';
import type { ChokManifest } from '@/types/chok';

const prepare = jest.mocked(prepareChokDownload);
const install = jest.mocked(installChok);
const supported = jest.mocked(chokDownloadSupported);

const MANIFEST = { version: 2, bytes: 18_600_000 } as ChokManifest;

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

describe('ChokAddonCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supported.mockReturnValue(true);
    useChokStore.getState().reset();
    useUserStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    useChokStore.getState().reset();
  });

  describe('before the download', () => {
    it('describes the add-on, its size, the credit and the license', () => {
      renderWithTheme(<ChokAddonCard />);
      expect(screen.getByText(t('chok.addon.about'))).toBeOnTheScreen();
      expect(screen.getByText(`גודל: כ־${CHOK_SIZE_ESTIMATE_MB} MB`)).toBeOnTheScreen();
      expect(screen.getByText('הורדה')).toBeOnTheScreen();
      expect(screen.getByText(/מאגר תורת אמת/)).toBeOnTheScreen();
      expect(screen.getByText('לנוסח הרישיון')).toBeOnTheScreen();
    });

    it('opens the Hebrew license page from the link', () => {
      const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      renderWithTheme(<ChokAddonCard />);
      fireEvent.press(screen.getByRole('link'));
      expect(open).toHaveBeenCalledWith('https://creativecommons.org/licenses/by-nc-sa/2.5/');
      open.mockRestore();
    });

    it('opens the English license page in English', () => {
      useUserStore.setState({ language: 'en' });
      const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      renderWithTheme(<ChokAddonCard />);
      fireEvent.press(screen.getByRole('link'));
      expect(open).toHaveBeenCalledWith('https://creativecommons.org/licenses/by-nc-sa/2.5/');
      open.mockRestore();
    });

    it('asks to confirm the size after the manifest arrives, and installs it on confirm', async () => {
      prepare.mockResolvedValue({ ...MANIFEST, version: 1 });
      renderWithTheme(<ChokAddonCard />);
      await press('הורדה');
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(screen.getByText('הורדת חק לישראל')).toBeOnTheScreen();
      expect(screen.getByText(/18\.6 MB/)).toBeOnTheScreen();
      await act(async () => {
        fireEvent.press(screen.getAllByText('הורדה').at(-1)!);
      });
      expect(install).toHaveBeenCalledWith({ ...MANIFEST, version: 1 });
    });

    it('shows no dialog when the manifest could not be fetched', async () => {
      prepare.mockResolvedValue(null);
      renderWithTheme(<ChokAddonCard />);
      await press('הורדה');
      expect(screen.queryByText('הורדת חק לישראל')).toBeNull();
      expect(install).not.toHaveBeenCalled();
    });

    it('checks for a newer version once, when it mounts', () => {
      renderWithTheme(<ChokAddonCard />);
      expect(checkChokUpdate).toHaveBeenCalledTimes(1);
    });

    it('says the download is a phone feature on the web, with no button', () => {
      supported.mockReturnValue(false);
      renderWithTheme(<ChokAddonCard />);
      expect(screen.getByText('ההורדה זמינה באפליקציה בטלפון.')).toBeOnTheScreen();
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('while downloading', () => {
    it('shows the progress and cancels', () => {
      useChokStore.setState({
        download: { status: 'downloading', done: 12, total: 54, bytes: 4_000_000, totalBytes: 18_600_000 },
      });
      renderWithTheme(<ChokAddonCard />);
      expect(screen.getByText('בהורדה: 12 מתוך 54 פרשיות · 4.0 מתוך 18.6 MB')).toBeOnTheScreen();
      fireEvent.press(screen.getByText('ביטול ההורדה'));
      expect(cancelChokDownload).toHaveBeenCalledTimes(1);
    });
  });

  describe('after a failure', () => {
    it('names the offline failure and tries again', async () => {
      useChokStore.setState({ download: { status: 'failed', reason: 'offline' } });
      prepare.mockResolvedValue(null);
      renderWithTheme(<ChokAddonCard />);
      expect(screen.getByText(t('chok.addon.error.offline'))).toBeOnTheScreen();
      await press('ניסיון נוסף');
      expect(prepare).toHaveBeenCalledTimes(1);
    });

    it('names the space needed, the download and the safety margin together', () => {
      useChokStore.setState({ download: { status: 'failed', reason: 'space' } });
      renderWithTheme(<ChokAddonCard />);
      expect(screen.getByText('אין מספיק מקום פנוי במכשיר. צריך כ־69 MB.')).toBeOnTheScreen();
    });

    it('names a failed save apart from a lack of space', () => {
      useChokStore.setState({ download: { status: 'failed', reason: 'storage' } });
      renderWithTheme(<ChokAddonCard />);
      expect(screen.getByText('שמירת הטקסט במכשיר נכשלה. אפשר לנסות שוב.')).toBeOnTheScreen();
    });
  });

  describe('once installed', () => {
    it('shows the size on the device and deletes after a confirmation', async () => {
      installChokFixture();
      renderWithTheme(<ChokAddonCard />);
      expect(screen.getByText('התוסף מותקן · 18.6 MB במכשיר')).toBeOnTheScreen();
      expect(screen.queryByText('יש גרסה חדשה של הטקסט.')).toBeNull();
      await press('מחיקת התוסף');
      expect(deleteChok).not.toHaveBeenCalled();
      expect(screen.getByText('למחוק את חק לישראל?')).toBeOnTheScreen();
      expect(
        screen.getByText('הטקסט יימחק מהמכשיר והמצווה תכובה. הסימונים שכבר סימנת נשמרים, ואפשר להוריד שוב בכל עת.'),
      ).toBeOnTheScreen();
      await press('מחיקה');
      expect(deleteChok).toHaveBeenCalledTimes(1);
    });

    it('offers the update when the hosted version is newer, and confirms it first', async () => {
      installChokFixture();
      useChokStore.setState({ latestVersion: 2 });
      prepare.mockResolvedValue(MANIFEST);
      renderWithTheme(<ChokAddonCard />);
      expect(screen.getByText('יש גרסה חדשה של הטקסט.')).toBeOnTheScreen();
      await press('עדכון');
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(screen.getByText('עדכון חק לישראל')).toBeOnTheScreen();
    });
  });
});

describe('chokAddonCaption', () => {
  it('names the progress while downloading and the size otherwise', () => {
    const download = { status: 'downloading', done: 3, total: 54, bytes: 1, totalBytes: 2 } as const;
    expect(chokAddonCaption(download, t)).toBe('בהורדה: 3/54');
    expect(chokAddonCaption({ status: 'idle' }, t)).toBe(`תוסף להורדה · כ־${CHOK_SIZE_ESTIMATE_MB} MB`);
    expect(chokAddonCaption({ status: 'failed', reason: 'offline' }, t)).toBe('ההורדה נכשלה · הקישו לניסיון נוסף');
  });
});

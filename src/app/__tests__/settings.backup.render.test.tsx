jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
jest.mock('@/services/NotificationScheduler', () => ({
  NotificationScheduler: { rebuild: jest.fn(async () => {}), cancelAll: jest.fn(async () => {}) },
  requestNotificationPermissions: jest.fn(async () => true),
  syncNotificationPermissionStatus: jest.fn(async () => true),
}));
jest.mock('@/services/BackupService', () => ({
  ...(jest.requireActual('@/services/BackupService') as object),
  exportBackup: jest.fn(async () => {}),
  pickBackup: jest.fn(),
  restoreBackup: jest.fn(),
}));

import { act, fireEvent, screen } from '@testing-library/react-native';
import SettingsScreen from '../(tabs)/settings';
import { BackupError, exportBackup, pickBackup, restoreBackup, type Backup } from '@/services/BackupService';
import { translate } from '@/i18n';
import { renderWithTheme } from '@/testing/render';
import { useUserStore } from '@/stores/useUserStore';

const he = (key: string, options?: Record<string, unknown>) => translate(key, options, 'he', null);
const mockExport = jest.mocked(exportBackup);
const mockPick = jest.mocked(pickBackup);
const mockRestore = jest.mocked(restoreBackup);

const BACKUP: Backup = {
  app: 'jew-365',
  format: 1,
  createdAt: new Date(2026, 9, 14, 12).toISOString(),
  stores: { 'user-store': '{"state":{},"version":1}' },
};

async function openBackupSection() {
  renderWithTheme(<SettingsScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByText(he('settings.backup')));
}

const press = async (label: string) => {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
};

describe('Settings backup', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ isOnboarded: true, profileName: 'old name' });
    jest.clearAllMocks();
  });

  it('explains where the backup lives and offers both actions', async () => {
    await openBackupSection();

    expect(screen.getByText(he('settings.backup'))).toBeOnTheScreen();
    expect(screen.getByText(he('settings.backupHint.ios'))).toBeOnTheScreen();
    expect(screen.getByText(he('settings.backupExport'))).toBeOnTheScreen();
    expect(screen.getByText(he('settings.backupImport'))).toBeOnTheScreen();
    expect(screen.queryByText(he('settings.backupTaharah'))).toBeNull();
  });

  it('is a section of its own, closed until opened and apart from the device section', async () => {
    renderWithTheme(<SettingsScreen />);
    await act(async () => {});
    expect(screen.queryByText(he('settings.backupExport'))).toBeNull();

    fireEvent.press(screen.getByText(he('settings.device')));
    expect(screen.queryByText(he('settings.backupExport'))).toBeNull();

    fireEvent.press(screen.getByText(he('settings.backup')));
    expect(screen.getByText(he('settings.backupExport'))).toBeOnTheScreen();
  });

  it('says that taharah data stays on the phone while tracking is on', async () => {
    useUserStore.setState({ gender: 'female', maritalStatus: 'married', taharahEnabled: true });
    await openBackupSection();

    expect(screen.getByText(he('settings.backupTaharah'))).toBeOnTheScreen();
  });

  it('exports through the share sheet', async () => {
    await openBackupSection();
    await press(he('settings.backupExport'));

    expect(mockExport).toHaveBeenCalledTimes(1);
  });

  it('asks before restoring, names the backup date, and restores on confirm', async () => {
    mockPick.mockResolvedValue(BACKUP);
    mockRestore.mockImplementation(async () => {
      useUserStore.setState({ profileName: 'restored name' });
    });
    await openBackupSection();
    await press(he('settings.backupImport'));

    expect(screen.getByText(he('settings.backupConfirmTitle'))).toBeOnTheScreen();
    expect(screen.getByText(he('settings.backupConfirmBody', { date: '14 אוקטובר 2026' }))).toBeOnTheScreen();
    expect(mockRestore).not.toHaveBeenCalled();

    await press(he('settings.backupConfirmAction'));

    expect(mockRestore).toHaveBeenCalledWith(BACKUP);
    expect(screen.getByText(he('settings.backupRestored'))).toBeOnTheScreen();
    expect(screen.queryByText(he('settings.backupConfirmTitle'))).toBeNull();
  });

  it('never writes the stale name draft over the restored profile', async () => {
    mockPick.mockResolvedValue(BACKUP);
    mockRestore.mockImplementation(async () => {
      useUserStore.setState({ profileName: 'restored name' });
    });
    await openBackupSection();
    await press(he('settings.backupImport'));
    await press(he('settings.backupConfirmAction'));

    fireEvent.press(screen.getByText(he('settings.profile')));
    fireEvent.press(screen.getByText(he('settings.profile')));

    expect(useUserStore.getState().profileName).toBe('restored name');
  });

  it('restores nothing when the dialog is cancelled or the picker closed', async () => {
    mockPick.mockResolvedValueOnce(BACKUP).mockResolvedValueOnce(null);
    await openBackupSection();
    await press(he('settings.backupImport'));
    await press(he('common.cancel'));
    await press(he('settings.backupImport'));

    expect(screen.queryByText(he('settings.backupConfirmTitle'))).toBeNull();
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('explains a file that is not a backup', async () => {
    mockPick.mockRejectedValue(new BackupError('invalid'));
    await openBackupSection();
    await press(he('settings.backupImport'));

    expect(screen.getByText(he('settings.backupInvalid'))).toBeOnTheScreen();
  });

  it('explains a backup from a newer version', async () => {
    mockPick.mockRejectedValue(new BackupError('newer'));
    await openBackupSection();
    await press(he('settings.backupImport'));

    expect(screen.getByText(he('settings.backupNewer'))).toBeOnTheScreen();
  });

  it('reports a failed restore and closes the dialog', async () => {
    mockPick.mockResolvedValue(BACKUP);
    mockRestore.mockRejectedValue(new Error('disk full'));
    await openBackupSection();
    await press(he('settings.backupImport'));
    await press(he('settings.backupConfirmAction'));

    expect(screen.getByText(he('settings.backupFailed'))).toBeOnTheScreen();
    expect(screen.queryByText(he('settings.backupConfirmTitle'))).toBeNull();
  });
});

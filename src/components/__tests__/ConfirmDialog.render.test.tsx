import { Modal } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { ConfirmDialog } from '../ConfirmDialog';
import { QuietBlockContext } from '../ShabbatScreen';
import { findBackdrop, renderWithTheme } from '@/testing/render';
import { THEMES, THEME_NAMES } from '@/theme/colors';
import { radius } from '@/theme/tokens';
import { useUserStore } from '@/stores/useUserStore';
import type { HolyBlock } from '@/types/zmanim';

const QUIET_BLOCK: HolyBlock = {
  start: new Date('2026-10-09T15:00:00Z'),
  end: new Date('2026-10-10T16:00:00Z'),
  days: ['2026-10-10'],
  kind: 'shabbat',
};

function setup(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  renderWithTheme(
    <ConfirmDialog visible title="Reset?" confirmLabel="Reset" onConfirm={onConfirm} onCancel={onCancel} {...props} />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('shows the title, the body and the confirm label', () => {
    setup({ body: 'This clears every mark.' });
    expect(screen.getByText('Reset?')).toBeOnTheScreen();
    expect(screen.getByText('This clears every mark.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeOnTheScreen();
  });

  it('draws both buttons as pills', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Reset' })).toHaveStyle({ borderRadius: radius.full });
    expect(screen.getByRole('button', { name: 'ביטול' })).toHaveStyle({ borderRadius: radius.full });
  });

  it('renders no body line when body is omitted', () => {
    setup();
    expect(screen.queryByText('This clears every mark.')).toBeNull();
  });

  it('defaults the cancel label to common.cancel in Hebrew', () => {
    setup();
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeOnTheScreen();
  });

  it('defaults the cancel label to common.cancel in English', () => {
    useUserStore.setState({ language: 'en' });
    setup();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeOnTheScreen();
  });

  it('prefers an explicit cancelLabel over the default', () => {
    setup({ cancelLabel: 'Keep' });
    expect(screen.getByRole('button', { name: 'Keep' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'ביטול' })).toBeNull();
  });

  it('fires onConfirm once and not onCancel when confirm is pressed', () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Reset' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('fires onCancel once and not onConfirm when cancel is pressed', () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'ביטול' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels on a backdrop tap', () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.press(findBackdrop());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels on Android back', () => {
    const { onCancel } = setup();
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each(THEME_NAMES)('%s: a destructive confirm is an urgent fill with onUrgent text', (name) => {
    useUserStore.setState({ theme: name });
    const colors = THEMES[name];
    setup({ destructive: true });
    expect(screen.getByRole('button', { name: 'Reset' })).toHaveStyle({ backgroundColor: colors.urgent });
    expect(screen.getByText('Reset')).toHaveStyle({ color: colors.onUrgent });
  });

  it.each(THEME_NAMES)('%s: a plain confirm is a gold fill with onGold text', (name) => {
    useUserStore.setState({ theme: name });
    const colors = THEMES[name];
    setup();
    expect(screen.getByRole('button', { name: 'Reset' })).toHaveStyle({ backgroundColor: colors.gold });
    expect(screen.getByText('Reset')).toHaveStyle({ color: colors.onGold });
  });

  it('disables both buttons while busy and ignores their taps', () => {
    const { onConfirm, onCancel } = setup({ busy: true });
    const confirm = screen.getByRole('button', { name: 'Reset' });
    const cancel = screen.getByRole('button', { name: 'ביטול' });
    expect(confirm).toBeDisabled();
    expect(cancel).toBeDisabled();
    expect(confirm).toHaveStyle({ opacity: 0.6 });
    fireEvent.press(confirm);
    fireEvent.press(cancel);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps both buttons enabled when not busy', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeEnabled();
  });

  it('renders nothing while visible is false', () => {
    setup({ visible: false });
    expect(screen.queryByText('Reset?')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing inside a quiet block even when visible is true', () => {
    renderWithTheme(
      <QuietBlockContext.Provider value={QUIET_BLOCK}>
        <ConfirmDialog visible title="Reset?" confirmLabel="Reset" onConfirm={jest.fn()} onCancel={jest.fn()} />
      </QuietBlockContext.Provider>,
    );
    expect(screen.queryByText('Reset?')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

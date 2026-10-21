import { screen } from '@testing-library/react-native';
import { ShabbatScreen } from '../ShabbatScreen';
import { IconTile } from '../IconTile';
import { renderWithTheme } from '@/testing/render';
import { THEMES } from '@/theme/colors';
import { useUserStore } from '@/stores/useUserStore';
import { clockOf } from '@/utils/clock';
import type { HolyBlock } from '@/types/zmanim';

const BLOCK: HolyBlock = {
  start: new Date(2026, 10, 13, 16),
  end: new Date(2026, 10, 14, 18),
  days: ['2026-11-14'],
  kind: 'shabbat',
};

describe('ShabbatScreen', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ language: 'he' });
  });

  it('renders nothing outside a block', () => {
    const { toJSON } = renderWithTheme(<ShabbatScreen block={null} />);
    expect(toJSON()).toBeNull();
  });

  it('puts the exit time in a goldLight pill', () => {
    renderWithTheme(<ShabbatScreen block={BLOCK} />);
    expect(screen.getByText('שבת שלום')).toBeOnTheScreen();
    expect(screen.getByTestId('shabbat-until')).toHaveStyle({
      backgroundColor: THEMES.gold.goldLight,
      borderRadius: 999,
    });
    expect(screen.getByText(`צאת השבת ${clockOf(BLOCK.end)}`)).toHaveStyle({ color: THEMES.gold.goldText });
  });

  it('draws the candles emblem at 72 points', () => {
    renderWithTheme(<ShabbatScreen block={BLOCK} />);
    expect(screen.UNSAFE_getByType(IconTile).props).toMatchObject({ name: 'candles', size: 72 });
  });
});

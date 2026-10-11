import { fireEvent, screen } from '@testing-library/react-native';
import { ChokWeekControls } from '../ChokWeekControls';
import { renderWithTheme } from '@/testing/render';
import { useUserStore } from '@/stores/useUserStore';
import { CHOK_SLOTS } from '@/utils/chok';
import { ChokDoubleChoice, ChokSlot } from '@/types/chok';

type Overrides = Partial<{
  slots: readonly ChokSlot[];
  slot: ChokSlot;
  onSlot: (slot: ChokSlot) => void;
  names: string[];
  choice: ChokDoubleChoice;
  onChoice: (choice: ChokDoubleChoice) => void;
  asking: boolean;
}>;

function renderControls(overrides: Overrides = {}) {
  return renderWithTheme(
    <ChokWeekControls
      slots={CHOK_SLOTS}
      slot="sun"
      onSlot={jest.fn()}
      names={['ויקהל']}
      choice="first"
      onChoice={jest.fn()}
      asking={false}
      onAskClose={jest.fn()}
      {...overrides}
    />,
  );
}

describe('ChokWeekControls', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('draws one radio per slot, named by the full day, with the current slot selected', () => {
    renderControls({ slot: 'thuNight' });
    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(screen.getByRole('radio', { name: 'ליל שישי' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'יום ראשון' })).not.toBeSelected();
    expect(screen.getByText('ליל ו׳')).toBeOnTheScreen();
  });

  it('reports the slot pressed', () => {
    const onSlot = jest.fn();
    renderControls({ onSlot });
    fireEvent.press(screen.getByRole('radio', { name: 'יום שישי' }));
    expect(onSlot).toHaveBeenCalledTimes(1);
    expect(onSlot).toHaveBeenCalledWith('fri');
  });

  it('draws only the slots it is given: Vezot Haberakhah has no Friday', () => {
    renderControls({ slots: CHOK_SLOTS.filter((slot) => slot !== 'fri') });
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.queryByRole('radio', { name: 'יום שישי' })).toBeNull();
  });

  it('adds the choice between the two parashiyot only in a double week', () => {
    const onChoice = jest.fn();
    renderControls({ names: ['ויקהל', 'פקודי'], choice: 'both', onChoice });
    expect(screen.getAllByRole('radio')).toHaveLength(10);
    expect(screen.getByRole('radio', { name: 'שתיהן' })).toBeSelected();
    fireEvent.press(screen.getByRole('radio', { name: 'פקודי' }));
    expect(onChoice).toHaveBeenCalledWith('second');
  });

  it('asks in a sheet with the three choices', () => {
    const onChoice = jest.fn();
    renderControls({ names: ['ויקהל', 'פקודי'], asking: true, onChoice });
    expect(screen.getByText('השבוע שתי פרשיות')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'רק פרשת ויקהל' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'רק פרשת פקודי' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'שתיהן, זו אחר זו' }));
    expect(onChoice).toHaveBeenCalledWith('both');
  });

  it('never asks in a week of one parasha', () => {
    renderControls({ asking: true });
    expect(screen.queryByText('השבוע שתי פרשיות')).toBeNull();
  });

  it('names the slots in English', () => {
    useUserStore.setState({ language: 'en' });
    renderControls();
    expect(screen.getByRole('radio', { name: 'Thursday night' })).toBeOnTheScreen();
    expect(screen.getByText('Night')).toBeOnTheScreen();
  });
});

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));

import { fireEvent, screen, within } from '@testing-library/react-native';
import CustomMitzvahScreen from '../custom-mitzvah';
import { MitzvahIcon } from '@/components/MitzvahIcon';
import { renderWithTheme } from '@/testing/render';
import { useCustomMitzvotStore } from '@/stores/useCustomMitzvotStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import { useUserStore } from '@/stores/useUserStore';
import { THEMES } from '@/theme/colors';

const DELETE_REMINDER = 'מחיקת התראה';
const ADD_REMINDER = 'הוסף התראה';
const SAVE = 'שמור';
const DELETE = 'מחק מצווה';
const STORED_ID = 'custom_1800000000000_abc';

function renderForm(params: Record<string, string> = {}) {
  mockParams = params;
  return renderWithTheme(<CustomMitzvahScreen />);
}

describe('Custom mitzvah form', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    useUserStore.setState({ language: 'he' });
    useCustomMitzvotStore.getState().reset();
    useMitzvotStore.getState().reset();
    mockBack.mockReset();
  });

  it('adds a reminder from the plus button', () => {
    renderForm();
    expect(screen.getAllByRole('button', { name: DELETE_REMINDER })).toHaveLength(1);
    const add = screen.getByRole('button', { name: ADD_REMINDER });
    expect(within(add).UNSAFE_getByType(MitzvahIcon).props.name).toBe('plus');
    expect(screen.queryByText(/^\+ /)).toBeNull();
    fireEvent.press(add);
    expect(screen.getAllByRole('button', { name: DELETE_REMINDER })).toHaveLength(2);
  });

  it('draws the reminder delete as a compact danger button', () => {
    renderForm();
    expect(screen.getAllByRole('button', { name: DELETE_REMINDER })[0]).toHaveStyle({
      backgroundColor: THEMES.gold.urgentBg,
      minHeight: 40,
    });
  });

  it('saves from a primary button and deletes from a danger one', () => {
    renderForm();
    expect(screen.getByRole('button', { name: SAVE })).toHaveStyle({ backgroundColor: THEMES.gold.gold });
    expect(screen.queryByRole('button', { name: DELETE })).toBeNull();
    screen.unmount();

    useCustomMitzvotStore.getState().add({
      id: STORED_ID,
      name: 'לימוד',
      startHHMM: '08:00',
      endHHMM: '12:00',
      reminders: [],
      skipOn: [],
      createdAt: 1800000000000,
    });
    renderForm({ id: STORED_ID });
    expect(screen.getByRole('button', { name: DELETE })).toHaveStyle({ backgroundColor: THEMES.gold.urgentBg });
  });
});

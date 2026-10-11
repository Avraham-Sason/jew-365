import { Keyboard } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { PICKER_HOURS, PICKER_MINUTES, TimeField, normalizeTimeInput } from '../TimeField';
import { renderWithTheme } from '@/testing/render';
import { t } from '@/i18n';
import { useUserStore } from '@/stores/useUserStore';

const LABEL = 'Start time';
const CHIP_NAME = /^\d\d$/;

function renderField(value: string, onChange = jest.fn()) {
  renderWithTheme(<TimeField label={LABEL} value={value} onChange={onChange} />);
  return onChange;
}

function openPicker() {
  fireEvent.press(screen.getByRole('button', { name: t('custom.pickTime') }));
}

function selectedChips() {
  return screen.getAllByRole('button', { name: CHIP_NAME }).filter((chip) => chip.props.accessibilityState?.selected);
}

describe('normalizeTimeInput', () => {
  it.each([
    ['0830', '08:30'],
    ['083', '08:3'],
    ['8:3', '8:3'],
    ['ab12', '12'],
    ['12:3:0', '12:30'],
    ['123456', '12:34'],
    ['', ''],
    ['08', '08'],
    ['08:30', '08:30'],
    ['0 8-3.0', '08:30'],
  ])('%j becomes %j', (raw, expected) => {
    expect(normalizeTimeInput(raw)).toBe(expected);
  });
});

describe('picker values', () => {
  it('offers every hour of the day and every fifth minute', () => {
    expect(PICKER_HOURS).toEqual(Array.from({ length: 24 }, (_, hour) => hour));
    expect(PICKER_MINUTES).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });
});

describe('TimeField', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('shows the label and the current value in a text input named by the label', () => {
    renderField('08:30');
    expect(screen.getByText(LABEL)).toBeOnTheScreen();
    expect(screen.getByLabelText(LABEL)).toHaveDisplayValue('08:30');
  });

  it('reports typed letters as an empty value', () => {
    const onChange = renderField('');
    fireEvent.changeText(screen.getByLabelText(LABEL), 'abc');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('inserts the colon after the second digit of what is typed', () => {
    const onChange = renderField('');
    fireEvent.changeText(screen.getByLabelText(LABEL), '0930');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('09:30');
  });

  it('limits the input to five characters', () => {
    renderField('');
    expect(screen.getByLabelText(LABEL).props.maxLength).toBe(5);
  });

  it('dismisses the keyboard when the pick button opens the picker', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    try {
      renderField('08:30');
      expect(dismiss).not.toHaveBeenCalled();
      openPicker();
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: '09' })).toBeOnTheScreen();
    } finally {
      dismiss.mockRestore();
    }
  });

  it('keeps the picker closed until the pick button is pressed', () => {
    renderField('08:30');
    expect(screen.queryByRole('button', { name: '09' })).toBeNull();
    openPicker();
    expect(screen.getByRole('button', { name: '09' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '45' })).toBeOnTheScreen();
  });

  it('draws one chip per hour and one per minute step', () => {
    renderField('');
    openPicker();
    expect(screen.getAllByRole('button', { name: CHIP_NAME })).toHaveLength(
      PICKER_HOURS.length + PICKER_MINUTES.length,
    );
  });

  it('writes the chosen hour and keeps the current minute', () => {
    const onChange = renderField('08:30');
    openPicker();
    fireEvent.press(screen.getByRole('button', { name: '09' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('09:30');
  });

  it('writes the chosen minute and keeps the current hour', () => {
    const onChange = renderField('08:30');
    openPicker();
    fireEvent.press(screen.getByRole('button', { name: '45' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('08:45');
  });

  it('starts the minute at 00 when it picks an hour for an empty value', () => {
    const onChange = renderField('');
    openPicker();
    fireEvent.press(screen.getByRole('button', { name: '07' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('07:00');
  });

  it('starts the hour at 00 when it picks a minute for an empty value', () => {
    const onChange = renderField('');
    openPicker();
    fireEvent.press(screen.getByRole('button', { name: '45' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('00:45');
  });

  it('keeps a minute that is not a multiple of five when it picks an hour', () => {
    const onChange = renderField('08:33');
    openPicker();
    fireEvent.press(screen.getByRole('button', { name: '09' }));
    expect(onChange).toHaveBeenCalledWith('09:33');
  });

  it('selects the hour and the minute chip of the current value', () => {
    renderField('08:30');
    openPicker();
    expect(screen.getByRole('button', { name: '08' })).toBeSelected();
    expect(screen.getByRole('button', { name: '30' })).toBeSelected();
    expect(screen.getByRole('button', { name: '09' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: '45' })).not.toBeSelected();
    expect(selectedChips()).toHaveLength(2);
  });

  it('selects no minute chip when the minute is not a multiple of five', () => {
    renderField('08:33');
    openPicker();
    expect(screen.getByRole('button', { name: '08' })).toBeSelected();
    expect(selectedChips()).toHaveLength(1);
  });

  it.each(['', '8:3', '25:00', '08:61'])('selects no chip for the invalid value %j', (value) => {
    renderField(value);
    openPicker();
    expect(selectedChips()).toHaveLength(0);
  });

  it('stays open after a pick and closes with the sheet Close button', () => {
    renderField('08:30');
    openPicker();
    fireEvent.press(screen.getByRole('button', { name: '09' }));
    expect(screen.getByRole('button', { name: '45' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: t('common.close') }));
    expect(screen.queryByRole('button', { name: '45' })).toBeNull();
  });

  it('titles the sheet with the field label', () => {
    renderField('08:30');
    expect(screen.getAllByText(LABEL)).toHaveLength(1);
    openPicker();
    expect(screen.getAllByText(LABEL)).toHaveLength(2);
  });
});

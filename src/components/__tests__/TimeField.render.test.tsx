import React from 'react';
import { I18nManager, Keyboard, Platform, StyleSheet } from 'react-native';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { PICKER_HOURS, PICKER_MINUTES, TimeField, normalizeTimeInput } from '../TimeField';
import { WHEEL_ITEM_HEIGHT } from '../WheelPicker';
import { renderWithTheme } from '@/testing/render';
import { t } from '@/i18n';
import { useUserStore } from '@/stores/useUserStore';

const LABEL = 'Start time';
const ROW_NAME = /^\d\d$/;
const ROW_OR_COLON = /^(\d\d|:)$/;

function renderField(value: string, onChange = jest.fn()) {
  renderWithTheme(<TimeField label={LABEL} value={value} onChange={onChange} />);
  return onChange;
}

const field = () => screen.getByRole('button', { name: LABEL });
const sheetInput = () => screen.getByLabelText(t('custom.typeTime'));
const closeSheet = () => fireEvent.press(screen.getByRole('button', { name: t('common.close') }));

function openPicker() {
  fireEvent.press(field());
}

const hourWheel = () => screen.getByLabelText(t('custom.pickHour'));
const minuteWheel = () => screen.getByLabelText(t('custom.pickMinute'));

function scrollWheelTo(wheel: ReturnType<typeof hourWheel>, index: number) {
  fireEvent(wheel, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 0, y: index * WHEEL_ITEM_HEIGHT } } });
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
  it('offers every hour of the day and every minute of the hour', () => {
    expect(PICKER_HOURS).toEqual(Array.from({ length: 24 }, (_, hour) => hour));
    expect(PICKER_MINUTES).toEqual(Array.from({ length: 60 }, (_, minute) => minute));
  });
});

describe('wheel order', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const wheelNames = () => screen.getAllByRole('adjustable').map((wheel) => wheel.props.accessibilityLabel);
  const colonPosition = () => screen.getAllByText(ROW_OR_COLON).findIndex((node) => node.props.children === ':');
  const HOURS_FIRST = () => [t('custom.pickHour'), t('custom.pickMinute')];
  const MINUTES_FIRST = () => [t('custom.pickMinute'), t('custom.pickHour')];

  it('puts the hour wheel first, then the colon, then the minutes when the layout is not mirrored', () => {
    jest.replaceProperty(I18nManager, 'isRTL', false);
    renderField('08:30');
    openPicker();
    expect(wheelNames()).toEqual(HOURS_FIRST());
    expect(colonPosition()).toBe(PICKER_HOURS.length);
  });

  it('puts the minute wheel first, then the colon, then the hours when native RTL mirrors the row', () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);
    renderField('08:30');
    openPicker();
    expect(wheelNames()).toEqual(MINUTES_FIRST());
    expect(colonPosition()).toBe(PICKER_MINUTES.length);
  });

  it('still writes the hour and the minute to the right place when the wheels are reversed', () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);
    const onChange = renderField('08:30');
    openPicker();
    scrollWheelTo(hourWheel(), 9);
    scrollWheelTo(minuteWheel(), 45);
    expect(onChange).toHaveBeenNthCalledWith(1, '09:30');
    expect(onChange).toHaveBeenNthCalledWith(2, '08:45');
  });

  it.each([
    ['he', MINUTES_FIRST],
    ['en', HOURS_FIRST],
  ] as const)('on web the %s document direction decides the order, not I18nManager.isRTL', (language, expected) => {
    jest.replaceProperty(Platform, 'OS', 'web');
    jest.replaceProperty(I18nManager, 'isRTL', false);
    useUserStore.setState({ language });
    renderField('08:30');
    openPicker();
    expect(wheelNames()).toEqual(expected());
  });

  it('on web ignores a stale native isRTL when the language is English', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    jest.replaceProperty(I18nManager, 'isRTL', true);
    useUserStore.setState({ language: 'en' });
    renderField('08:30');
    openPicker();
    expect(wheelNames()).toEqual(HOURS_FIRST());
  });
});

describe('TimeField', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  describe('the field', () => {
    it('shows the label above one button named by it that holds the current value', () => {
      renderField('08:30');
      expect(screen.getByText(LABEL)).toBeOnTheScreen();
      expect(field()).toHaveAccessibilityValue({ text: '08:30' });
      expect(within(field()).getByText('08:30')).toBeOnTheScreen();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('draws no text input until the sheet is open', () => {
      renderField('08:30');
      expect(screen.queryByLabelText(t('custom.typeTime'))).toBeNull();
      expect(screen.queryByDisplayValue('08:30')).toBeNull();
    });

    it('shows the placeholder for an empty value', () => {
      renderField('');
      expect(within(field()).getByText('HH:MM')).toBeOnTheScreen();
      expect(field().props.accessibilityValue).toEqual({ text: '' });
    });

    it('draws a value in the text colour and the placeholder in a different one', () => {
      const first = renderWithTheme(<TimeField label={LABEL} value="08:30" onChange={jest.fn()} />);
      const valueColor = StyleSheet.flatten(within(field()).getByText('08:30').props.style).color;
      first.unmount();
      renderWithTheme(<TimeField label={LABEL} value="" onChange={jest.fn()} />);
      const placeholderColor = StyleSheet.flatten(within(field()).getByText('HH:MM').props.style).color;
      expect(placeholderColor).not.toBe(valueColor);
    });

    it('dismisses the keyboard and opens the sheet when it is pressed', () => {
      const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
      try {
        renderField('08:30');
        expect(dismiss).not.toHaveBeenCalled();
        expect(screen.queryByLabelText(t('custom.pickHour'))).toBeNull();
        openPicker();
        expect(dismiss).toHaveBeenCalledTimes(1);
        expect(hourWheel()).toBeOnTheScreen();
      } finally {
        dismiss.mockRestore();
      }
    });

    it('keeps the picker closed until the field is pressed', () => {
      renderField('08:30');
      expect(screen.queryByLabelText(t('custom.pickHour'))).toBeNull();
      expect(screen.queryByLabelText(t('custom.pickMinute'))).toBeNull();
      openPicker();
      expect(hourWheel()).toBeOnTheScreen();
      expect(minuteWheel()).toBeOnTheScreen();
    });

    it('titles the sheet with the field label', () => {
      renderField('08:30');
      expect(screen.getAllByText(LABEL)).toHaveLength(1);
      openPicker();
      expect(screen.getAllByText(LABEL)).toHaveLength(2);
    });
  });

  describe('typing in the sheet', () => {
    it('starts the sheet input at the current value', () => {
      renderField('08:30');
      openPicker();
      expect(sheetInput()).toHaveDisplayValue('08:30');
    });

    it('starts the sheet input empty, with the placeholder, for an empty value', () => {
      renderField('');
      openPicker();
      expect(sheetInput()).toHaveDisplayValue('');
      expect(sheetInput().props.placeholder).toBe('HH:MM');
    });

    it('captions the sheet input with the typing label', () => {
      renderField('08:30');
      openPicker();
      expect(screen.getByText(t('custom.typeTime'))).toBeOnTheScreen();
    });

    it('inserts the colon after the second digit and reports the full time once', () => {
      const onChange = renderField('');
      openPicker();
      fireEvent.changeText(sheetInput(), '0930');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('09:30');
      expect(sheetInput()).toHaveDisplayValue('09:30');
    });

    it('reports nothing for a partial time and keeps what was typed in the input', () => {
      const onChange = renderField('08:30');
      openPicker();
      fireEvent.changeText(sheetInput(), '09');
      expect(onChange).not.toHaveBeenCalled();
      expect(sheetInput()).toHaveDisplayValue('09');
      fireEvent.changeText(sheetInput(), '093');
      expect(onChange).not.toHaveBeenCalled();
      expect(sheetInput()).toHaveDisplayValue('09:3');
    });

    it('reports nothing for letters', () => {
      const onChange = renderField('08:30');
      openPicker();
      fireEvent.changeText(sheetInput(), 'abc');
      expect(onChange).not.toHaveBeenCalled();
      expect(sheetInput()).toHaveDisplayValue('');
    });

    it.each(['2500', '0861'])('reports nothing for the impossible time %j', (typed) => {
      const onChange = renderField('08:30');
      openPicker();
      fireEvent.changeText(sheetInput(), typed);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('limits the sheet input to five characters', () => {
      renderField('');
      openPicker();
      expect(sheetInput().props.maxLength).toBe(5);
    });

    it('never focuses the sheet input by itself', () => {
      renderField('');
      openPicker();
      expect(sheetInput().props.autoFocus).toBeFalsy();
    });

    it('shows the time a wheel settles on in the sheet input', () => {
      const onChange = renderField('08:30');
      openPicker();
      scrollWheelTo(hourWheel(), 9);
      expect(onChange).toHaveBeenCalledWith('09:30');
      expect(sheetInput()).toHaveDisplayValue('09:30');
    });

    it('replaces a partial draft with the time a wheel settles on', () => {
      renderField('08:30');
      openPicker();
      fireEvent.changeText(sheetInput(), '1');
      scrollWheelTo(minuteWheel(), 15);
      expect(sheetInput()).toHaveDisplayValue('08:15');
    });

    it('shows the current value again when the sheet reopens after a partial draft', () => {
      const onChange = renderField('08:30');
      openPicker();
      fireEvent.changeText(sheetInput(), '09');
      closeSheet();
      expect(onChange).not.toHaveBeenCalled();
      openPicker();
      expect(sheetInput()).toHaveDisplayValue('08:30');
    });

    it('opens on a value the caller changed while the sheet was closed', () => {
      const onChange = jest.fn();
      const { rerender } = renderWithTheme(<TimeField label={LABEL} value="08:30" onChange={onChange} />);
      openPicker();
      closeSheet();
      rerender(<TimeField label={LABEL} value="21:15" onChange={onChange} />);
      openPicker();
      expect(sheetInput()).toHaveDisplayValue('21:15');
    });

    it('moves the wheels and the field to a time that was typed', () => {
      const Controlled = () => {
        const [value, setValue] = React.useState('08:30');
        return <TimeField label={LABEL} value={value} onChange={setValue} />;
      };
      renderWithTheme(<Controlled />);
      openPicker();
      fireEvent.changeText(sheetInput(), '2145');
      expect(hourWheel()).toHaveAccessibilityValue({ text: '21' });
      expect(minuteWheel()).toHaveAccessibilityValue({ text: '45' });
      expect(within(field()).getByText('21:45')).toBeOnTheScreen();
    });
  });

  describe('the wheels', () => {
    it('draws one row per hour and one per minute', () => {
      renderField('');
      openPicker();
      expect(screen.getAllByText(ROW_NAME)).toHaveLength(PICKER_HOURS.length + PICKER_MINUTES.length);
    });

    it('draws the colon between the two wheels', () => {
      renderField('08:30');
      openPicker();
      expect(screen.getByText(':')).toBeOnTheScreen();
    });

    it('writes the hour the hour wheel settles on and keeps the current minute', () => {
      const onChange = renderField('08:30');
      openPicker();
      scrollWheelTo(hourWheel(), 9);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('09:30');
    });

    it('writes the minute the minute wheel settles on and keeps the current hour', () => {
      const onChange = renderField('08:30');
      openPicker();
      scrollWheelTo(minuteWheel(), 45);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('08:45');
    });

    it('writes a minute that is not a multiple of five', () => {
      const onChange = renderField('08:30');
      openPicker();
      scrollWheelTo(minuteWheel(), 59);
      expect(onChange).toHaveBeenCalledWith('08:59');
    });

    it('starts the minute at 00 when it picks an hour for an empty value', () => {
      const onChange = renderField('');
      openPicker();
      scrollWheelTo(hourWheel(), 7);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('07:00');
    });

    it('starts the hour at 00 when it picks a minute for an empty value', () => {
      const onChange = renderField('');
      openPicker();
      scrollWheelTo(minuteWheel(), 45);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('00:45');
    });

    it('keeps the minute of a value that is not a multiple of five when it picks an hour', () => {
      const onChange = renderField('08:33');
      openPicker();
      scrollWheelTo(hourWheel(), 9);
      expect(onChange).toHaveBeenCalledWith('09:33');
    });

    it('writes the hour of a tapped row', () => {
      const onChange = renderField('08:30');
      openPicker();
      fireEvent.press(screen.getAllByText('21')[0]);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('21:30');
    });

    it('centres the hour and the minute of the current value', () => {
      renderField('08:30');
      openPicker();
      expect(hourWheel()).toHaveAccessibilityValue({ text: '08' });
      expect(minuteWheel()).toHaveAccessibilityValue({ text: '30' });
    });

    it('centres a minute that is not a multiple of five', () => {
      renderField('08:33');
      openPicker();
      expect(hourWheel()).toHaveAccessibilityValue({ text: '08' });
      expect(minuteWheel()).toHaveAccessibilityValue({ text: '33' });
    });

    it.each(['', '8:3', '25:00', '08:61'])('centres 00 on both wheels for the invalid value %j', (value) => {
      renderField(value);
      openPicker();
      expect(hourWheel()).toHaveAccessibilityValue({ text: '00' });
      expect(minuteWheel()).toHaveAccessibilityValue({ text: '00' });
    });

    it('stays open after a pick and closes with the sheet Close button', () => {
      renderField('08:30');
      openPicker();
      scrollWheelTo(hourWheel(), 9);
      expect(minuteWheel()).toBeOnTheScreen();
      closeSheet();
      expect(screen.queryByLabelText(t('custom.pickMinute'))).toBeNull();
    });
  });
});

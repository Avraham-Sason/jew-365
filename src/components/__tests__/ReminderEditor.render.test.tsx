jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 'high' },
  AndroidNotificationVisibility: { PUBLIC: 'public' },
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
}));
import React from 'react';
import { Dimensions, Modal, ScrollView, StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { ReminderEditor } from '../ReminderEditor';
import { WHEEL_ITEM_HEIGHT } from '../WheelPicker';
import { CITIES } from '@/data/cities';
import { customToMitzvah } from '@/data/customMitzvotAdapter';
import { findMitzvah } from '@/data/mitzvot';
import { t } from '@/i18n';
import { useUserStore } from '@/stores/useUserStore';
import { installChokFixture } from '@/testing/chok';
import { renderWithTheme } from '@/testing/render';
import { at } from '@/testing/zmanim';
import type { Reminder, ReminderAnchor, UserSettings } from '@/types/mitzvah';

const ONLY_DATE = [
  'nextTick',
  'queueMicrotask',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

const JERUSALEM = CITIES[0];
const SETTINGS: UserSettings = { nusach: 'ashkenaz', halachicOpinions: { ksSofZman: 'GRA' }, inIsrael: true };
const CHOK = findMitzvah('chok_leyisrael')!;

beforeAll(() => {
  installChokFixture();
});
const SHACHARIT = findMitzvah('shacharit')!;
const OMER = findMitzvah('sefirat_haomer')!;
const NAME = 'חק לישראל';
const EVENING: Reminder = { anchor: 'clock', offsetMin: 20 * 60 + 30, label: 'ערב', skipIfDone: true };
const WEDNESDAY = at(JERUSALEM, '2026-12-16T10:00');
const FRIDAY = at(JERUSALEM, '2026-12-18T10:00');

type EditorProps = Partial<React.ComponentProps<typeof ReminderEditor>>;

function renderEditor(props: EditorProps = {}) {
  const onSave = jest.fn();
  const onClose = jest.fn();
  renderWithTheme(
    <ReminderEditor
      visible
      mitzvah={CHOK}
      location={JERUSALEM}
      settings={SETTINGS}
      allowClock
      mitzvahName={NAME}
      onClose={onClose}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave, onClose };
}

const anchorOption = (anchor: ReminderAnchor) => screen.getByRole('radio', { name: t(`reminder.anchor.${anchor}`) });
const timeInput = () => screen.getByLabelText(t('custom.typeTime'));
const hourWheel = () => screen.getByLabelText(t('custom.pickHour'));
const minuteWheel = () => screen.getByLabelText(t('custom.pickMinute'));
const offsetInput = () => screen.getByLabelText(t('reminder.offset'));
const chooseAnchor = (anchor: ReminderAnchor) => fireEvent.press(anchorOption(anchor));
const save = () => fireEvent.press(screen.getByRole('button', { name: t('common.save') }));
const typeTime = (typed: string) => fireEvent.changeText(timeInput(), typed);

function scrollWheelTo(wheel: ReturnType<typeof hourWheel>, index: number) {
  fireEvent(wheel, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 0, y: index * WHEEL_ITEM_HEIGHT } } });
}

function setOffset(anchor: 'start' | 'end', minutes: number) {
  chooseAnchor(anchor);
  fireEvent.changeText(offsetInput(), String(minutes));
}

function setClock(typed: string) {
  chooseAnchor('clock');
  typeTime(typed);
}

describe('ReminderEditor', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
    jest.useFakeTimers({ now: WEDNESDAY, doNotFake: [...ONLY_DATE] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('the anchor choice', () => {
    it('offers the start and the end of the window only until the clock option is allowed', () => {
      renderEditor({ allowClock: false });
      expect(screen.getAllByRole('radio')).toHaveLength(2);
      expect(screen.queryByRole('radio', { name: t('reminder.anchor.clock') })).toBeNull();
    });

    it('offers a third option, at a set time, once the clock is allowed', () => {
      renderEditor();
      expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityState.selected)).toEqual([
        true,
        false,
        false,
      ]);
      expect(anchorOption('clock')).toBeOnTheScreen();
      expect(t('reminder.anchor.clock')).not.toBe('reminder.anchor.clock');
    });

    it('names the third option in both languages', () => {
      expect(t('reminder.anchor.clock')).toBe('בשעה קבועה');
      useUserStore.setState({ language: 'en' });
      expect(t('reminder.anchor.clock')).toBe('At a set time');
      expect(t('reminder.time')).toBe('Time');
    });
  });

  describe('on a short screen', () => {
    it('scrolls its body inside 65% of the window height, so the sheet never runs off the top', () => {
      const { height } = Dimensions.get('window');
      renderEditor();
      fireEvent.press(anchorOption('clock'));
      const body = screen.UNSAFE_getAllByType(ScrollView).find((view) => view.props.keyboardShouldPersistTaps);
      expect(body).toBeDefined();
      expect(StyleSheet.flatten(body!.props.style)).toEqual({ maxHeight: height * 0.65 });
    });
  });

  describe('a start or end reminder', () => {
    it('keeps the minutes input and has no time field', () => {
      renderEditor({ initialValue: { anchor: 'start', offsetMin: 30, label: 'x' } });
      expect(offsetInput()).toHaveDisplayValue('30');
      expect(screen.queryByLabelText(t('custom.typeTime'))).toBeNull();
      expect(screen.queryByLabelText(t('custom.pickHour'))).toBeNull();
    });

    it('saves the offset as typed, with its anchor', () => {
      const { onSave, onClose } = renderEditor({ initialValue: { anchor: 'end', offsetMin: -45, label: 'x' } });
      save();
      expect(onSave).toHaveBeenCalledWith({ anchor: 'end', offsetMin: -45, label: 'x', skipIfDone: false });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('choosing the clock option', () => {
    it('swaps the minutes input for the time field, wheels included, named by the time label', () => {
      renderEditor({ initialValue: { anchor: 'start', offsetMin: 30, label: 'x' } });
      chooseAnchor('clock');
      expect(anchorOption('clock')).toBeSelected();
      expect(screen.queryByLabelText(t('reminder.offset'))).toBeNull();
      expect(screen.queryByText('-5')).toBeNull();
      expect(screen.queryByText('+5')).toBeNull();
      expect(screen.getByText(t('reminder.time'))).toBeOnTheScreen();
      expect(timeInput()).toHaveDisplayValue('');
      expect(timeInput().props.placeholder).toBe('HH:MM');
    });

    it('shows the wheels in the sheet at once, with no button to open a second sheet', () => {
      renderEditor();
      chooseAnchor('clock');
      expect(hourWheel()).toBeOnTheScreen();
      expect(minuteWheel()).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: t('reminder.time') })).toBeNull();
      expect(screen.UNSAFE_getAllByType(Modal)).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: t('common.close') })).toHaveLength(1);
    });

    it('writes the picked time as minutes after midnight', () => {
      const { onSave, onClose } = renderEditor();
      setClock('2045');
      expect(timeInput()).toHaveDisplayValue('20:45');
      save();
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith({ anchor: 'clock', offsetMin: 20 * 60 + 45, label: NAME, skipIfDone: false });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('writes the time the wheels settle on', () => {
      const { onSave } = renderEditor();
      setClock('0800');
      scrollWheelTo(hourWheel(), 9);
      scrollWheelTo(minuteWheel(), 15);
      expect(timeInput()).toHaveDisplayValue('09:15');
      save();
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'clock', offsetMin: 9 * 60 + 15 }));
    });

    it.each([
      ['00:00', 0],
      ['00:30', 30],
      ['09:05', 545],
      ['23:59', 1439],
    ])('writes %s as %d', (typed, minutes) => {
      const { onSave } = renderEditor();
      setClock(typed);
      save();
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'clock', offsetMin: minutes }));
    });

    it('refuses to save without a time', () => {
      const { onSave, onClose } = renderEditor();
      chooseAnchor('clock');
      save();
      expect(screen.getByText(t('reminder.errors.timeRequired'))).toBeOnTheScreen();
      expect(onSave).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not take a half-typed time for a time', () => {
      const { onSave } = renderEditor();
      setClock('20:');
      save();
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByText(t('reminder.errors.timeRequired'))).toBeOnTheScreen();
    });
  });

  describe('switching back from the clock option', () => {
    it.each(['start', 'end'] as const)('resets the offset to zero when it goes back to %s', (back) => {
      const { onSave } = renderEditor({ initialValue: { anchor: 'start', offsetMin: 30, label: 'x' } });
      expect(offsetInput()).toHaveDisplayValue('30');
      setClock('0800');
      chooseAnchor(back);
      expect(offsetInput()).toHaveDisplayValue('0');
      save();
      expect(onSave).toHaveBeenCalledWith({ anchor: back, offsetMin: 0, label: 'x', skipIfDone: false });
    });

    it('resets the offset to zero for a reminder that was a clock one when it opened', () => {
      const { onSave } = renderEditor({ initialValue: EVENING });
      chooseAnchor('end');
      expect(offsetInput()).toHaveDisplayValue('0');
      save();
      expect(onSave).toHaveBeenCalledWith({ anchor: 'end', offsetMin: 0, label: 'ערב', skipIfDone: true });
    });

    it('keeps the offset when it only moves between start and end', () => {
      renderEditor({ initialValue: { anchor: 'start', offsetMin: 30, label: 'x' } });
      chooseAnchor('end');
      expect(offsetInput()).toHaveDisplayValue('30');
    });

    it('remembers the time picked when it goes to the clock option again', () => {
      renderEditor();
      setClock('2045');
      chooseAnchor('start');
      chooseAnchor('clock');
      expect(timeInput()).toHaveDisplayValue('20:45');
      expect(hourWheel()).toHaveAccessibilityValue({ text: '20' });
      expect(minuteWheel()).toHaveAccessibilityValue({ text: '45' });
    });
  });

  describe('a clock reminder that already exists', () => {
    it('opens on the option and its time, in the input and on the wheels', () => {
      renderEditor({ initialValue: EVENING });
      expect(anchorOption('clock')).toBeSelected();
      expect(timeInput()).toHaveDisplayValue('20:30');
      expect(hourWheel()).toHaveAccessibilityValue({ text: '20' });
      expect(minuteWheel()).toHaveAccessibilityValue({ text: '30' });
    });

    it('is saved back unchanged when only the label is edited', () => {
      const { onSave } = renderEditor({ initialValue: EVENING });
      fireEvent.changeText(screen.getByLabelText(t('reminder.label')), 'חדש');
      save();
      expect(onSave).toHaveBeenCalledWith({ anchor: 'clock', offsetMin: 1230, label: 'חדש', skipIfDone: true });
    });

    it('writes the new time when it is changed', () => {
      const { onSave } = renderEditor({ initialValue: EVENING });
      typeTime('2115');
      save();
      expect(onSave).toHaveBeenCalledWith({ anchor: 'clock', offsetMin: 21 * 60 + 15, label: 'ערב', skipIfDone: true });
    });
  });

  describe('against every window the scheduler looks at', () => {
    it('refuses an offset past the range before it judges any window', () => {
      const { onSave } = renderEditor();
      setOffset('start', 721);
      save();
      expect(screen.getByText(t('reminder.errors.offsetRange', { max: 720 }))).toBeOnTheScreen();
      expect(onSave).not.toHaveBeenCalled();
    });

    describe('on a Friday, when the window shown ends at candle lighting', () => {
      beforeEach(() => {
        jest.setSystemTime(FRIDAY);
      });

      it('saves the Chok LeYisrael evening reminder at 20:30, which Sunday carries', () => {
        const { onSave } = renderEditor();
        setClock('2030');
        save();
        expect(screen.queryByText(t('reminder.errors.timeOutsideWindow'))).toBeNull();
        expect(onSave).toHaveBeenCalledWith({ anchor: 'clock', offsetMin: 1230, label: NAME, skipIfDone: false });
      });

      it('saves the evening reminder it opened with after only its label changed', () => {
        const { onSave } = renderEditor({ initialValue: EVENING });
        fireEvent.changeText(screen.getByLabelText(t('reminder.label')), 'חדש');
        save();
        expect(onSave).toHaveBeenCalledWith({ anchor: 'clock', offsetMin: 1230, label: 'חדש', skipIfDone: true });
      });

      it('saves an offset that Friday window ends before, because a later window carries it', () => {
        const { onSave } = renderEditor();
        setOffset('start', 700);
        save();
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'start', offsetMin: 700 }));
      });

      it('judges a time before the window start by the day it moves on to', () => {
        const { onSave } = renderEditor();
        setClock('0300');
        save();
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'clock', offsetMin: 180 }));
      });
    });

    describe('for a short window', () => {
      it('refuses a clock time that falls in no window of the coming days', () => {
        const { onSave, onClose } = renderEditor({ mitzvah: SHACHARIT });
        setClock('2300');
        save();
        expect(screen.getByText(t('reminder.errors.timeOutsideWindow'))).toBeOnTheScreen();
        expect(screen.queryByText(t('reminder.errors.outsideWindow'))).toBeNull();
        expect(onSave).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
      });

      it('refuses a time before the window opens, which only moves it to the next day', () => {
        const { onSave } = renderEditor({ mitzvah: SHACHARIT });
        setClock('0300');
        save();
        expect(screen.getByText(t('reminder.errors.timeOutsideWindow'))).toBeOnTheScreen();
        expect(onSave).not.toHaveBeenCalled();
      });

      it('accepts a time inside it', () => {
        const { onSave } = renderEditor({ mitzvah: SHACHARIT });
        setClock('0800');
        save();
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'clock', offsetMin: 480 }));
      });

      it('accepts a time inside it on a Friday too', () => {
        jest.setSystemTime(FRIDAY);
        const { onSave } = renderEditor({ mitzvah: SHACHARIT });
        setClock('0800');
        save();
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'clock', offsetMin: 480 }));
      });

      it.each([
        ['end', 30],
        ['start', -5],
      ] as const)('refuses an offset from the %s that lands outside every window (%d)', (anchor, minutes) => {
        const { onSave } = renderEditor({ mitzvah: SHACHARIT });
        setOffset(anchor, minutes);
        save();
        expect(screen.getByText(t('reminder.errors.outsideWindow'))).toBeOnTheScreen();
        expect(screen.queryByText(t('reminder.errors.timeOutsideWindow'))).toBeNull();
        expect(onSave).not.toHaveBeenCalled();
      });

      it.each([
        ['start', 30],
        ['end', -30],
      ] as const)('accepts an offset from the %s that lands inside a window (%d)', (anchor, minutes) => {
        const { onSave } = renderEditor({ mitzvah: SHACHARIT });
        setOffset(anchor, minutes);
        save();
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ anchor, offsetMin: minutes }));
      });

      it('clears the error once a valid reminder is saved', () => {
        const { onSave } = renderEditor({ mitzvah: SHACHARIT });
        setClock('2300');
        save();
        expect(screen.getByText(t('reminder.errors.timeOutsideWindow'))).toBeOnTheScreen();
        typeTime('0800');
        save();
        expect(screen.queryByText(t('reminder.errors.timeOutsideWindow'))).toBeNull();
        expect(onSave).toHaveBeenCalledTimes(1);
      });
    });

    it('judges nothing for a mitzvah with no window ahead, such as the Omer out of its season', () => {
      const { onSave } = renderEditor({ mitzvah: OMER });
      setClock('1200');
      save();
      expect(screen.queryByText(t('reminder.errors.timeOutsideWindow'))).toBeNull();
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'clock', offsetMin: 720 }));
    });

    it('judges a custom mitzvah through its own window and the same rule', () => {
      const custom = customToMitzvah({
        id: 'custom_1',
        name: 'x',
        startHHMM: '09:00',
        endHHMM: '10:00',
        reminders: [],
        skipOn: [],
        createdAt: 1,
      });
      const { onSave } = renderEditor({ mitzvah: custom, allowClock: false });
      setOffset('start', 90);
      save();
      expect(screen.getByText(t('reminder.errors.outsideWindow'))).toBeOnTheScreen();
      expect(onSave).not.toHaveBeenCalled();
      fireEvent.changeText(offsetInput(), '30');
      save();
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'start', offsetMin: 30 }));
    });
  });
});

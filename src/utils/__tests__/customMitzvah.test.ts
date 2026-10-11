import {
  ALL_DAY_MIN,
  DraftBlock,
  WEEKDAYS,
  categoryForWindow,
  cleanContentBlock,
  cleanContentBlocks,
  isActiveOn,
  reminderClock,
  siddurTextName,
} from '../customMitzvah';

describe('categoryForWindow', () => {
  it.each([
    ['08:00', '12:00', 'daily-morning'],
    ['10:00', '13:00', 'daily-morning'],
    ['11:00', '14:00', 'daily-afternoon'],
    ['15:00', '18:00', 'daily-afternoon'],
    ['17:00', '19:00', 'daily-evening'],
    ['20:00', '23:00', 'daily-evening'],
    ['06:00', '14:00', 'daily-allday'],
    ['07:00', '14:59', 'daily-morning'],
  ])('%s to %s is %s', (start, end, expected) => {
    expect(categoryForWindow(start, end)).toBe(expected);
  });

  it('turns all-day exactly at the threshold', () => {
    expect(ALL_DAY_MIN).toBe(480);
    expect(categoryForWindow('00:00', '07:59')).toBe('daily-morning');
    expect(categoryForWindow('00:00', '08:00')).toBe('daily-allday');
  });
});

describe('isActiveOn', () => {
  it('is active every day when no days are set', () => {
    expect(WEEKDAYS.map((day) => isActiveOn(undefined, day))).toEqual([true, true, true, true, true, true, true]);
  });

  it('is active only on the listed days', () => {
    expect(isActiveOn([0, 1], 1)).toBe(true);
    expect(isActiveOn([0, 1], 6)).toBe(false);
  });

  it('is never active with an empty list', () => {
    expect(WEEKDAYS.some((day) => isActiveOn([], day))).toBe(false);
  });
});

describe('reminderClock', () => {
  it('counts forward from the start', () => {
    expect(reminderClock('08:00', '12:00', { anchor: 'start', offsetMin: 15 })).toBe('08:15');
    expect(reminderClock('08:00', '12:00', { anchor: 'start', offsetMin: 0 })).toBe('08:00');
  });

  it('counts back from the end', () => {
    expect(reminderClock('08:00', '12:00', { anchor: 'end', offsetMin: -30 })).toBe('11:30');
    expect(reminderClock('08:00', '12:00', { anchor: 'end', offsetMin: 0 })).toBe('12:00');
  });

  it('is null when the trigger falls outside the window', () => {
    expect(reminderClock('08:00', '12:00', { anchor: 'start', offsetMin: 300 })).toBeNull();
    expect(reminderClock('08:00', '09:00', { anchor: 'end', offsetMin: -90 })).toBeNull();
    expect(reminderClock('08:00', '12:00', { anchor: 'start', offsetMin: -1 })).toBeNull();
    expect(reminderClock('08:00', '12:00', { anchor: 'end', offsetMin: 1 })).toBeNull();
  });

  it('is null when either time is not a valid HH:MM', () => {
    expect(reminderClock('8:00', '12:00', { anchor: 'start', offsetMin: 0 })).toBeNull();
    expect(reminderClock('08:00', '24:00', { anchor: 'end', offsetMin: 0 })).toBeNull();
    expect(reminderClock('', '', { anchor: 'start', offsetMin: 0 })).toBeNull();
  });

  it('is null for an offset that is not a number', () => {
    expect(reminderClock('08:00', '12:00', { anchor: 'start', offsetMin: Number.NaN })).toBeNull();
  });
});

const storedSiddurBlock = (he: string, textId: string) => ({ type: 'siddur', he, textId }) as unknown as DraftBlock;

describe('cleanContentBlock', () => {
  it('drops a siddur block whose text id was retired', () => {
    expect(cleanContentBlock(storedSiddurBlock('ציצית', 'tzitzit'))).toBeNull();
  });

  it('keeps a siddur block for a standalone text', () => {
    expect(cleanContentBlock(storedSiddurBlock('תיקון הכללי', 'tikkun_haklali'))).toEqual({
      type: 'siddur',
      he: 'תיקון הכללי',
      textId: 'tikkun_haklali',
    });
  });

  it('keeps a siddur block for a mitzvah text', () => {
    expect(cleanContentBlock(storedSiddurBlock('הנחת תפילין', 'tefillin'))).toEqual({
      type: 'siddur',
      he: 'הנחת תפילין',
      textId: 'tefillin',
    });
  });

  it('drops a siddur block that has no text chosen yet', () => {
    expect(cleanContentBlock({ type: 'siddur', he: 'x', textId: null })).toBeNull();
  });

  it('drops a text or blessing block whose Hebrew is only whitespace', () => {
    expect(cleanContentBlock({ type: 'text', he: '   ' })).toBeNull();
    expect(cleanContentBlock({ type: 'blessing', he: '\n\t ' })).toBeNull();
  });

  it('trims the Hebrew of a text block', () => {
    expect(cleanContentBlock({ type: 'text', he: '  שלום  ', en: 'Hello' })).toEqual({
      type: 'text',
      he: 'שלום',
      en: 'Hello',
    });
  });

  it('keeps a link only with a url, trimmed', () => {
    expect(cleanContentBlock({ type: 'link', he: 'אתר', url: '   ' })).toBeNull();
    expect(cleanContentBlock({ type: 'link', he: 'אתר', url: ' https://example.com ' })).toEqual({
      type: 'link',
      he: 'אתר',
      url: 'https://example.com',
    });
  });
});

describe('cleanContentBlocks', () => {
  it('keeps the complete blocks in order and drops the rest', () => {
    expect(
      cleanContentBlocks([
        { type: 'text', he: 'א' },
        storedSiddurBlock('ציצית', 'tzitzit'),
        { type: 'siddur', he: '', textId: null },
        storedSiddurBlock('אשר יצר', 'asher_yatzar'),
      ]),
    ).toEqual([
      { type: 'text', he: 'א' },
      { type: 'siddur', he: 'אשר יצר', textId: 'asher_yatzar' },
    ]);
  });

  it('is undefined when nothing is left', () => {
    expect(cleanContentBlocks([])).toBeUndefined();
    expect(cleanContentBlocks([storedSiddurBlock('ציצית', 'tzitzit'), { type: 'text', he: ' ' }])).toBeUndefined();
  });
});

describe('siddurTextName', () => {
  it('names a standalone text in each language', () => {
    expect(siddurTextName('asher_yatzar', 'he')).toBe('אשר יצר');
    expect(siddurTextName('asher_yatzar', 'en')).toBe('Asher Yatzar');
  });

  it('names a mitzvah text in each language', () => {
    expect(siddurTextName('tefillin', 'he')).toBe('הנחת תפילין');
    expect(siddurTextName('tefillin', 'en')).toBe('Tefillin');
  });

  it('is null for a retired text id', () => {
    expect(siddurTextName('tzitzit', 'he')).toBeNull();
    expect(siddurTextName('tzitzit', 'en')).toBeNull();
  });
});

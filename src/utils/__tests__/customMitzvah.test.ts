import {
  ALL_DAY_MIN,
  DraftBlock,
  NIGHT_END_MIN,
  WEEKDAYS,
  categoryForWindow,
  cleanContentBlock,
  cleanContentBlocks,
  isActiveOn,
  reminderClock,
  siddurTextName,
  windowMinutes,
} from '../customMitzvah';

describe('windowMinutes', () => {
  it.each([
    ['08:00', '12:00', 240],
    ['08:00', '08:01', 1],
    ['00:00', '23:59', 1439],
    ['22:00', '01:00', 180],
    ['23:59', '00:00', 1],
    ['08:30', '08:29', 1439],
    ['20:00', '06:30', 630],
  ])('%s to %s lasts %i minutes', (start, end, expected) => {
    expect(windowMinutes(start, end)).toBe(expected);
  });

  it.each(['00:00', '08:00', '12:34', '23:59'])('equal times at %s are a full 24 hours', (time) => {
    expect(windowMinutes(time, time)).toBe(1440);
  });
});

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
    expect(categoryForWindow('01:00', '08:59')).toBe('daily-morning');
    expect(categoryForWindow('01:00', '09:00')).toBe('daily-allday');
    expect(categoryForWindow('18:00', '01:59')).toBe('daily-evening');
    expect(categoryForWindow('18:00', '02:00')).toBe('daily-allday');
  });

  it.each([
    ['23:00', '01:00', 'daily-evening'],
    ['22:00', '02:00', 'daily-evening'],
    ['20:00', '03:00', 'daily-evening'],
    ['00:00', '03:00', 'daily-evening'],
    ['01:00', '05:00', 'daily-evening'],
    ['02:00', '07:00', 'daily-morning'],
    ['23:30', '04:00', 'daily-evening'],
    ['22:00', '08:00', 'daily-allday'],
    ['21:00', '06:00', 'daily-allday'],
  ])('the overnight window %s to %s is %s', (start, end, expected) => {
    expect(categoryForWindow(start, end)).toBe(expected);
  });

  it('reads a midpoint before 04:00 as a night window and 04:00 itself as the morning', () => {
    expect(NIGHT_END_MIN).toBe(240);
    expect(categoryForWindow('03:00', '04:58')).toBe('daily-evening');
    expect(categoryForWindow('03:00', '05:00')).toBe('daily-morning');
    expect(categoryForWindow('03:00', '04:59')).toBe('daily-evening');
  });

  it.each(['00:00', '08:00', '17:30', '23:59'])('equal times at %s are all-day', (time) => {
    expect(categoryForWindow(time, time)).toBe('daily-allday');
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

  describe('across midnight', () => {
    it('counts forward from the start past midnight', () => {
      expect(reminderClock('22:00', '01:00', { anchor: 'start', offsetMin: 0 })).toBe('22:00');
      expect(reminderClock('22:00', '01:00', { anchor: 'start', offsetMin: 120 })).toBe('00:00');
      expect(reminderClock('22:00', '01:00', { anchor: 'start', offsetMin: 150 })).toBe('00:30');
      expect(reminderClock('22:00', '01:00', { anchor: 'start', offsetMin: 180 })).toBe('01:00');
    });

    it('counts back from the end on the other side of midnight', () => {
      expect(reminderClock('22:00', '01:00', { anchor: 'end', offsetMin: 0 })).toBe('01:00');
      expect(reminderClock('22:00', '01:00', { anchor: 'end', offsetMin: -30 })).toBe('00:30');
      expect(reminderClock('22:00', '01:00', { anchor: 'end', offsetMin: -90 })).toBe('23:30');
      expect(reminderClock('22:00', '01:00', { anchor: 'end', offsetMin: -180 })).toBe('22:00');
    });

    it('is null outside the overnight window', () => {
      expect(reminderClock('22:00', '01:00', { anchor: 'start', offsetMin: 181 })).toBeNull();
      expect(reminderClock('22:00', '01:00', { anchor: 'start', offsetMin: -1 })).toBeNull();
      expect(reminderClock('22:00', '01:00', { anchor: 'end', offsetMin: -181 })).toBeNull();
      expect(reminderClock('22:00', '01:00', { anchor: 'end', offsetMin: 1 })).toBeNull();
    });

    it('a window that ends the morning after reaches every hour in between', () => {
      expect(reminderClock('20:00', '06:30', { anchor: 'start', offsetMin: 600 })).toBe('06:00');
      expect(reminderClock('20:00', '06:30', { anchor: 'end', offsetMin: -600 })).toBe('20:30');
    });
  });

  describe('a full 24-hour window', () => {
    it('reaches from the start to the same clock time the next day', () => {
      expect(reminderClock('08:00', '08:00', { anchor: 'start', offsetMin: 0 })).toBe('08:00');
      expect(reminderClock('08:00', '08:00', { anchor: 'start', offsetMin: 960 })).toBe('00:00');
      expect(reminderClock('08:00', '08:00', { anchor: 'start', offsetMin: 1440 })).toBe('08:00');
    });

    it('counts back from the end a day after the start', () => {
      expect(reminderClock('08:00', '08:00', { anchor: 'end', offsetMin: 0 })).toBe('08:00');
      expect(reminderClock('08:00', '08:00', { anchor: 'end', offsetMin: -60 })).toBe('07:00');
      expect(reminderClock('08:00', '08:00', { anchor: 'end', offsetMin: -1440 })).toBe('08:00');
    });

    it('is null past the day', () => {
      expect(reminderClock('08:00', '08:00', { anchor: 'start', offsetMin: 1441 })).toBeNull();
      expect(reminderClock('08:00', '08:00', { anchor: 'end', offsetMin: -1441 })).toBeNull();
      expect(reminderClock('08:00', '08:00', { anchor: 'start', offsetMin: -1 })).toBeNull();
    });
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

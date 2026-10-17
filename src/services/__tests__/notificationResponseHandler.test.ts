const mockAddNotificationResponseReceivedListener = jest.fn();
const mockGetLastNotificationResponse = jest.fn((): unknown => null);
const mockClearLastNotificationResponse = jest.fn();
const mockMarkDoneFromNotificationData = jest.fn<Promise<boolean>, [unknown, string?]>(async () => true);
const mockRouterPush = jest.fn();
const mockRouterNavigate = jest.fn();
const mockCheck = jest.fn();
const mockFetch = jest.fn(async () => ({ isNew: true }));
const mockReload = jest.fn(async () => {});
const mockUpdates: { isEnabled: boolean; updateId: string | null; createdAt: Date | null } = {
  isEnabled: true,
  updateId: 'running-id',
  createdAt: new Date('2026-10-08T12:00:00.000Z'),
};

jest.mock('expo-updates', () => ({
  get isEnabled() {
    return mockUpdates.isEnabled;
  },
  get updateId() {
    return mockUpdates.updateId;
  },
  get createdAt() {
    return mockUpdates.createdAt;
  },
  checkForUpdateAsync: () => mockCheck(),
  fetchUpdateAsync: () => mockFetch(),
  reloadAsync: () => mockReload(),
}));

jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: (listener: unknown) => mockAddNotificationResponseReceivedListener(listener),
  getLastNotificationResponse: () => mockGetLastNotificationResponse(),
  clearLastNotificationResponse: () => mockClearLastNotificationResponse(),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 'high', DEFAULT: 'default' },
  AndroidNotificationVisibility: { PUBLIC: 'public', PRIVATE: 'private' },
}));

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
}));

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockRouterPush(...args),
    navigate: (...args: unknown[]) => mockRouterNavigate(...args),
  },
}));

// Only `markDoneFromNotificationData` is stubbed. The parser used to be re-implemented here too —
// a looser copy with no isRecord guard and no try/catch — so the shipped one was never exercised on
// the tap path, which is precisely where Android delivers payloads as `dataString`.
jest.mock('@/services/NotificationScheduler', () => {
  const actual = jest.requireActual('@/services/NotificationScheduler');
  return {
    ...actual,
    markDoneFromNotificationData: (data: unknown, id?: string) => mockMarkDoneFromNotificationData(data, id),
  };
});

import {
  consumePendingNotificationRoute,
  DEFAULT_NOTIFICATION_ACTION,
  initNotificationResponseHandler,
  MARK_DONE_ACTION,
  openLaunchNotificationResponse,
  OPEN_TEXT_ACTION,
} from '../notificationResponseHandler';
import { useUserStore } from '@/stores/useUserStore';
import { CITIES } from '@/data/cities';
import { at } from '@/testing/zmanim';

function response(
  actionIdentifier: string,
  data: Record<string, unknown>,
  identifier = 'notif-id',
  dataString?: string,
) {
  return {
    actionIdentifier,
    notification: {
      request: {
        identifier,
        content: dataString ? { dataString } : { data },
      },
    },
  } as never;
}

describe('notificationResponseHandler', () => {
  beforeEach(() => {
    mockAddNotificationResponseReceivedListener.mockReset();
    mockMarkDoneFromNotificationData.mockClear();
    mockRouterPush.mockClear();
    mockRouterNavigate.mockClear();
  });

  it('marks a mitzvah done from the notification action', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(response(MARK_DONE_ACTION, { mitzvahId: 'shacharit', dateKey: '2026-05-06' }, 'shacharit__2026-05-06__0'));

    expect(mockMarkDoneFromNotificationData).toHaveBeenCalledWith(
      { mitzvahId: 'shacharit', dateKey: '2026-05-06' },
      'shacharit__2026-05-06__0',
    );
  });

  it('reads mitzvah metadata from native dataString notification payloads', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(
      response(
        MARK_DONE_ACTION,
        {},
        'shacharit__2026-05-06__0',
        JSON.stringify({ mitzvahId: 'shacharit', dateKey: '2026-05-06' }),
      ),
    );

    expect(mockMarkDoneFromNotificationData).toHaveBeenCalledWith(
      { mitzvahId: 'shacharit', dateKey: '2026-05-06' },
      'shacharit__2026-05-06__0',
    );
  });

  it('opens mitzvah detail from the default notification tap', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(
      response(DEFAULT_NOTIFICATION_ACTION, {
        mitzvahId: 'sefirat_haomer',
        fullContent: [{ type: 'blessing', he: 'ברכה' }],
      }),
    );

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/mitzvah/[id]',
      params: { id: 'sefirat_haomer', highlightContent: '1' },
    });
  });

  it('opens the mitzvah detail from the default tap on a reminder that offers no text', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(
      response(
        DEFAULT_NOTIFICATION_ACTION,
        { mitzvahId: 'candle_lighting', dateKey: '2026-11-13', hasText: false },
        'candle_lighting__2026-11-13__0',
      ),
    );

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/mitzvah/[id]',
      params: { id: 'candle_lighting', highlightContent: '0' },
    });
  });

  it('opens the nusach text for the notification date from the default tap on a reminder that has one', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(
      response(
        DEFAULT_NOTIFICATION_ACTION,
        {
          mitzvahId: 'tefillin',
          dateKey: '2026-05-06',
          hasText: true,
          fullContent: [{ type: 'blessing', he: 'ברכה' }],
        },
        'tefillin__2026-05-06__0',
      ),
    );

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/siddur/[id]',
      params: { id: 'tefillin', date: '2026-05-06' },
    });
    expect(mockMarkDoneFromNotificationData).not.toHaveBeenCalled();
  });

  it('takes the date of a default text tap from the identifier when the payload lacks it', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(
      response(DEFAULT_NOTIFICATION_ACTION, { mitzvahId: 'havdalah', hasText: true }, 'havdalah__2026-10-10__0'),
    );

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/siddur/[id]',
      params: { id: 'havdalah', date: '2026-10-10' },
    });
  });

  it('falls back to the mitzvah screen when a default text tap has no recoverable date', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(response(DEFAULT_NOTIFICATION_ACTION, { mitzvahId: 'havdalah', hasText: true }, 'not-a-mitzvah-id'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/mitzvah/[id]',
      params: { id: 'havdalah', highlightContent: '0' },
    });
  });

  it('replays a default text tap that arrived before the router was mounted', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];
    mockRouterPush.mockImplementationOnce(() => {
      throw new Error('navigator not mounted');
    });

    listener(response(DEFAULT_NOTIFICATION_ACTION, { mitzvahId: 'shacharit', dateKey: '2026-05-06', hasText: true }));
    consumePendingNotificationRoute();

    expect(mockRouterPush).toHaveBeenCalledTimes(2);
    expect(mockRouterPush).toHaveBeenLastCalledWith({
      pathname: '/siddur/[id]',
      params: { id: 'shacharit', date: '2026-05-06' },
    });
  });

  it('opens the nusach text for the notification date from the open-text action, without marking done', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(
      response(
        OPEN_TEXT_ACTION,
        {},
        'tefillin__2026-05-06__0',
        JSON.stringify({ mitzvahId: 'tefillin', dateKey: '2026-05-06' }),
      ),
    );

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/siddur/[id]',
      params: { id: 'tefillin', date: '2026-05-06' },
    });
    expect(mockMarkDoneFromNotificationData).not.toHaveBeenCalled();
  });

  it('opens the Chok LeYisrael reader on the reminder date from the body tap and from open text', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];
    const data = { mitzvahId: 'chok_leyisrael', dateKey: '2026-12-17', hasText: true };

    listener(response(DEFAULT_NOTIFICATION_ACTION, data, 'chok_leyisrael__2026-12-17__1'));
    listener(response(OPEN_TEXT_ACTION, data, 'chok_leyisrael__2026-12-17__1'));

    const reader = { pathname: '/siddur/[id]', params: { id: 'chok_leyisrael', date: '2026-12-17' } };
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, reader);
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, reader);
    expect(mockMarkDoneFromNotificationData).not.toHaveBeenCalled();
  });

  it('takes the date from the notification identifier when the payload lacks it', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(response(OPEN_TEXT_ACTION, { mitzvahId: 'havdalah' }, 'havdalah__2026-10-10__0'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/siddur/[id]',
      params: { id: 'havdalah', date: '2026-10-10' },
    });
  });

  it('falls back to the mitzvah screen when no date can be recovered', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(response(OPEN_TEXT_ACTION, { mitzvahId: 'havdalah' }, 'not-a-mitzvah-id'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/mitzvah/[id]',
      params: { id: 'havdalah', highlightContent: '0' },
    });
  });

  it('replays an open-text tap that arrived before the router was mounted', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];
    mockRouterPush.mockImplementationOnce(() => {
      throw new Error('navigator not mounted');
    });

    listener(response(OPEN_TEXT_ACTION, { mitzvahId: 'sefirat_haomer', dateKey: '2026-04-20' }));
    consumePendingNotificationRoute();

    expect(mockRouterPush).toHaveBeenCalledTimes(2);
    expect(mockRouterPush).toHaveBeenLastCalledWith({
      pathname: '/siddur/[id]',
      params: { id: 'sefirat_haomer', date: '2026-04-20' },
    });
    consumePendingNotificationRoute();
    expect(mockRouterPush).toHaveBeenCalledTimes(2);
  });

  it('opens home from the pre-block notice, never a mitzvah lookup', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(response(DEFAULT_NOTIFICATION_ACTION, { kind: 'blockNotice' }, 'blockNotice:2026-11-14'));

    expect(mockRouterNavigate).toHaveBeenCalledWith('/(tabs)/home');
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockMarkDoneFromNotificationData).not.toHaveBeenCalled();
  });

  it('opens the check-in from a check-in reminder', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(response(DEFAULT_NOTIFICATION_ACTION, { kind: 'checkin', blockId: '2026-11-14' }, 'checkin:2026-11-14:0'));

    expect(mockRouterNavigate).toHaveBeenCalledWith('/checkin');
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('opens the taharah screen from a taharah reminder, never a mitzvah lookup', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(
      response(
        DEFAULT_NOTIFICATION_ACTION,
        { kind: 'taharah', taharah: { task: 'hefsek', day: 739931 } },
        'taharah:hefsek:739931',
      ),
    );

    expect(mockRouterNavigate).toHaveBeenCalledWith('/taharah');
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockMarkDoneFromNotificationData).not.toHaveBeenCalled();
  });

  it('opens the hilulot screen from a hilula notice, never a mitzvah lookup', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(
      response(
        DEFAULT_NOTIFICATION_ACTION,
        { kind: 'hilula', hilula: { day: 739900, when: 'evening' } },
        'hilula:739900:evening',
      ),
    );

    expect(mockRouterNavigate).toHaveBeenCalledWith('/hilulot');
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockMarkDoneFromNotificationData).not.toHaveBeenCalled();
  });

  it('opens the Rosh Chodesh screen from a Rosh Chodesh notice, never a mitzvah lookup', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(
      response(
        DEFAULT_NOTIFICATION_ACTION,
        { kind: 'roshChodesh', roshChodesh: { day: 739901, when: 'day' } },
        'roshChodesh:739901:day',
      ),
    );

    expect(mockRouterNavigate).toHaveBeenCalledWith('/rosh-chodesh');
    expect(mockRouterNavigate).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockMarkDoneFromNotificationData).not.toHaveBeenCalled();
  });

  it('opens the weekly report of the notice week, never a mitzvah lookup', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(
      response(DEFAULT_NOTIFICATION_ACTION, { kind: 'report', report: { week: '2026-10-10' } }, 'report:2026-10-10'),
    );

    expect(mockRouterNavigate).toHaveBeenCalledWith({ pathname: '/report', params: { week: '2026-10-10' } });
    expect(mockRouterNavigate).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockMarkDoneFromNotificationData).not.toHaveBeenCalled();
  });

  it('opens the latest report from a report notice that lost its week', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(response(DEFAULT_NOTIFICATION_ACTION, { kind: 'report' }, 'report:2026-10-10'));

    expect(mockRouterNavigate).toHaveBeenCalledWith({ pathname: '/report', params: { week: undefined } });
  });

  it('hands the mark-done button of a bedika reminder to the scheduler with its taharah payload', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];
    const data = { kind: 'taharah', taharah: { task: 'bedikaMorning', day: 739931 } };

    listener(response(MARK_DONE_ACTION, data, 'taharah:bedikaMorning:739931'));

    expect(mockMarkDoneFromNotificationData).toHaveBeenCalledWith(data, 'taharah:bedikaMorning:739931');
    expect(mockRouterNavigate).not.toHaveBeenCalled();
  });

  describe('update notice tap', () => {
    beforeEach(() => {
      mockReload.mockClear();
      mockUpdates.updateId = 'running-id';
      useUserStore.getState().reset();
    });
    afterEach(() => useUserStore.getState().reset());

    it('reloads into a downloaded update that is not running yet', () => {
      initNotificationResponseHandler();
      const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

      listener(response(DEFAULT_NOTIFICATION_ACTION, { kind: 'update', updateId: 'u1' }, 'update:u1'));

      expect(mockReload).toHaveBeenCalledTimes(1);
      expect(mockRouterNavigate).not.toHaveBeenCalled();
      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(mockMarkDoneFromNotificationData).not.toHaveBeenCalled();
    });

    it('opens home when the tapped update is already running', () => {
      initNotificationResponseHandler();
      const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

      listener(response(DEFAULT_NOTIFICATION_ACTION, { kind: 'update', updateId: 'running-id' }, 'update:running-id'));

      expect(mockRouterNavigate).toHaveBeenCalledTimes(1);
      expect(mockRouterNavigate).toHaveBeenCalledWith('/(tabs)/home');
      expect(mockReload).not.toHaveBeenCalled();
    });

    it('opens home when a newer update than the tapped one is already running', () => {
      initNotificationResponseHandler();
      const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

      listener(
        response(
          DEFAULT_NOTIFICATION_ACTION,
          { kind: 'update', updateId: 'u0', updateCreatedAt: '2026-10-08T11:00:00.000Z' },
          'update:u0',
        ),
      );

      expect(mockRouterNavigate).toHaveBeenCalledWith('/(tabs)/home');
      expect(mockReload).not.toHaveBeenCalled();
    });

    it('ignores other actions on an update notice', () => {
      initNotificationResponseHandler();
      const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

      listener(response('SOMETHING_ELSE', { kind: 'update', updateId: 'u1' }, 'update:u1'));
      listener(response('SOMETHING_ELSE', { kind: 'update', updateId: 'running-id' }, 'update:running-id'));

      expect(mockReload).not.toHaveBeenCalled();
      expect(mockRouterNavigate).not.toHaveBeenCalled();
      expect(mockRouterPush).not.toHaveBeenCalled();
    });

    describe('inside a Shabbat block', () => {
      const jerusalem = CITIES[0];
      beforeAll(() => {
        jest.useFakeTimers({
          now: at(jerusalem, '2026-11-14T10:00'),
          doNotFake: [
            'nextTick',
            'queueMicrotask',
            'setImmediate',
            'setTimeout',
            'clearTimeout',
            'setInterval',
            'clearInterval',
          ],
        });
      });
      afterAll(() => jest.useRealTimers());
      beforeEach(() => {
        useUserStore.getState().setLocation(jerusalem);
        useUserStore.getState().setOnboarded(true);
      });

      it('does nothing', () => {
        initNotificationResponseHandler();
        const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

        listener(response(DEFAULT_NOTIFICATION_ACTION, { kind: 'update', updateId: 'u1' }, 'update:u1'));
        listener(
          response(DEFAULT_NOTIFICATION_ACTION, { kind: 'update', updateId: 'running-id' }, 'update:running-id'),
        );

        expect(mockReload).not.toHaveBeenCalled();
        expect(mockRouterNavigate).not.toHaveBeenCalled();
        expect(mockRouterPush).not.toHaveBeenCalled();
      });
    });
  });

  describe('inside a Shabbat block', () => {
    const jerusalem = CITIES[0];
    beforeAll(() => {
      jest.useFakeTimers({
        now: at(jerusalem, '2026-11-14T10:00'),
        doNotFake: [
          'nextTick',
          'queueMicrotask',
          'setImmediate',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
        ],
      });
    });
    afterAll(() => jest.useRealTimers());
    beforeEach(() => {
      useUserStore.getState().setLocation(jerusalem);
      useUserStore.getState().setOnboarded(true);
    });
    afterEach(() => useUserStore.getState().reset());

    // The route would mount under the Shabbat screen and stay there — the reader keeping the screen
    // awake — until tzeit.
    it('opens nothing from a tap, but still honours "done"', () => {
      initNotificationResponseHandler();
      const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

      listener(
        response(
          OPEN_TEXT_ACTION,
          { mitzvahId: 'candle_lighting', dateKey: '2026-11-13' },
          'candle_lighting__2026-11-13__0',
        ),
      );
      listener(
        response(DEFAULT_NOTIFICATION_ACTION, { mitzvahId: 'candle_lighting' }, 'candle_lighting__2026-11-13__0'),
      );
      listener(
        response(
          DEFAULT_NOTIFICATION_ACTION,
          { mitzvahId: 'havdalah', dateKey: '2026-11-14', hasText: true },
          'havdalah__2026-11-14__0',
        ),
      );
      listener(response(DEFAULT_NOTIFICATION_ACTION, { kind: 'blockNotice' }, 'blockNotice:2026-11-14'));
      listener(
        response(
          DEFAULT_NOTIFICATION_ACTION,
          { kind: 'taharah', taharah: { task: 'hefsek', day: 739931 } },
          'taharah:hefsek:739931',
        ),
      );
      listener(
        response(
          DEFAULT_NOTIFICATION_ACTION,
          { kind: 'hilula', hilula: { day: 739900, when: 'before' } },
          'hilula:739900:before',
        ),
      );
      listener(
        response(
          DEFAULT_NOTIFICATION_ACTION,
          { kind: 'roshChodesh', roshChodesh: { day: 739901, when: 'before' } },
          'roshChodesh:739901:before',
        ),
      );
      listener(
        response(DEFAULT_NOTIFICATION_ACTION, { kind: 'report', report: { week: '2026-11-14' } }, 'report:2026-11-14'),
      );
      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(mockRouterNavigate).not.toHaveBeenCalled();

      listener(
        response(
          MARK_DONE_ACTION,
          { mitzvahId: 'candle_lighting', dateKey: '2026-11-13' },
          'candle_lighting__2026-11-13__0',
        ),
      );
      expect(mockMarkDoneFromNotificationData).toHaveBeenCalledTimes(1);
    });

    it('drops a tap buffered before the block began instead of replaying it into Shabbat', () => {
      useUserStore.getState().setOnboarded(false);
      initNotificationResponseHandler();
      const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];
      mockRouterPush.mockImplementationOnce(() => {
        throw new Error('navigator not mounted');
      });
      listener(response(DEFAULT_NOTIFICATION_ACTION, { mitzvahId: 'shacharit' }));

      useUserStore.getState().setOnboarded(true);
      consumePendingNotificationRoute();
      expect(mockRouterPush).toHaveBeenCalledTimes(1);
    });
  });
});

describe('a tap that launched the app', () => {
  const readerTap = () =>
    response(
      OPEN_TEXT_ACTION,
      { mitzvahId: 'shacharit', dateKey: '2026-10-14', hasText: true },
      'shacharit__2026-10-14__0',
    );

  beforeEach(() => {
    useUserStore.getState().reset();
    mockAddNotificationResponseReceivedListener.mockReset();
    mockGetLastNotificationResponse.mockReset();
    mockClearLastNotificationResponse.mockClear();
    mockMarkDoneFromNotificationData.mockClear();
    mockRouterPush.mockClear();
  });

  it('opens the reader for the open-text tap that launched a killed app', () => {
    mockGetLastNotificationResponse.mockReturnValue(readerTap());

    openLaunchNotificationResponse();

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/siddur/[id]',
      params: { id: 'shacharit', date: '2026-10-14' },
    });
    expect(mockClearLastNotificationResponse).toHaveBeenCalled();
  });

  it('does nothing when the app was not launched by a tap', () => {
    mockGetLastNotificationResponse.mockReturnValue(null);

    openLaunchNotificationResponse();

    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('never opens the same tap twice when the listener already received it', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];
    const tap = readerTap();
    listener(tap);
    mockGetLastNotificationResponse.mockReturnValue(tap);

    openLaunchNotificationResponse();

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
  });

  it('leaves a launching mark-done to the background task', () => {
    mockGetLastNotificationResponse.mockReturnValue(
      response(MARK_DONE_ACTION, { mitzvahId: 'shacharit', dateKey: '2026-10-14' }, 'shacharit__2026-10-14__0'),
    );

    openLaunchNotificationResponse();

    expect(mockMarkDoneFromNotificationData).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockClearLastNotificationResponse).toHaveBeenCalled();
  });

  it('clears a handled tap so the next launch does not replay it', () => {
    initNotificationResponseHandler();
    const listener = mockAddNotificationResponseReceivedListener.mock.calls[0][0];

    listener(readerTap());

    expect(mockClearLastNotificationResponse).toHaveBeenCalled();
  });

  it('survives a native module without the last-response API', () => {
    mockGetLastNotificationResponse.mockImplementation(() => {
      throw new Error('not available');
    });

    expect(() => openLaunchNotificationResponse()).not.toThrow();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

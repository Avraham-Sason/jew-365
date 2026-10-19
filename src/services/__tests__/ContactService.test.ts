jest.mock('@/services/crashReporting', () => ({ crashReportingEnabled: false, captureException: jest.fn() }));

import {
  CONTACT_EMAIL,
  CONTACT_FORM_ID,
  CONTACT_MESSAGE_MAX,
  CONTACT_TIMEOUT_MS,
  ContactError,
  contactFailureKey,
  contactMailUrl,
  contactProblem,
  isContactConfigured,
  sendContactMessage,
} from '../ContactService';
import { captureException } from '@/services/crashReporting';

const FORM = 'xyzabcd';
const VALID = { name: ' Avraham ', phone: ' 050-123-4567 ', message: ' The siddur font is small ' };
const mockFetch = jest.fn();

const reply = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response;

describe('ContactService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  describe('isContactConfigured', () => {
    it('is off while the form id is empty or blank', () => {
      expect(isContactConfigured('')).toBe(false);
      expect(isContactConfigured('  ')).toBe(false);
      expect(isContactConfigured(FORM)).toBe(true);
    });

    it('reads the one shipped form id by default', () => {
      expect(isContactConfigured()).toBe(CONTACT_FORM_ID.trim() !== '');
    });
  });

  describe('contactProblem', () => {
    it('accepts a complete message', () => {
      expect(contactProblem(VALID)).toBeNull();
      expect(contactProblem({ ...VALID, phone: '+972 50 123 4567' })).toBeNull();
      expect(contactProblem({ ...VALID, phone: '(02) 536-3333' })).toBeNull();
    });

    it.each([
      ['name', { ...VALID, name: '   ' }],
      ['phone', { ...VALID, phone: '' }],
      ['message', { ...VALID, message: '\n ' }],
    ])('rejects a blank %s as missing', (_field, input) => {
      expect(contactProblem(input)).toBe('missing');
    });

    it.each(['12345', '0501234567890123', '050-abc-4567', '050 123 4567 ext'])('rejects the phone %s', (phone) => {
      expect(contactProblem({ ...VALID, phone })).toBe('phone');
    });
  });

  it('builds a mail link to the developer address', () => {
    expect(contactMailUrl()).toBe(`mailto:${CONTACT_EMAIL}?subject=Jew%20365`);
  });

  describe('sendContactMessage', () => {
    it('posts the trimmed fields with the app context as JSON', async () => {
      mockFetch.mockResolvedValue(reply(200));
      await sendContactMessage(VALID, 'he', FORM);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`https://formspree.io/f/${FORM}`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' });
      expect(init.signal).toBeDefined();
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({
        _subject: 'Jew 365: Avraham',
        name: 'Avraham',
        phone: '050-123-4567',
        message: 'The siddur font is small',
        language: 'he',
      });
      expect(body.version).toMatch(/-\d+$/);
      expect(body.platform).toMatch(/^ios/);
    });

    it('caps the message length', async () => {
      mockFetch.mockResolvedValue(reply(200));
      await sendContactMessage({ ...VALID, message: 'א'.repeat(CONTACT_MESSAGE_MAX + 50) }, 'he', FORM);

      expect(JSON.parse(mockFetch.mock.calls[0][1].body).message).toHaveLength(CONTACT_MESSAGE_MAX);
    });

    it('reports no connection as offline', async () => {
      mockFetch.mockRejectedValue(new TypeError('Network request failed'));

      await expect(sendContactMessage(VALID, 'he', FORM)).rejects.toEqual(new ContactError('offline'));
      expect(captureException).not.toHaveBeenCalled();
    });

    it('aborts a request that hangs and reports it as offline', async () => {
      jest.useFakeTimers();
      try {
        mockFetch.mockImplementation(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
            }),
        );
        const sent = sendContactMessage(VALID, 'he', FORM);
        jest.advanceTimersByTime(CONTACT_TIMEOUT_MS);

        await expect(sent).rejects.toEqual(new ContactError('offline'));
      } finally {
        jest.useRealTimers();
      }
    });

    it('reports a rate limit as busy', async () => {
      mockFetch.mockResolvedValue(reply(429));

      await expect(sendContactMessage(VALID, 'he', FORM)).rejects.toEqual(new ContactError('busy'));
      expect(captureException).not.toHaveBeenCalled();
    });

    it('reports any other refusal as rejected and to crash reporting', async () => {
      mockFetch.mockResolvedValue(reply(404));

      await expect(sendContactMessage(VALID, 'he', FORM)).rejects.toEqual(new ContactError('rejected'));
      expect(captureException).toHaveBeenCalledWith(expect.any(Error), { scope: 'contact' });
    });
  });

  describe('contactFailureKey', () => {
    it('maps each failure to its message', () => {
      expect(contactFailureKey(new ContactError('offline'))).toBe('settings.contactOffline');
      expect(contactFailureKey(new ContactError('busy'))).toBe('settings.contactBusy');
      expect(contactFailureKey(new ContactError('rejected'))).toBe('settings.contactFailed');
      expect(captureException).not.toHaveBeenCalled();
    });

    it('reports an unexpected error', () => {
      const error = new Error('boom');
      expect(contactFailureKey(error)).toBe('settings.contactFailed');
      expect(captureException).toHaveBeenCalledWith(error, { scope: 'contact' });
    });
  });
});

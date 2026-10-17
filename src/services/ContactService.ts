import { Platform } from 'react-native';
import { appVersionLabel } from '@/services/appUpdates';
import { captureException } from '@/services/crashReporting';

// Formspree form id (https://formspree.io/f/<id>). It is public by design: it only lets a client
// post into the form. Empty hides the contact form and leaves the email link.
export const CONTACT_FORM_ID = 'xyekordk';
export const CONTACT_EMAIL = 'avisason9314@gmail.com';
export const CONTACT_MESSAGE_MAX = 2000;
export const CONTACT_TIMEOUT_MS = 15_000;

const PHONE_DIGITS = { min: 7, max: 15 };

export type ContactMessage = { name: string; phone: string; message: string };
export type ContactProblem = 'missing' | 'phone';
export type ContactErrorReason = 'offline' | 'busy' | 'rejected';

export class ContactError extends Error {
  constructor(readonly reason: ContactErrorReason) {
    super(`contact ${reason}`);
    this.name = 'ContactError';
  }
}

export function isContactConfigured(formId: string = CONTACT_FORM_ID): boolean {
  return formId.trim() !== '';
}

export function contactProblem({ name, phone, message }: ContactMessage): ContactProblem | null {
  if (!name.trim() || !phone.trim() || !message.trim()) return 'missing';
  const digits = phone.replace(/\D/g, '').length;
  const allowed = /^\+?[\d\s\-().]+$/.test(phone.trim());
  return allowed && digits >= PHONE_DIGITS.min && digits <= PHONE_DIGITS.max ? null : 'phone';
}

export function contactMailUrl(): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Jew in Time')}`;
}

export async function sendContactMessage(
  input: ContactMessage,
  language: string,
  formId: string = CONTACT_FORM_ID,
): Promise<void> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const message = input.message.trim().slice(0, CONTACT_MESSAGE_MAX);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTACT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`https://formspree.io/f/${formId.trim()}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        _subject: `Jew in Time: ${name}`,
        name,
        phone,
        message,
        version: appVersionLabel(),
        platform: `${Platform.OS} ${Platform.Version ?? ''}`.trim(),
        language,
      }),
      signal: controller.signal,
    });
  } catch {
    throw new ContactError('offline');
  } finally {
    clearTimeout(timer);
  }
  if (response.ok) return;
  if (response.status === 429) throw new ContactError('busy');
  captureException(new Error(`contact form rejected: HTTP ${response.status}`), { scope: 'contact' });
  throw new ContactError('rejected');
}

export function contactFailureKey(error: unknown): string {
  if (error instanceof ContactError) {
    if (error.reason === 'offline') return 'settings.contactOffline';
    if (error.reason === 'busy') return 'settings.contactBusy';
    return 'settings.contactFailed';
  }
  captureException(error, { scope: 'contact' });
  return 'settings.contactFailed';
}

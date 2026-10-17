import type { Nusach } from '@/types/mitzvah';
import { paletteForGender } from '@/theme/colors';
import { clearTaharahStorage } from '@/services/TaharahStorage';
import { useMitzvotStore } from './useMitzvotStore';
import { useTaharahStore } from './useTaharahStore';
import { Gender, MaritalStatus, useUserStore } from './useUserStore';

export const taharahOffered = (user: { gender: Gender | null; maritalStatus: MaritalStatus | null }): boolean =>
  user.gender !== null && user.maritalStatus === 'married';

// The defaults switch tefillin on for everyone, so a woman used to finish onboarding
// with tefillin reminders. Applied only when the answer changes, so re-tapping the same chip never
// undoes a choice made in the library.
export const MENS_MITZVOT = ['tefillin'] as const;

function applyGenderDefaults(next: Gender, previous: Gender | null): void {
  if (previous === next) return;
  const { setEnabled } = useMitzvotStore.getState();
  if (next === 'female') MENS_MITZVOT.forEach((id) => setEnabled(id, false));
  else if (previous === 'female') MENS_MITZVOT.forEach((id) => setEnabled(id, true));
}

export function chooseGender(next: Gender): void {
  const user = useUserStore.getState();
  const previous = user.gender;
  user.setGender(next);
  applyGenderDefaults(next, previous);
  if (previous !== next) user.setTheme(paletteForGender(next, user.theme));
  if (user.taharahEnabled) useTaharahStore.getState().setRoleForGender(next);
}

export function chooseMaritalStatus(next: MaritalStatus): void {
  const user = useUserStore.getState();
  user.setMaritalStatus(next);
  if (next !== 'married' && user.taharahEnabled) user.setTaharahEnabled(false);
}

export function setTaharahTracking(next: boolean): void {
  const user = useUserStore.getState();
  if (next && !taharahOffered(user)) return;
  user.setTaharahEnabled(next);
  if (next && user.gender) useTaharahStore.getState().startTracking(user.gender, user.nusach);
}

// Back to before tracking was switched on: the switch off, the log, the minhag, the leads and the
// lock at their defaults, and the encrypted file wiped under a new key. Nothing outside taharah moves.
export function resetTaharahTracking(): void {
  useUserStore.getState().setTaharahEnabled(false);
  useTaharahStore.getState().reset();
  clearTaharahStorage();
}

export function chooseNusach(next: Nusach): void {
  const user = useUserStore.getState();
  user.setNusach(next);
  if (user.taharahEnabled) useTaharahStore.getState().adoptPresetFor(next);
}

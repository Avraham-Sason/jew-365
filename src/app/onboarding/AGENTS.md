# AGENTS.md

## Purpose

- Own the first-run onboarding flow for welcome, profile, nusach, location/notification setup, and ready state.

## Ownership

- [index.tsx](index.tsx) owns the onboarding entry route. Under the full [AppLogo](../../components/AppLogo.tsx) mark (112 points) it shows the app name (`onboarding.welcomeTitle`) and its tagline (`onboarding.welcomeBody`), then the smaller registration heading (`onboarding.registerTitle`, gender-aware) with `onboarding.registerBody` above the name and phone fields. Under Continue, off web, `onboarding.restore` picks a backup file and restores it with no confirmation (there is nothing to lose yet), then asks for notification permission and rebuilds once granted; the restored profile is onboarded, so the root layout's guard moves to home. A rejected file shows its `backupFailureKey()` message. The registration heading, body and fields sit on a padded [Card](../../components/Card.tsx).
- [profile.tsx](profile.tsx) owns the second step: gender, marital status, and the opt-in to taharat hamishpacha tracking. Choosing a gender goes through `chooseGender()`, which also sets the library defaults for it (no tefillin for a woman) and the starting palette (`paletteForGender()`: gold for a man, pink for a woman, plum or dark inside a dark palette), so the step never writes the mitzvot store or the theme itself and the palette follows the gender chosen here.
- The location step shows the default city with `settings.locationStatus.missing` until GPS or a city chip confirms it; the status never reads "ready" for a guess.
- [nusach.tsx](nusach.tsx), [location.tsx](location.tsx), and [ready.tsx](ready.tsx) own their respective onboarding steps. The ready step's mark is an [IconTile](../../components/IconTile.tsx) (`check`, size 64), never a text glyph. It also lists what the app will remind about: the names of the enabled `MITZVOT` (localized, joined with " · ", read from `useMitzvotStore`) under `onboarding.readyList`, and a link, `onboarding.readyEdit`, to `/mitzvot` where they can be changed before the user finishes.
- Every step draws its progress with [OnboardingDots](../../components/OnboardingDots.tsx) and `ONBOARDING_STEPS`; a new step raises that constant and shifts the later steps' indexes.

## Local Contracts

- Onboarding state is stored through [../../stores/AGENTS.md](../../stores/AGENTS.md).
- Continue on the profile step stays disabled until a gender and a marital status are both chosen. The status label follows the gender, the key `profile.maritalStatus.<status>.<gender>`, with `neutral` in place of the gender until one is chosen. The opt-in card shows only while `taharahOffered()` holds, so a single user never sees it. The gender, the marital status, the tracking switch and the nusach choice go through [taharahOptIn.ts](../../stores/taharahOptIn.ts) (`chooseGender`, `chooseMaritalStatus`, `setTaharahTracking`, `chooseNusach`), never straight to the stores: choosing single while tracking is on switches it off; switching tracking on sets the taharah role from the gender and the preset from the nusach chosen so far; changing the gender while tracking is on updates the role; picking a nusach with tracking on adopts its preset. The guard that protects a worked preset lives in `useTaharahStore` (no events and rules identical to the current preset's), so a later nusach pick never overwrites a recorded cycle or a hand-edited rule.
- Location and notification permission behavior must use [../../services/AGENTS.md](../../services/AGENTS.md) wrappers.
- Continue on the location step stays disabled (dimmed, `accessibilityState.disabled`) while `locationStatus` is not `ready`, with `onboarding.locationRequired` under it: the default city is a guess, so the step cannot be passed until a GPS fix or a city chip writes `ready`.
- The location step's notifications card answers every press (the user asked on 2026-10-08): the button dims and shrinks while pressed, shows a spinner while the OS dialog is open, and the card fades out once `notificationPermission` is `granted`, or never shows when the mount-time `syncNotificationPermissionStatus()` finds it granted. A refusal of this screen's own request turns the card into `onboarding.notificationsBlocked` with a button to the OS settings; the stored `denied` alone does not, because it also means "never asked".
- User-facing copy must stay in [../../i18n/AGENTS.md](../../i18n/AGENTS.md).

## Work Guidance

- Keep permission explanations accurate to [../../../app.json](../../../app.json) native permission strings and actual behavior.
- Do not assume Expo Go can verify native notification/MMKV behavior.
- A selectable option on a step is [ChoiceRow](../../components/ChoiceRow.tsx), as the profile and nusach steps use it, each set inside a `radiogroup` view named by its heading (`profile.gender`, `profile.maritalStatus`, `onboarding.nusachTitle`); the location step's city picker is [ChipRow](../../components/ChipRow.tsx). No step hand-rolls either.
- Every step's Continue, the ready step's finish and the location refresh are the shared [Button](../../components/Button.tsx), disabled through its `disabled` prop; the location step's notifications button stays screen-local, because it shrinks while pressed and spins while the OS dialog is open. An accent card (the taharah opt-in, the notifications card) is `goldLight` with no border. The labels above the welcome fields and the profile's two choice groups are `field` [SectionLabel](../../components/SectionLabel.tsx)s.

## Verification

- Run `pnpm test -- src/app/__tests__/routes.test.ts` after onboarding route changes.
- Run `pnpm test -- src/i18n/__tests__/i18n.test.ts` after onboarding copy changes.
- Run `pnpm typecheck` after onboarding state or service changes.

## Child DOX Index

- No child AGENTS.md files.

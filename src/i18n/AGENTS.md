# AGENTS.md

## Purpose

- Own translation dictionaries and locale wrapper behavior.

## Ownership

- [he.json](he.json) is the primary Hebrew dictionary.
- [en.json](en.json) is the English dictionary.
- [index.ts](index.ts) owns `setLocale()`, `translate()`, `t()` and `useI18n()`.
- Translation parity tests live in [__tests__/](__tests__/).

## Local Contracts

- Keep dictionaries flat, with key parity between Hebrew and English.
- Do not replace Hebrew source strings with English.
- Normal route/component copy should use i18n keys rather than local string literals.
- `currentLocale` and `currentGender` track the user store through one subscription, so non-React callers (the notification scheduler) are never a render behind. `useI18n()` returns `{ language, gender, t }`, with `t` bound to the current render's language and gender.
- Gendered copy uses a `.f` sibling key: `translate(scope, options, locale, gender)` reads `<scope>.f` when `gender` is `female` and that key exists in the table, and the base key otherwise. The base key is the masculine or neutral form, so a male, unanswered or neutral case never needs a `.f`. Callers pass the base key and never name a `.f` key. Every `.f` key needs a base key; English `.f` keys repeat the English base text so parity holds.

## Work Guidance

- Add both Hebrew and English values in the same change.
- Copy that addresses the user in the second person gets a Hebrew `.f` variant; neutral wording needs none.
- Keep app-name and brand strings aligned with [../../app.json](../../app.json) and release docs under [../../release/AGENTS.md](../../release/AGENTS.md).

## Verification

- Run `pnpm test -- src/i18n/__tests__/i18n.test.ts` after any dictionary or locale wrapper change; it pins key parity, non-empty values, the `.f` lookup and interpolation, and that `app.name` matches the native names: `expo.name` and `ios.infoPlist.CFBundleDisplayName` in [../../app.json](../../app.json) and both files in [../../locales/](../../locales), with an Xcode target name that keeps a Latin letter.
- Run `pnpm typecheck` after [index.ts](index.ts) changes.

## Child DOX Index

- No child AGENTS.md files.

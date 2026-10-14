# AGENTS.md

## Purpose

- Own shared TypeScript domain types used across data, services, stores, and UI.

## Ownership

- [mitzvah.ts](mitzvah.ts) owns mitzvah, reminder, content block, and related domain shapes. `Weekday` is JS `getDay()` numbering (0 is Sunday). `CustomMitzvah.activeDays` lists the weekdays a custom mitzvah applies on (absent means every day), and `CustomMitzvah` has no `category`: [../data/customMitzvotAdapter.ts](../data/customMitzvotAdapter.ts) derives it from the hours, and a stored mitzvah that still carries the key keeps loading with it ignored. A `ContentBlock` is `text`, `blessing`, `link` or `siddur` (a bundled siddur text by its `SiddurTextId`); the reader's custom text and the notification body read only `text` and `blessing`. A `Reminder`'s `ReminderAnchor` is `start` or `end` (`offsetMin` is minutes from that edge of the window) or `clock` (`offsetMin` is minutes after midnight, 0-1439, on the location's clock); only a registry mitzvah and the reminder editor use `clock`, a custom mitzvah never stores one.
- [zmanim.ts](zmanim.ts) owns zmanim-related shared types. `Location.cityId` is the stable id of the [../data/cities.ts](../data/cities.ts) entry a location came from; it is optional because a GPS fix far from every city has none and a snapshot saved before the field existed lacks it. [../stores/useUserStore.ts](../stores/useUserStore.ts) re-resolves a saved location by it on every hydrate.
- [siddur.ts](siddur.ts) owns siddur text, section, segment, run, condition, day-flag and passage-label shapes (`optional` and `minyan`; a label may carry `alone`, which opens its fold by default when praying alone, or `marriedOnly`, which hides its passage from a single reader), a section's optional `chapter` (the picker entry it opens), its optional `headings` (`SectionHeading`s the reader draws above its card: level 1 opens a book of a text, level 2 a part of it; only Tehillim carries them), the `SegmentBlock` the reader renders, and the text ids: `MitzvahTextId` (a mitzvah's id), `StandaloneTextId` (a text with no mitzvah) and `SiddurGroup` (how the catalog groups the latter: `meals`, `general`, `occasions`, each also an icon name in [../components/MitzvahIcon.tsx](../components/MitzvahIcon.tsx); the catalog's today and prayers cards hold mitzvah texts and are not groups). The generated text assets follow the text ids, so a new or renamed id here needs `pnpm siddur:build`; a group change does not. A `Run`'s style is `b` (bold), `n` (a note, drawn small) or `t` (a targum line, drawn smaller in `textSub`). `SiddurText.nusach` is optional, because a Chok LeYisrael text and a text shared by every nusach (Tikkun HaKlali, Tehillim) have none, and its optional `dedication` is the line the reader shows above the sources.
- [chok.ts](chok.ts) owns the Chok LeYisrael shapes: `ChokSlot` (`sun` to `thu`, `thuNight`, `fri`), `ChokSectionKind`, `HaftarahVariant` (`sephardi`, `ashkenazi`), `ChokDoubleChoice` (`first`, `second`, `both`), `ChokSection` (kind, the heading as the source prints it, an optional haftarah variant, `SiddurSegment`s) and `ChokAsset`, the JSON of one generated parasha (`parasha` by its hebcal name, `credit`, `dedication`, `slots`). A change to `ChokAsset` or `ChokSection` changes the output of [../../scripts/chok/AGENTS.md](../../scripts/chok/AGENTS.md) and needs a rebuild.

- [taharah.ts](taharah.ts) owns the niddah-cycle shapes: `Onah` (a hebcal absolute day number plus night or day), `TaharahRules`, `TaharahSettings` and the preset ids, the raw `TaharahEvent` union, and the derived `CycleState`, `PerishaOnah`, `KavuaHint` and `TaharahTask`. The engine that produces the derived shapes is [../utils/taharah/](../utils/taharah/).

## Local Contracts

- Type changes must be coordinated with all consumers in [../data/AGENTS.md](../data/AGENTS.md), [../services/AGENTS.md](../services/AGENTS.md), [../stores/AGENTS.md](../stores/AGENTS.md), and [../app/AGENTS.md](../app/AGENTS.md).
- Keep optional fields backward-compatible when persisted data or custom mitzvot may already exist.
- In [taharah.ts](taharah.ts) only `TaharahEvent` and the settings are persisted input. `CycleState`, `PerishaOnah`, `KavuaHint` and `TaharahTask` are derived by replay and never stored, so a new event field is optional and a rule change needs no migration.

## Work Guidance

- Favor explicit domain names over broad generic shapes.
- Avoid widening types just to suppress local errors; fix the caller or model the state precisely.

## Verification

- Run `pnpm typecheck` after any type change.
- Run affected domain tests when a type change changes runtime behavior.

## Child DOX Index

- No child AGENTS.md files.

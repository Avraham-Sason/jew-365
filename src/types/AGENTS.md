# AGENTS.md

## Purpose

- Own shared TypeScript domain types used across data, services, stores, and UI.

## Ownership

- [mitzvah.ts](mitzvah.ts) owns mitzvah, reminder, content block, and related domain shapes.
- [zmanim.ts](zmanim.ts) owns zmanim-related shared types.
- [siddur.ts](siddur.ts) owns siddur text, section, segment, run, condition, day-flag and passage-label shapes (`optional` and `minyan`), a section's optional `chapter` (the picker entry it opens), the `SegmentBlock` the reader renders, and the text ids: `MitzvahTextId` (a mitzvah's id), `StandaloneTextId` (a text with no mitzvah) and `SiddurGroup` (how the catalog groups the latter). The generated text assets follow it, so a change here needs `pnpm siddur:build`.

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

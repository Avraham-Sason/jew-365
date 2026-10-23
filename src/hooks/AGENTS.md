# AGENTS.md

## Purpose

- Own React hooks shared by more than one screen or component.

## Ownership

- [useNow.ts](useNow.ts) owns the clock tick: `useNow(intervalMs = 30_000)` returns a `Date` that starts at mount, first moves at the next whole minute, then every `intervalMs`, and stops on unmount. Home, the taharah dashboard and the taharah log all read it, so a countdown, a stage, a task window and the sunset guard follow the same clock and the day rolls over on the minute.
- [useDayModel.ts](useDayModel.ts) owns the model every mitzvah screen builds from: `useDayModel()` returns a `DayModel`, and `dayModelFrom(state)` is the pure builder the hook wraps, so tests call it with plain objects. The model holds `allMitzvot` (the registry, then the custom mitzvot in `createdAt` order, filtered by `nuschaotSupported`), `enabled` (those switched on), `location`, `nusach`, `inIsrael`, `language`, `chokInstalled` (whether the Chok LeYisrael add-on is installed, from a `useChokStore` subscription, so the library follows an install or a delete at once), `settings` (`{ nusach, halachicOpinions, inIsrael }`), `nameFor()` (the language's name, Hebrew when `en` is missing) and `checkInInput()`.
- Tests live in [__tests__/](__tests__/).

## Local Contracts

- A hook here holds React state or effects. Pure computation belongs in [../utils/AGENTS.md](../utils/AGENTS.md), persisted state in [../stores/AGENTS.md](../stores/AGENTS.md).
- `useDayModel()` subscribes to exactly the user store's `location`, `nusach`, `inIsrael`, `language` and `halachicOpinions` (one `useShallow` slice), the mitzvot store's `activeMitzvot`, the custom store's `items` and the chok store's `installed !== null` (`chokInstalled`). The model, `allMitzvot`, `enabled` and `settings` keep their identity until one of those changes, so they are safe as memo dependencies.
- Completions are not subscribed. `checkInInput()` reads `completions`, `skipped` and `checkIns` from `useCompletionsStore.getState()` at the moment it is called and takes `enabled`, `settings`, `location` and `enabledSince` from the model. A screen that must re-run when a mark changes keeps its own `useCompletionsStore` selector and lists it as a memo dependency, with an `eslint-disable` that says why.
- A screen never rebuilds the mitzvah list, the enabled set, the settings object, the check-in input or the `language === 'en' && name.en` choice itself.
- A screen that needs an exact instant reads `new Date()` where it decides; `useNow()` is the re-render trigger and a stable memo dependency, and may lag by up to `intervalMs`.
- Neither hook knows the app's day (it turns at alot, not midnight): a screen calls `appDay()` from [../utils/locationDay.ts](../utils/locationDay.ts) and `appDayWindow()` / `currentOrNextWindow()` from [../utils/buildDayTimeline.ts](../utils/buildDayTimeline.ts) at the instant it reads, so the `DayModel` keeps its identity while the clock moves.
- Never re-implement the tick inline with `setInterval` in a screen.

## Work Guidance

- Add a hook only when a second caller exists; keep it small enough to read at a glance.

## Verification

- Run `pnpm test -- src/hooks` after changing [useDayModel.ts](useDayModel.ts).
- Run `pnpm typecheck` after changing a hook signature.

## Child DOX Index

- No child AGENTS.md files.

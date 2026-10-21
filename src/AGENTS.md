# AGENTS.md

## Purpose

- Own the production application source for the Expo/React Native app.

## Ownership

- [app/AGENTS.md](app/AGENTS.md) owns Expo Router screens and route-level behavior.
- [components/AGENTS.md](components/AGENTS.md) owns reusable UI components.
- [data/AGENTS.md](data/AGENTS.md) owns static registries and adapters.
- [hooks/AGENTS.md](hooks/AGENTS.md) owns React hooks shared by more than one screen, such as the clock tick.
- [i18n/AGENTS.md](i18n/AGENTS.md) owns translation dictionaries and locale helpers.
- [services/AGENTS.md](services/AGENTS.md) owns non-React logic, native wrappers, notifications, location, storage, and reset behavior.
- [stores/AGENTS.md](stores/AGENTS.md) owns persisted Zustand stores.
- [theme/AGENTS.md](theme/AGENTS.md) owns tokens, colors, typography, shadows, and theme provider.
- [types/AGENTS.md](types/AGENTS.md) owns shared TypeScript domain types.
- [utils/AGENTS.md](utils/AGENTS.md) owns pure computation helpers.
- [testing/AGENTS.md](testing/AGENTS.md) owns test-only fixture helpers. Nothing in the shipped app may import from there.

## Local Contracts

- TypeScript is strict; keep the `@/*` alias aligned with [../tsconfig.json](../tsconfig.json) and [../babel.config.js](../babel.config.js).
- Keep app logic in services, utils, stores, and data modules where possible; routes and components should mostly compose them.
- Do not replace Hebrew source strings with English; normal user-facing copy should go through [i18n/AGENTS.md](i18n/AGENTS.md).

## Work Guidance

- Add or update tests close to the affected domain.
- Keep native-adjacent changes compatible with Expo, Jest, Metro, and web shims.
- Do not commit generated `ios/` or `android/` folders unless the user explicitly asks for native project changes.

## Verification

- Run `pnpm typecheck` for TypeScript-facing changes.
- Run `pnpm test` for broad app-source changes.
- Use the closer child AGENTS.md for targeted test commands.

## Child DOX Index

- [app/AGENTS.md](app/AGENTS.md) - Expo Router routes, navigation, layouts, onboarding, tabs, and route tests.
- [components/AGENTS.md](components/AGENTS.md) - Reusable React Native UI components.
- [data/AGENTS.md](data/AGENTS.md) - Mitzvah registry, city/nusach data, and custom-mitzvah adapters.
- [hooks/AGENTS.md](hooks/AGENTS.md) - Shared React hooks.
- [i18n/AGENTS.md](i18n/AGENTS.md) - Hebrew and English dictionaries and locale wrappers.
- [services/AGENTS.md](services/AGENTS.md) - Zmanim, Hebcal, location, storage, notifications, completions, and reset services.
- [stores/AGENTS.md](stores/AGENTS.md) - Persisted Zustand stores and middleware.
- [theme/AGENTS.md](theme/AGENTS.md) - Theme tokens, colors, typography, shadows, and provider.
- [types/AGENTS.md](types/AGENTS.md) - Shared domain types.
- [testing/AGENTS.md](testing/AGENTS.md) - Test-only fixture helpers.
- [utils/AGENTS.md](utils/AGENTS.md) - Pure schedule/history helper logic.

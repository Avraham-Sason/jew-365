# AGENTS.md

Canonical working notes for AI agents in this repository. Keep this file current when architecture, commands, routes, stores, notification behavior, or test strategy changes.

## Project Snapshot

- App: Hebrew-first Expo/React Native mobile app for daily mitzvah reminders inside halachic time windows. The current display name is configured in [app.json](app.json); the package/slug remains `jew-in-time`. The English display name, "Jew in Time", comes from [locales/en.json](locales/en.json).
- EAS project: `@avraham-sason/jew-in-time`, ID `8cc2a377-fcc9-4c78-bdde-ec0fc8f2a84e`.
- Runtime model: local/offline first. Zmanim, Hebrew calendar, history, settings, completions, and reminders are computed on-device. There is no backend; the one call that carries personal data off the device is a message the user sends from Settings → Contact us, through Formspree ([src/services/ContactService.ts](src/services/ContactService.ts)).
- Primary platforms: iOS, Android, and a web build for smoke/headless checks. Native notification/MMKV behavior requires a dev client or native build, not plain Expo Go.
- Package manager: [pnpm-lock.yaml](pnpm-lock.yaml) is present. Prefer `pnpm` for installs and scripts to avoid lockfile churn.

## Commands

```bash
pnpm start                         # expo start / Metro
pnpm start:dev                     # expo start --dev-client
pnpm prebuild:clean                # regenerate native folders from app.json (run after app.json identity changes)
pnpm android                       # expo run:android
pnpm android:device                # expo run:android --device
pnpm ios                           # expo run:ios
pnpm web                           # frees port 8081, then expo start --web
pnpm test                          # jest
pnpm test:tz                       # full suite across UTC, Jerusalem, LA and Kiritimati
pnpm test:tz -- path/file.test.ts  # one file across the same four zones
pnpm test -- path/to/file.test.ts  # single Jest file
pnpm test -t "name fragment"       # Jest test-name filter; no --, which pnpm passes on and Jest then reads -t as a path
pnpm typecheck                     # tsc --noEmit
pnpm lint                          # eslint (eslint-config-expo + prettier config), zero warnings expected
pnpm format                        # prettier --write; format:check is the read-only form
pnpm check:dox                     # AGENTS.md links, section order and Child DOX Index
pnpm siddur:build                  # rebuild the bundled nusach texts from pinned Sefaria and Wikisource sources
pnpm chok:build                    # rebuild the Chok LeYisrael assets from the cached raktora pages (local only); --empty restores the committed empty map
pnpm doctor                        # expo-doctor
pnpm build:android:development     # EAS development APK
pnpm build:android:preview         # EAS internal preview APK
pnpm build:android:production      # EAS production AAB for the store
pnpm build:android:production-apk  # EAS production APK for direct install
pnpm build:ios:production          # EAS production build for App Store / TestFlight
pnpm submit:ios                    # upload the latest iOS build to App Store Connect
pnpm update:development --message "…"  # numbered EAS update to the development channel
pnpm update:preview --message "…"      # numbered EAS update to the preview channel
pnpm update:production --message "…"   # numbered EAS update to production — reaches installed users
```

`pnpm web` calls [scripts/free-port.js](scripts/free-port.js) (cross-platform) and may kill a listener on port 8081. Use a dev client/native build when verifying `react-native-mmkv`, background tasks, or notifications.

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs `typecheck`, `lint`, `check:dox` and `test:tz` on every push to `main` and every pull request. The husky pre-commit hook runs lint-staged (`eslint --fix` and `prettier --write` on the staged files), so a commit never carries a lint error. ESLint's config is [eslint.config.js](eslint.config.js); test and mock files may keep `jest.mock` above their imports and `require` inside factories.

Jest ([package.json](package.json)), Metro ([metro.config.js](metro.config.js)) and `check:dox` all ignore [.claude/](.claude), where agent sessions keep full worktree copies of the repo. Without that, a worktree's tests run twice against the wrong module paths, its AGENTS.md files fail the DOX check, and a `pnpm install` inside it crashes Metro's file watcher.

## Release and Updates

Two different mechanisms ship this app, and the choice is not stylistic: one reaches everybody within a minute, the other reaches nobody until users install a new binary.

- **Anything Metro bundles** — TypeScript, JSX, i18n strings, and bundled assets (fonts and the siddur texts included, and the Chok LeYisrael texts once their source's owner permits) — ships as an over-the-air update: `pnpm update:preview`, or `pnpm update:production` for real users.
- **Anything native** — a dependency with native code, an Android permission, a config plugin under [scripts/](scripts), or an identity field in [app.json](app.json) — needs a build: `pnpm build:android:production`. EAS builds it on its own servers and runs prebuild there, which is why the native folders stay gitignored and are safe to delete locally.
- A native module that `expo` already links transitively (`expo-file-system`, `expo-keep-awake`) may be added as a direct dependency over OTA only at the exact version the shipped binary carries. Check the committed lockfile before raising one.
- The taharah feature added `expo-secure-store`, `expo-crypto` and `expo-local-authentication`, none of which the 1.0.16 binary carries, Until a build with a version bump ships, nothing that imports those modules may go out as an update; 1.0.18 is that build, and it also carries `@sentry/react-native` and `expo-background-task` (which replaced `expo-background-fetch`).
- Backup and restore (the user's call, 2026-10-14) raised `version` to 1.0.19: it adds `expo-sharing`, which no earlier binary carries, and turns Android Auto Backup on through a whitelist (`allowBackup: true` plus [scripts/withAndroidBackupRules.js](scripts/withAndroidBackupRules.js)), which only a build applies. Until 1.0.19 is built and installed, an update publishes to runtime 1.0.19 and reaches nobody; 1.0.18 installs keep the last 1.0.18 bundle.
- Crash reporting is Sentry ([src/services/crashReporting.native.ts](src/services/crashReporting.native.ts)). It is native, so it ships only in a build. It stays off without `EXPO_PUBLIC_SENTRY_DSN`, which Metro inlines at bundle time (see [.env.example](.env.example)); `SENTRY_AUTH_TOKEN`, which uploads source maps during an EAS build, is an EAS secret, never a file. `pnpm.onlyBuiltDependencies` in [package.json](package.json) allows the `postinstall` of `@sentry/cli`, which pnpm 10 would otherwise skip, and EAS needs it too for the `sentry-cli` binary the Sentry Expo plugin runs during a build. The `organization` and `project` of the `@sentry/react-native/expo` entry in [app.json](app.json) are placeholders until the user fills them. Source-map upload is disabled in every build profile of [eas.json](eas.json) (`SENTRY_DISABLE_AUTO_UPLOAD`) until a Sentry account exists (`SENTRY_AUTH_TOKEN` as an EAS secret and the real `organization` / `project` in [app.json](app.json)); removing the two production `env` lines turns the upload back on.

An update carries no native code, so shipping a native change as an update produces a bundle that calls into something the installed binary does not have. Prefer an update; reach for a build only when the change is actually native.

### Every update is numbered

Settings shows `<version>-<n>`: `n` counts the updates published on that channel for that `version`, and a build shows `-0`. The user asked for it on 2026-10-08 so the phone shows which update it runs.

- `pnpm update:*` runs [scripts/publish-update.js](scripts/publish-update.js), which takes the next `n` from EAS and publishes with it. Never publish with `npx eas-cli update` directly: the update would carry no number and the next one would repeat a number.
- `n` starts each EAS message (`1.0.16-5: …`), so the dashboard and `eas update:list` show the same label as the phone. The first numbered update on 1.0.16 was 5, because four updates had shipped on it before numbering began.
- A ready-update banner floats over every screen once an update is downloaded (`UpdateBanner` in [src/components/UpdateBanner.tsx](src/components/UpdateBanner.tsx), mounted by the root layout; the user's call, 2026-10-10). The app checks for one at launch (expo-updates) and on every return to the foreground. The hourly background task (`jew-in-time-daily-rebuild`) checks as well and, outside development, holy blocks and a switched-off notifications setting, presents one `update:<update id>` notification per downloaded update (`notifyIfUpdateReady()` in [src/services/NotificationScheduler.ts](src/services/NotificationScheduler.ts)); a tap reloads into the update, or opens home when it, or a newer one, is already running. Background fetch runs when the OS allows, so the notice can trail the publish by an hour or more on Android and by longer on iOS.
- Launches, failed launches and unique users of an update: `npx eas-cli update:insights <group-id>`, or the update's Insights tab on expo.dev.
- Roll back by republishing the last good group, which keeps its number on the phone: `npx eas-cli update:republish --group <group-id> --message "Rollback to <version>-<n>" --non-interactive`. `npx eas-cli update:roll-back-to-embedded` returns every install to its build's bundle (`-0`).

### Never raise `version` for a JS change

[app.json](app.json) sets `runtimeVersion` to the `appVersion` policy, so an update only reaches installs whose build carried the **same** `version`. Raising `version` therefore cuts every existing install off from over-the-air updates until a new build ships **and** each user installs it — the previous version keeps running the last bundle published under it, and nothing warns that the two diverged.

Bump `version` only in the change that also produces a native build, and update [package.json](package.json) in the same edit: nothing enforces that the two agree, and they were already one release apart at 1.0.12 / 1.0.13.

### Version codes are remote

[eas.json](eas.json) sets `appVersionSource` to `remote`, so EAS owns the Android `versionCode` and the iOS `buildNumber`, and every profile with `autoIncrement` raises them itself. Never hand-edit a version code or build number, and never add one to [app.json](app.json).

### Store submission is manual

`submit.production` in [eas.json](eas.json) is empty, so no submission runs unattended.

Android has no Google Play service account, so `eas submit` cannot upload at all: a production build produces an artifact and uploading it to the Play Console is a human step.

iOS has no stored credentials either, but `pnpm submit:ios` still works — `eas submit --latest` prompts for the Apple account and target app each run. Do not hardcode an Apple ID, team ID or ASC app ID into [eas.json](eas.json) unless the user supplies real values.

Store copy lives in [release/](release).

## Source Map

- [src/app/](src/app) - Expo Router routes. The router root is set in [app.json](app.json) via `extra.router.root`.
- [src/app/_layout.tsx](src/app/_layout.tsx) - Root providers, font loading, onboarding redirect guard, RTL bootstrap, notification handler init, and the exported `ErrorBoundary`.
- [src/app/(tabs)/](<src/app/(tabs)>) - Main tabs: more, siddur, home, history, settings; the hidden `index` redirects to home. More is a hub of rows that open stack screens: the schedule, Chok LeYisrael while its content is bundled, and Tehillim.
- [src/app/mitzvot.tsx](src/app/mitzvot.tsx) - The mitzvot library as a stack screen, opened from Settings and the onboarding ready screen.
- [src/app/onboarding/](src/app/onboarding) - Onboarding flow: welcome, profile (gender, marital status and the taharah opt-in), nusach, location/notifications, ready.
- [src/app/taharah/](src/app/taharah) - Taharat hamishpacha: dashboard, event log, calendar and minhag settings, behind the biometric lock in its `_layout.tsx`.
- [src/app/mitzvah/[id].tsx](<src/app/mitzvah/[id].tsx>) - Static and custom mitzvah details, reminders, content blocks.
- [src/app/siddur/[id].tsx](<src/app/siddur/[id].tsx>) - Nusach reader: a mitzvah's or a standalone text in the user's nusach and language, resolved for the day, with optional auto-scroll; it also reads Chok LeYisrael (`chok_leyisrael`), a week's portion by day with a day row and, in a double week, the choice of parasha, and, while the Chok LeYisrael mitzvah is on, "סיימתי" for a day of the current week up to today and a closed make-up fold for each earlier unmarked day of the week. Its section picker lists a text's chapters (Shacharit's eleven stations, from ברכות השחר to קוה אל ה׳, plus Hallel and Musaf on their days; Tehillim's prayer before, its seven days of the weekly division and its prayer after), or every section of a text without chapters.
- [src/app/(tabs)/siddur.tsx](<src/app/(tabs)/siddur.tsx>) - Siddur tab: today's texts first (only those with a text today; the card is absent when none has), then a prayers card with shacharit, mincha and maariv, then the sixteen standalone texts by group (meals; general, led by Tikkun HaKlali, Tehillim (the whole book, one text for every nusach), Nishmat Kol Chai, the bedtime Shema and the traveler's prayer, then the blessings, the mezuzah and Kiddush Levana; festivals and celebrations, ending with Selichot, by each nusach's season), each greyed out on a day it is not said. [src/app/siddur/index.tsx](src/app/siddur/index.tsx) only redirects `/siddur` to it.
- [src/app/schedule.tsx](src/app/schedule.tsx) - Schedule, a stack screen opened from the More tab: day, week and month views with previous / next arrows in its header, and a day drilldown into `/day/[date]`.
- [src/app/day/[date].tsx](<src/app/day/[date].tsx>) - Read-only per-day route for schedule/history drilldown.
- [src/app/custom-mitzvah.tsx](src/app/custom-mitzvah.tsx) - Create/edit custom mitzvot.
- [src/app/checkin.tsx](src/app/checkin.tsx) - Post-block check-in: mark what was done during the Shabbat / Yom Tov block that just ended.
- [src/app/hilulot.tsx](src/app/hilulot.tsx) - Hilulot of tzaddikim: the notification switch and the coming hilulot, opened from the library row and a hilula notice.
- [src/app/rosh-chodesh.tsx](src/app/rosh-chodesh.tsx) - Rosh Chodesh: the notification switch and the coming Rosh Chodesh days, opened from the library row and a Rosh Chodesh notice.
- [src/app/report.tsx](src/app/report.tsx) - Weekly report: a week's marks, the mitzvah to improve and what the next week holds, with a pill each way between weeks; opened from the history tab's Reports pill and the report notice.
- [src/data/](src/data) - Static registries: mitzvot, cities, nuschaot, and custom-to-static adapter.
- [src/services/](src/services) - Non-React logic and native wrappers: zmanim, Hebcal, location, storage, backup and restore, notifications, completions, reset, OS-settings deep links.
- [src/stores/](src/stores) - Zustand stores persisted through MMKV.
- [src/components/](src/components) - Reusable React Native UI.
- [src/theme/](src/theme) - Theme colors, typography, spacing, animation/radius tokens.
- [src/utils/](src/utils) - Pure helpers: day timeline, history stats, the weekly report, the shared `skipOn` predicate, the app's day (`appDay()` in [src/utils/locationDay.ts](src/utils/locationDay.ts)), the Chok LeYisrael portion of a day or an instant and the reader text built from its assets ([src/utils/chok.ts](src/utils/chok.ts)), and the taharah engine under [src/utils/taharah/](src/utils/taharah).
- [src/hooks/](src/hooks) - Shared React hooks (`useNow`).
- [src/i18n/](src/i18n) - Flat [he.json](src/i18n/he.json) and [en.json](src/i18n/en.json) dictionaries plus a tiny translation wrapper.
- [src/testing/](src/testing) - Test-only fixture helpers. Never imported by shipped code.
- [locales/](locales) - Native string tables (`he.json`, `en.json`) wired by `locales` in [app.json](app.json): the app's display name per language on iOS (`CFBundleDisplayName`) and Android (`app_name`), and the iOS location and Face ID permission prompts. Each file is split into `ios` and `android` objects, because Expo writes every top-level key into Android `strings.xml` and Android lint rejects a translated key with no default-locale entry. They are native, so a change ships only in a build.
- [scripts/](scripts) - Local workflow scripts and Expo config plugins.
- [scripts/siddur/](scripts/siddur) - Build from pinned Sefaria and Wikisource sources to [assets/siddur/](assets/siddur), the generated nusach texts.
- [scripts/chok/](scripts/chok) - Build from the raktora.50webs.com pages of "חוק לישראל השלם" to the Chok LeYisrael assets and [src/data/chokAssets.generated.ts](src/data/chokAssets.generated.ts). Until the owner's written permission the assets and the page cache are gitignored and the committed map is empty, which hides every Chok LeYisrael surface.
- [design/jew-in-time/](design/jew-in-time) - Claude Design handoff. Use it only for UI/design work; read its README and Hi-Fi prototype before porting visuals. [design/stage1-previews/index.html](design/stage1-previews/index.html) is the preview board for the shipped design system (logo, icon styles, palettes, type scale).
- [docs/](docs) - Public site published through GitHub Pages: support page, the privacy policy both stores link to, and [taharah-review.html](docs/taharah-review.html), the rule table a rav reviews.
- [release/](release) - Store listing and privacy policy drafts.
- [AUDIT.md](AUDIT.md) - Failure-point audit with per-finding status. Read before assuming a known defect is still open.
- [not-close.md](not-close.md) - Every open item in one file: tasks, bugs, open questions, and other open items (reviews, external dependencies, unverified paths, cleanup). New open work goes here, never into a separate tasks, bugs or questions file; an item is deleted in the change that closes it.

[CLAUDE.md](CLAUDE.md) is the Claude Code compatibility bridge. This file remains the canonical cross-agent context.

## Architecture Rules

- TypeScript is strict. The `@/*` alias maps to `src/*` in both [tsconfig.json](tsconfig.json) and [babel.config.js](babel.config.js); update both if aliases change.
- Keep app logic in services/utils/stores where possible. Components and routes should mostly compose state, services, and UI.
- Do not add a backend or remote API call for calendar/zmanim behavior. Existing logic is local through `kosher-zmanim`, `@hebcal/core`, and `luxon`.
- Do not commit generated native folders unless the user explicitly asks for native project changes. `ios/` and `android/` are gitignored and normally generated by Expo prebuild/run.
- Treat an existing `ios/`/`android/` folder as disposable cache, never as state. Expo skips prebuild when the folder exists, so a stale one silently builds the wrong `applicationId`, scheme, update URL and app name. After any change to identity fields in [app.json](app.json), run `pnpm prebuild:clean`.
- Hebrew is primary. Do not replace Hebrew source strings with English. User-facing copy should usually go through i18n when it is normal UI text.

## Mitzvah Data Model

The central registry is [src/data/mitzvot.ts](src/data/mitzvot.ts).

Static mitzvah IDs currently include:

- `tefillin`
- `krias_shma_shacharit`
- `shacharit`
- `mincha`
- `maariv`
- `birchot_hashachar`
- `candle_lighting`
- `havdalah`
- `sefirat_haomer`
- `chok_leyisrael`, only while `hasChokContent()` holds

Default enabled mitzvot are `tefillin`, `krias_shma_shacharit`, `shacharit`, `mincha`, and `maariv`. `tzitzit` was removed on 2026-10-11 (the user's call): `RETIRED_MITZVOT` in [useMitzvotStore.ts](src/stores/useMitzvotStore.ts) prunes it from every persisted map on hydrate, its old completion rows stay in storage and still count for the streak, and the tallit katan blessing survives, unfolded under a line that names who says it, at the top of the `tefillin` siddur text and at the start of Shacharit's tallit and tefillin section.

Chok LeYisrael (`chok_leyisrael`, `CHOK_LEYISRAEL` in [src/data/mitzvot.ts](src/data/mitzvot.ts), the user's call on 2026-10-11) is a `learning` mitzvah, off by default, appended to `MITZVOT` only while `hasChokContent()` holds, so with the committed empty map no surface lists, schedules or judges it. Its window is the reader's learning day: from alot to the next day's alot, or to candle lighting when a holy block opens that evening, and `null` on Shabbat, Yom Tov and the Friday of a Vezot Haberakhah week. Its reminders fire 240 minutes after alot and, only while it is not done, at 20:30 on the location's clock (a `clock` reminder, the user's call on 2026-10-12; 945 minutes after alot swung between 17:03 and 22:00 in London). Like any trigger outside its window it is dropped when the window ends first at candle lighting, so it never fires on a Friday or an erev in Jerusalem, Tel Aviv, Los Angeles or New York, and it does fire on a summer Friday in London, where candle lighting is after 20:30. An earlier day of the current week is marked late from the reader's make-up folds; a Yom Tov day can be marked too, but has no window, so it reaches only the streak.

Each `Mitzvah` has:

- `timeType`: `fixed-moment`, `range-within-day`, `sunset-trigger`, `date-range`, `monthly-window`, or `annual-seasonal`.
- `category`: daily/weekly/seasonal/learning grouping used by UI.
- `computeWindow(ctx)`: returns `{ start, end }` or `null`.
- `defaultReminders`: reminder definitions with `anchor`, `offsetMin`, `label`, optional `bodyVariants`, `includeContentInBody`, and `skipIfDone`. `anchor` is `start` or `end` (`offsetMin` is minutes from that edge of the window) or `clock` (`offsetMin` is minutes after midnight, 0-1439, on the location's clock: the reminder fires at the first such wall-clock time at or after the window's start). Only a registry mitzvah and its reminder editor use `clock`; a custom mitzvah never stores one.
- `skipOn`: skip contexts. Every surface consumes `shabbat`, `yomtov` and `cholHamoed` through `isSkippedAt()`. `cholHamoed` follows the tefillin minhag in `keepsCholHamoed()`: skipped in Israel and for every nusach but Ashkenaz abroad.
- `nuschaotSupported`: supported nusach IDs.
- optional `contentBlocks`: text/blessing/link blocks shown on detail screens and optionally included in notifications.

When adding or changing a mitzvah, update `MITZVOT`, any relevant i18n/UI labels, and tests under [src/data/__tests__/](src/data/__tests__), [src/services/__tests__/](src/services/__tests__), and any affected route/component tests.

Custom mitzvot live in `useCustomMitzvotStore` and are adapted through [customMitzvotAdapter.ts](src/data/customMitzvotAdapter.ts). Custom IDs are generated as `custom_<timestamp>_<suffix>`. Use `getAllMitzvot(nusach?)` or `findAnyMitzvah()` when a screen/service must include custom mitzvot. Passing the nusach applies `nuschaotSupported` filtering; every surface that lists mitzvot must filter the same way. A custom mitzvah applies only on its `activeDays` (absent means every day), takes its category from its hours, and may carry a `siddur` content block that opens a bundled text in the reader but never joins its custom text or its notification body.

## Zmanim and Calendar

- `ZmanimService.getZmanim(date, location)` wraps `kosher-zmanim` `ComplexZmanimCalendar`, resolves the calendar day in the location's timezone, caches up to 90 entries, and returns cloned `Date` objects. It returns `null` (never throws) when the sun neither rises nor sets. It replaces kosher-zmanim's antimeridian adjustment with `antimeridianAdjustment()`, because kosher-zmanim 0.9.0 reads a DST zone's raw offset with the wrong sign and gave Sydney and New Zealand the next day's zmanim.
- Sunrise/sunset use sea-level getters. `tzeitHakochavim` uses `getTzaisGeonim7Point083Degrees()`.
- Candle lighting uses the same sea-level sunset basis, via `candleLightingMinutes(location)`: 40 minutes in Jerusalem (local minhag), 18 elsewhere in Israel, 20 outside Israel, or `location.candleLightingMinutes` when set. It opens once per holy block, on its erev; havdalah once, at the block's exit, plus the Sunday night after a Tisha B'Av fast that falls on Sunday, as it is or deferred from Shabbat, at tzeit itself.
- Shabbat and Yom Tov leave `HOLY_BLOCK_EXIT_MIN` (10) minutes after tzeit, the user's call on 2026-10-10: `holyBlockExit(zmanim)` in [src/services/ZmanimService.ts](src/services/ZmanimService.ts) is the one place the margin lives. It sets a block's `end` (so the Shabbat screen, the pre-block notice and the check-in nudges show and use the exit), and `HebcalService.nightfall()` opens every night window of a block's last day (maariv, the Omer, havdalah, a tevila) at the exit instead of tzeit, so none starts inside the quiet block. The Hebrew date still turns at tzeit, and a fast still ends at tzeit.
- Shabbat and Yom Tov are ordinary days for history and the streak (user decision 2026-10-06), marked after the fact. Everything whose window reaches into a block waits in that block's check-in until it is finished or until the alot that ends the first weekday after the block (`checkInDeadline(block, location)`); only then is a missing mark a miss. [checkIn.ts](src/utils/checkIn.ts) owns that, and [historyStats.ts](src/utils/historyStats.ts) judges every item done, missed or still open.
- A holy block is a maximal run of Shabbat / Yom Tov / Yom Kippur days at the location (second-day Yom Tov by `inIsrael`), from candle lighting on the erev to the exit of the last day, ten minutes after its tzeit: `HebcalService.holyBlockAt()` / `holyBlockOn()`. The app is never active inside one, and that is the only mode — the user ruled out any setting for it on 2026-10-06. No notification fires strictly inside a block (`isQuietAt()`), and the root layout covers every route with `ShabbatScreen`. The edges stay open, so candle lighting at the start and havdalah or maariv at the end still fire.
- `HebcalService` wraps `@hebcal/core` for Hebrew dates, parasha, holidays, yom tov, Daf Yomi, Omer, and Shabbat.
- Always pass `Location` to `HebcalService.isShabbat(date, location)` for halachic boundary behavior. Without a location it falls back to Gregorian Saturday only.
- Avoid UTC date shortcuts for mitzvah logic.
- The app's day turns at alot hashachar, not at midnight (the user's call, 2026-10-12: the night belongs to the evening before). `appDay(instant, location)` in [src/utils/locationDay.ts](src/utils/locationDay.ts) is "today" everywhere a day is shown or a mark is filed: home, history and the streak, the weekly report, the schedule, the day view, the reader's default date and the check-in deadline. Its boundary is `HebcalService.dawnAt()` (04:00 on the location's clock where the sun neither rises nor sets), and an item's day ends at `appDayEnd()`, the next alot. Between midnight and alot, maariv, the Omer, Chok LeYisrael and a custom mitzvah set across midnight stay on home until their window closes, and every mark is filed under the day its window was computed for (`dateKey(window.date)`), the key its notifications carry. The Hebrew date in headers still turns at sunset.
- Two calendars meet here, and they disagree whenever the device's zone is not the location's. A day the app shows or keys (`dateKey()`, schedule cells, history rows, notification ids) is a location date, held as the device-local midnight of that date. Zmanim, Shabbat, Yom Tov and the Hebrew date belong to the location's. Never answer a location question through device-local getters:
  - `ZmanimService` and `HebcalService.isShabbat` / `isYomTov` / `getHebrewDateAt` resolve an instant's civil day in the location's zone.
  - Static `computeWindow`s take their weekday, next day and Omer count from the day `ctx.zmanim` belong to, at its midday — never from `ctx.date`, whose clock time depends on the caller. See [src/data/AGENTS.md](src/data/AGENTS.md).
  - Day-level surfaces turn a device calendar day into the same date at the location with `locationNoon()` from [src/utils/locationDay.ts](src/utils/locationDay.ts). Device-local midnight is the previous day at a location west of the device.
  - Custom mitzvah windows put the device's calendar date of `ctx.date` on the location's clock through Luxon.

## Taharah Tracking

Taharat hamishpacha (the niddah cycle) is tracked on the device only, behind an opt-in (`taharahEnabled`) that onboarding and Settings offer only to a married user who answered the gender question (`taharahOffered()` in [taharahOptIn.ts](src/stores/taharahOptIn.ts)). A single user never sees the topic. The app never rules: every safek stops the cycle until the user records the rav's instruction.

- Raw input only is stored: `TaharahEvent`s (onset with its onah, hefsek, bedika, tevila, pause, resume, ruling) in `useTaharahStore`, encrypted. Every state, task and perisha onah is replayed from them by the pure engine in [src/utils/taharah/](src/utils/taharah) (`deriveCycle()`, `taharahTasksFor()`, `perishaOnot()`, `kavuaHints()`, `stageHint()`), so a corrected rule is a replay, not a migration.
- The rules are individual parameters (`TaharahRules`) filled by a preset in [taharahPresets.ts](src/data/taharahPresets.ts): `ashkenaz`, `chassidic`, `chabad`, `sephardi_ovadia`, `sephardi_eliyahu`. [docs/taharah-review.html](docs/taharah-review.html) states every value with its source for a rav; a preset change raises `TAHARAH_RULES_VERSION` and edits that page in the same change.
- Days are hebcal absolute numbers and onot are counted night-first (`onahIndex`). An onset in bein hashmashot is doubtful: counted from the next day for the wait, and both onot are kept for the vestot.
- A tevila night that falls on Yom Kippur or Tisha B'Av is deferred to the next night. A woman records the hefsek and the bedikot before the tevila; the husband role records only onsets and the tevila night and sees only perisha onot, the tevila night and "did the period arrive".
- Nothing taharah-related is shown or fires inside a holy block; a reminder that would land there goes out before candle lighting, merged with the block's other taharah reminders.

## Notification Engine

[NotificationScheduler.ts](src/services/NotificationScheduler.ts) is the scheduling facade. Keep API parity with [NotificationScheduler.web.ts](src/services/NotificationScheduler.web.ts).

Module layout: the schedule is built by a one-way pipeline in [src/services/notifications/](src/services/notifications) — `readPlanInput()` reads the stores once into a `PlanInput`, `buildPlan()` runs pure planners (mitzvot, holy-block notice, hilulot, check-in, taharah) over it and returns channel-tagged `ScheduleCandidate`s sorted and capped, and `os.schedule()` is the only code that hands them to expo-notifications. The facade keeps the public exports, the lock, suppression and mark-done, the update notice, permissions, the handlers and both `defineTask` calls. [src/services/notifications/AGENTS.md](src/services/notifications/AGENTS.md) holds the contract.

Important constants and contracts:

- Categories: `mitzvah_reminder` (mark-done only) and `mitzvah_reminder_text` (open text + mark done), chosen per reminder by `hasSiddurText()`, except that a trigger on a block's opening edge (candle lighting) gets mark-done only: every screen it could open is behind the Shabbat screen
- Actions: `MARK_DONE` (background) and `OPEN_TEXT` (opens the app to `/siddur/[id]?date=`)
- Android channels (`ANDROID_CHANNELS`, planned per candidate): `default` for mitzvah reminders and the pre-block notice (the id is kept so installs keep the sound the user chose), `hilulot`, `rosh-chodesh`, `taharah` (private on the lock screen) and `system` for check-in reminders, the weekly report notice and the update notice. A reminder's `data.hasText` is the same decision as its category (`mitzvah_reminder_text` exactly when it is true) and sends the body tap to the reader. The channel table is in [src/services/AGENTS.md](src/services/AGENTS.md).
- Scheduled identifier format: `${mitzvahId}__${YYYY-MM-DD}__${reminderIndex}`. A notification not tied to a mitzvah uses an id without `__` and carries `data.kind`: the pre-block notice is `blockNotice:<first holy day>`, with no category. The update notice is `update:<update id>`, `data.kind = 'update'` with `data.updateId`, presented at once, with no category. A hilula notice is `hilula:<hebrew abs day>:<before|evening>`, `data.kind = 'hilula'`, with no category. A Rosh Chodesh notice is `roshChodesh:<hebrew abs day>:<before|evening|day>`, `data.kind = 'roshChodesh'`, with no category. The weekly report notice is `report:<YYYY-MM-DD of the week's last day>`, `data.kind = 'report'` with `data.report = { week }`, with no category.
- Pending guard: `PENDING_LIMIT = 60`, `IOS_MAX = 64`
- Horizon: the location's calendar days from today and tomorrow, then on through any holy block that is reached or starts the next day, up to the first weekday after it. Each step is the device-local midnight of that location date with its zmanim read at the location's noon, so ids and completion keys name the window's own day and a DST change in either zone cannot skip or repeat one. Mitzvah reminders are planned for the day before the horizon too, so a rebuild after midnight keeps the reminders still due in a window that opened yesterday (a custom mitzvah set across midnight). Candidates are ordered by trigger time and capped at `IOS_MAX - 4` on iOS / `PENDING_LIMIT` elsewhere, so an overflow drops the furthest-out reminders rather than all of tomorrow.
- Check-in reminders (`checkin:<firstHolyDay>:<0|1|2>`, `data.kind = 'checkin'`, no category) fire at a block's exit, two hours later, and at 20:00 on the location's clock the next day — or half an hour before the next block's candle lighting when that evening is already holy — until the check-in is finished or everything in it is marked or skipped, and never at or after its deadline, the alot that ends the first weekday after the block (`checkInDeadline()`). A mark that settles the check-in withdraws them at once (`settleCheckIn()`). `cancelCheckIn()` withdraws them and clears the tray; the foreground handler suppresses one for a finished check-in.
- The pre-block notice fires an hour before candle lighting for every user with notifications on: title by block kind, lighting and exit times, the Omer counts of the block's nights when `sefirat_haomer` is enabled, a line for each hilula whose notice the block swallows when `hilulotEnabled` is on, and a line for each Rosh Chodesh notice it swallows when `roshChodeshEnabled` is on.
- Hilula notices (`hilula:<abs>:<before|evening>`) exist only while `useUserStore.hilulotEnabled`: one at the shkia a day before a tzaddik's date opens and one at the shkia that opens it, for the core list in [src/data/hilulot.ts](src/data/hilulot.ts). They are a setting, not a mitzvah: the library lists them as a row (the user's call, 2026-10-08), but they stay out of `MITZVOT`, so they never reach history, the streak, home, the check-in or `MARK_DONE`.
- Rosh Chodesh notices (`roshChodesh:<abs>:<before|evening|day>`) exist only while `useUserStore.roshChodeshEnabled`, three for each Rosh Chodesh (the user's call, 2026-10-11): `before` at 20:00 on the day three Hebrew days ahead of its first day, `evening` at the shkia that opens it, and `day` at 07:00 on each of its days, so a two-day Rosh Chodesh gets two. The id's `abs` is the new month's first day for `before` and `evening` and the notice's own Hebrew day for `day`; the title names the new month in the UI language (`roshChodeshLabel()`: plain Adar, Adar I and Adar II in Hebrew and English), the lead body names the weekday of the evening the month enters. The day arithmetic is [src/data/roshChodesh.ts](src/data/roshChodesh.ts), the planning [planners/roshChodesh.ts](src/services/notifications/planners/roshChodesh.ts). It is a setting like the hilulot, not a mitzvah: a library row beside the hilulot row, no switch in Settings, and out of `MITZVOT`, history, the streak, home, the check-in and `MARK_DONE`. A notice strictly inside a holy block is not scheduled; `roshChodeshLines()` names it in that block's pre-block notice instead (`roshChodeshTonight` when the month enters at the erev's shkia, else `roshChodeshOn` with the weekday; `roshChodeshDay` for a notice of the day, once per day).
- The weekly report notice (`report:<week end>`, `system` channel, no category) exists while `useUserStore.weeklyReportEnabled`, on by default (the user's call, 2026-10-11). It is planned for the block that closes the week, the one that holds a Saturday: motzaei Shabbat, or the exit of a Yom Tov that follows it, where the week end is the block's last day; a Yom Tov in mid-week has none (`weekEndFor()` in [src/utils/weeklyReport.ts](src/utils/weeklyReport.ts), planned by [planners/report.ts](src/services/notifications/planners/report.ts)). It fires `REPORT_DELAY_MIN` (45) minutes after the block's exit, after the check-in's first nudge (at the exit) and before its second (two hours on), and a tap opens `/report` on that week. The report is computed from the stores when the screen opens, not frozen at notification time, so its numbers settle as the check-in is finished; the text is local templates. Settings keeps its switch (`settings.weeklyReport`) in the notifications block of the device section; past reports come from the history tab's Reports pill. It is a setting, not a mitzvah: it never reaches history, the streak, home or the check-in.
- Taharah reminders (`taharah:<task>:<hebrew abs day>[:<onah>]`, `data.kind = 'taharah'`) are built from `taharahTasksFor()` for every horizon day when the feature is on: hefsek before shkia, the two daily bedikot (category `taharah_bedika`, whose `MARK_DONE` records a clean bedika), tevila prep and tevila at nightfall (tzeit, or a block's exit on motzaei Shabbat), perisha onot, the onah-beinonit bedika, "did the period arrive", a `postBlock` nudge after a block with unrecorded bedikot, and one merged `preBlock` notification for everything a block would have swallowed. Discreet wording is the default. [src/services/AGENTS.md](src/services/AGENTS.md) holds the details.
- Daily rebuild task: `jew-in-time-daily-rebuild-v2`, an `expo-background-task` task registered with `minimumInterval: 60` (minutes; the OS decides the real cadence). Registering it first unregisters the legacy `jew-in-time-daily-rebuild` that an `expo-background-fetch` build left behind. Its rebuild is gated by `notifications:last-rebuild-date` and intended to run once per local day at/after 00:15; every run also calls `notifyIfUpdateReady()`.
- Background notification action task: `jew-in-time-notification-actions`.
- Delivery must stay EXACT. expo-notifications only calls `setExactAndAllowWhileIdle` when `AlarmManager.canScheduleExactAlarms()` is true, and there is no JS API to detect the fallback — so the manifest is the only guarantee. `USE_EXACT_ALARM` covers API 33+, `SCHEDULE_EXACT_ALARM` (capped at `maxSdkVersion=32` by [scripts/withExactAlarmPermissions.js](scripts/withExactAlarmPermissions.js)) covers Android 12. Pinned by [exactAlarmConfig.test.ts](src/services/__tests__/exactAlarmConfig.test.ts).

Behavior to preserve:

- `scheduleAll()` and `rebuild()` go through `withLock()`, which coalesces on the trailing edge: a request arriving mid-run queues exactly one re-run so the newest state is always applied.
- `rebuild()` cancels all scheduled notifications and schedules enabled mitzvot again. Only `rebuildForNewDay()` records the last rebuild date, so a settings-driven rebuild cannot suppress the nightly recovery run.
- A plan holds nothing for disabled or no-permission cases, Shabbat/Yom Tov skips, `null` windows, skipped or completed mitzvot for that date, past triggers, and any trigger strictly inside a holy block.
- `cancelForMitzvah(id, date)` cancels all pending reminders for that mitzvah/date and dismisses the presented ones, so marking a mitzvah done anywhere clears it from the tray and prevents later same-day notifications. Every mark carries the day its window was computed for: screens pass `window.date` (or the reader's `date`), and `MARK_DONE` the notification's `data.dateKey`, so the cancel reaches that window's ids even when the mark comes after midnight.
- The mitzvah screen's "next reminder" line is `nextReminderAt()`, exported by both scheduler files: the first trigger after now that the plan's per-window rule (`windowTriggers()`, which `planMitzvot()` uses too) lets through, over the next ten days, so after a window's last reminder it names the next window's first one, past any holy block.
- A language change rebuilds the schedule, because notification text and button titles are translated at scheduling time.
- `SCHEDULE_FORMAT` is raised whenever a scheduled notification changes shape, so the first foreground after an update rebuilds once.
- `useCompletionsStore.markDone`, `markSkipped`, and `unmark` also trigger notification cancellation/rebuild through a queued `require()` to avoid import cycles.
- `initNotificationHandlers()` is called from [_layout.tsx](src/app/_layout.tsx) after fonts load and returns a teardown the layout runs on unmount. It also calls `refreshSchedulingOnForeground()`, which home repeats on `AppState 'active'` so the horizon cannot silently expire. It sets the foreground handler, registers category/action tasks, syncs permission, dismisses already-completed presented notifications, subscribes to store changes, and registers the daily rebuild task.
- Tapping the notification body routes to `/mitzvah/[id]`; tapping `OPEN_TEXT` routes to `/siddur/[id]` with the notification's `dateKey`, buffered like the body tap on a cold start; tapping `MARK_DONE` marks completion without foregrounding the app. The pre-block notice opens home, a check-in reminder opens `/checkin`, a hilula notice opens `/hilulot`, a Rosh Chodesh notice opens `/rosh-chodesh`, a weekly report notice opens `/report` on its week, and an update notice reloads into its update, or opens home when that update, or a newer one, is already running (`isUpdateApplied()`). Inside a holy block a tap opens nothing (only `MARK_DONE` still runs), and a tap buffered on a cold start before the block is dropped rather than replayed into it.
- [withMitzvahNotificationAction.js](scripts/withMitzvahNotificationAction.js) is an Expo config plugin that writes an Android Kotlin service to dismiss a notification after the mark-done action. Keep this in mind when changing notification action IDs.
- Both `TaskManager.defineTask` calls live at [NotificationScheduler.ts](src/services/NotificationScheduler.ts) module scope, and the bundle entry is the root [index.js](index.js) (the `main` field in [package.json](package.json)), which imports [src/services/crashReporting.ts](src/services/crashReporting.ts) first, so Sentry is up in a headless launch too, then the router entry and that module. A killed-state `MARK_DONE` tap and a background task arrive as headless launches that never load route modules — a `defineTask` reachable only through the router tree never runs and the OS-invoked event is silently dropped. Pinned by [backgroundTaskEntry.test.ts](src/services/__tests__/backgroundTaskEntry.test.ts).

The web scheduler file is intentionally a no-op shim. If adding exported scheduler helpers, add matching exports to both native and web files.

## State and Persistence

All primary stores use Zustand with MMKV persistence through `StorageService.createZustandStorage()`, except `useTaharahStore`, which persists to its own encrypted instance. Every store passes `version` and the identity `migrate` from [persistOptions.ts](src/stores/persistOptions.ts): without a `migrate`, zustand discards the persisted state on a version mismatch.

- `useUserStore` (`user-store`): nusach, location (re-resolved from [src/data/cities.ts](src/data/cities.ts) on every hydrate by its `cityId`, so a corrected city reaches installs that already picked it), theme (one of the six palette names), language, notification permission/toggle, profile fields, halachic opinions, in-Israel flag, onboarding flag, the reader's text size and auto-scroll (`siddurAutoScroll`, off by default, and `siddurScrollSpeed`, a level into the 15 `SIDDUR_SCROLL_SPEEDS`), `prayerMode` (`minyan` or `alone`, `minyan` by default; `alone` folds the minyan-only passages in the siddur reader), the hilula notices switch (`hilulotEnabled`, off by default), the Rosh Chodesh notices switch (`roshChodeshEnabled`, off by default), the weekly report switch (`weeklyReportEnabled`, on by default), the Chok LeYisrael double-week choice (`chokDoubleChoice`: `first`, `second` or `both`, `null` until a double week first asks), `gender` and `maritalStatus` (`married` or `single`), each `null` until answered, taharah opt-in.
- `useMitzvotStore` (`mitzvot-store`): enabled state and custom reminders per mitzvah.
- `useCompletionsStore` (`completions-store`): `completions[YYYY-MM-DD][mitzvahId] = timestamp` and a parallel `skipped` map, both keyed by the day the window was computed for (`dateKey(window.date)`, so a night window marked after midnight files under the previous date), `checkIns[firstHolyDay] = finishedAt`, and `archivedDays` — runs of kept days that retention pruned, so the streak reaches past 400 days. A screen always passes the window's day to `markDone`, `markSkipped` and `unmark`; their `date = new Date()` defaults serve tests only.
- `useCustomMitzvotStore` (`custom-mitzvot-store`): user-created mitzvah definitions.
- `useTaharahStore` (`taharah-store`): the taharah event log, minhag settings and reminder leads, in an MMKV instance encrypted with a key held in `expo-secure-store` ([TaharahStorage.ts](src/services/TaharahStorage.ts)). `expo-secure-store` and `expo-crypto` are native modules the shipped 1.0.16 binary does not carry, so code importing them needs a build before it can ship over the air.

[zustandMiddleware.ts](src/stores/zustandMiddleware.ts) deliberately requires `../../node_modules/zustand/middleware.js`. Do not replace it with a direct ESM import unless Metro and Jest are both verified.

`AppResetService.reset()` cancels notifications, resets all stores, and clears MMKV on native, including the taharah data and its key.

Backup and restore (the user's call, 2026-10-14) keeps the four plain stores across a reinstall or a new phone, never the taharah store:

- Android Auto Backup and device-to-device transfer carry only the main MMKV file (`files/mmkv/jew-in-time` and its `.crc`) and React Native's RTL preference, the whitelist in [scripts/withAndroidBackupRules.js](scripts/withAndroidBackupRules.js). Everything else stays out: the taharah files, expo-notifications' saved reminders, expo-updates' bundles, the secure store. A restored install has no scheduled reminders, so the first foreground finds none pending and rebuilds. On iOS the app's Documents folder, MMKV included, rides the device's iCloud backup; a delete and reinstall loses it, which the backup file covers.
- The backup file is [BackupService.ts](src/services/BackupService.ts): `{ app: 'jew-in-time', format, createdAt, stores }` with each store's persisted string as is. Settings exports it through the share sheet (`expo-sharing`) and restores it through `File.pickFileAsync()`; onboarding's welcome step offers the restore too. A restore replaces, never merges: each store in the file is written and rehydrated through its own `migrate` and `merge`, a store the file lacks is reset, scheduling is suspended for the swap, the schedule stamp is dropped first so a reload part-way still rebuilds, and the schedule is rebuilt once.

## UI, Theme, RTL, and i18n

- The app loads Heebo font weights in [_layout.tsx](src/app/_layout.tsx).
- Use `useTheme()` and `src/theme/*` tokens. Avoid hard-coded colors in new UI unless there is a narrow reason.
- Six palettes live in [src/theme/colors.ts](src/theme/colors.ts): gold, pink, purple and blue (light, white surfaces on a tinted background), dark and plum (dark plum with a rose accent), chosen in Settings as colour circles with no visible labels (a change of gender switches to that gender's palette first, `paletteForGender()`). `gold` / `onGold` / `goldLight` are each palette's accent tokens, `goldWash` / `goldWashStrong` the accent as a faint tint (the schedule's current row and today's cell), `goldText` is the accent as a text colour on light surfaces (gold itself reads 2.75:1 on white), `onUrgent` is the label colour on an `urgent` fill, `headerAccent` is the accent drawn on the header, `overlay` is the scrim behind sheets and dialogs, and `isDark` is true for the two dark palettes (`DARK_THEMES`). `BRAND` (`navy`, `gold`, `parchment`, `white`) holds the palette-independent brand colours the logo, the provider-free error boundary and a Switch thumb use.
- The type scale in [src/theme/typography.ts](src/theme/typography.ts) is display 28, title 22, heading 17, subheading / body / bodyBold 15, caption / captionBold 13, small 12 and micro 11. Spacing and radius come from [src/theme/tokens.ts](src/theme/tokens.ts) (`spacing` xs 4 to xxxl 40, `radius` xs 4 to xxl 24 and full).
- Translation tables are flat JSON dictionaries in [he.json](src/i18n/he.json) and [en.json](src/i18n/en.json); tests enforce key parity and non-empty values.
- `setLocale()` and `useI18n()` are lightweight wrappers. The `i18n-js` package is installed but the current app does not rely on the normal `i18n-js` runtime API.
- RTL is dynamic based on `useUserStore.language`. `_layout.tsx` calls `I18nManager.allowRTL/forceRTL`; native language direction changes can require a reload.
- Web also sets `document.documentElement.dir/lang` and `body.dir`.
- Main reusable UI components: `MitzvahCard`, `CompletedRow`, `ReminderEditor`, `TimeRibbon`, `BottomTabs`, `NavBar`, `AppLogo`, `ShabbatScreen`, `ChipRow`, `SettingsSection`, `DayStepper`, `OnboardingDots`, `ChoiceRow`, `ThemeSwatchRow`, `ScrollSpeedStepper`, `TaharahLock`, `ScreenHeader` / `HeaderPill`, `SegmentedControl`, `ConfirmDialog`, `BottomSheet` / `SheetAction`, `Banner`, `SectionLabel`, `ListRow`, `IconTile`, `MitzvahIcon` and `ChokWeekControls`.
- Design-system rules, each guarded by [designSystem.test.ts](src/app/__tests__/designSystem.test.ts) where a source scan can check it:
  - A stack screen renders `ScreenHeader` (back pill, title, `actions`); a tab renders `NavBar`. Neither keeps a local back button or header style.
  - Icons come from `MitzvahIcon` / `IconTile`, a mitzvah's through `iconFor(mitzvah.icon)`; no text glyph stands in for one.
  - A segmented choice is `SegmentedControl`, a confirmation `ConfirmDialog`, an action sheet or picker `BottomSheet` with `SheetAction`, a status strip `Banner`, a list heading `SectionLabel`, an icon-title-caption row `ListRow`, and a pill row `ChipRow`; a screen never keeps a local copy and renders no `Modal` of its own.
  - No spacing or radius literal where a token matches, no white literal (`onGold`, `onUrgent` or `BRAND.white`), and no `fontWeight` on Heebo text (a `typography` variant or `fontFamilies.heebo`).

## Tests

Jest uses the `jest-expo` preset configured in [package.json](package.json).

Coverage areas:

- [src/data/__tests__/](src/data/__tests__) - registry integrity, windows, city data, skip metadata, nusach filtering, siddur content per nusach on dated days, and the Chok LeYisrael mitzvah against a mocked asset map ([chokMitzvah.test.ts](src/data/__tests__/chokMitzvah.test.ts), also under `pnpm test:tz`).
- [src/services/__tests__/](src/services/__tests__) - zmanim, Hebcal, location, storage, the backup file (create, parse, restore, export, pick: [BackupService.test.ts](src/services/__tests__/BackupService.test.ts)), scheduler, notification responses, settings logic, web-shim parity, exact-alarm config.
- [src/stores/__tests__/](src/stores/__tests__) - store behavior and completion/skipped edge cases.
- [src/utils/__tests__/](src/utils/__tests__) - day timeline, history stats, cross-surface `skipOn` agreement, liturgical day flags, the app's day at alot across DST changes and a polar day ([appDay.test.ts](src/utils/__tests__/appDay.test.ts), also under `pnpm test:tz`), the weekly report (`weeklyReport.test.ts`), the Chok LeYisrael portion ([chok.test.ts](src/utils/__tests__/chok.test.ts), also under `pnpm test:tz`), and the taharah engine (`taharah.*.test.ts`: onot, cycle, vestot, tasks, summary), which also runs under `pnpm test:tz -- src/utils/__tests__/taharah`.
- [src/i18n/__tests__/](src/i18n/__tests__) - translation parity and brand regression checks.
- [src/theme/__tests__/](src/theme/__tests__) - token/key sanity.
- [src/app/__tests__/routes.test.ts](src/app/__tests__/routes.test.ts) - Expo Router route discovery/regression tests.
- [src/app/__tests__/designSystem.test.ts](src/app/__tests__/designSystem.test.ts) - Source-level design-system tripwires: no text glyph icons, white literals, `fontWeight` or Heebo font-name literals outside their one home, stack screens on `ScreenHeader` and tabs on `NavBar`, and one `settings.theme.<name>` label per palette.
- [src/components/__tests__/](src/components/__tests__) - reusable component behavior.
- [src/components/__tests__/](src/components/__tests__) `*.render.test.tsx` - render tests of the shared building blocks (`ConfirmDialog`, `BottomSheet`, `Banner`, `MitzvahCard`, `ScreenHeader`, `SegmentedControl`, `ListRow`) on `@testing-library/react-native`, rendered through `renderWithTheme()` from [src/testing/render.tsx](src/testing/render.tsx). They assert roles, labels, states, call counts and palette colours; there are no snapshots.
- [src/app/__tests__/settings.contact.render.test.tsx](src/app/__tests__/settings.contact.render.test.tsx) - the Contact us section of Settings: profile-seeded fields, the required-field and phone checks, each send failure, a single send in flight, the email link and the email-only state without a form id, over a mocked `ContactService`.
- [src/app/__tests__/settings.backup.render.test.tsx](src/app/__tests__/settings.backup.render.test.tsx) and [onboarding.restore.render.test.tsx](src/app/__tests__/onboarding.restore.render.test.tsx) - the backup section of Settings (export, the confirm dialog with the backup date, cancel, each failure, the profile drafts after a restore) and the restore on the onboarding welcome step, over a mocked `BackupService`.
- [scripts/__tests__/androidBackupRules.test.js](scripts/__tests__/androidBackupRules.test.js) - the Android backup whitelist and its registration in [app.json](app.json).
- [src/app/__tests__/home.render.test.tsx](src/app/__tests__/home.render.test.tsx) - home between midnight and alot at `at(Jerusalem, …)` instants (`Date` faked alone): a night window stays current and a mark, skip, undo or open-text files under the window's day, the missed and next-up turn at alot, a custom mitzvah set across midnight, and the subtitle date. Run it again with `pnpm test:tz -- src/app/__tests__/home.render.test.tsx`.
- [src/app/__tests__/screens.smoke.render.test.tsx](src/app/__tests__/screens.smoke.render.test.tsx) - smoke render of every file under [src/app/](src/app), layouts and redirects included, in Hebrew and English through `renderWithTheme()`, with fixture stores (an onboarded user in Jerusalem, a custom mitzvah, a completion, a taharah onset with the lock off; a fresh user for onboarding) and `Date` pinned to Wednesday 2026-10-28, a plain day outside any holy block. Dynamic routes get realistic params (`mitzvah/[id]` static and custom, `siddur/[id]` a mitzvah text and a standalone text read from the real assets, `day/[date]` today, past and invalid, `custom-mitzvah` with and without `id`, `report` with and without `week`, `taharah/log` per `type`); a case with a `wallClock` pins `Date` to that instant instead, for the app's day between midnight and alot (the day view's today and future, the schedule's opening day, the reader opened without a date). `expo-router` and the native edges are mocked at the module boundary; a screen that throws on mount fails its case, and a screen file with no case fails the suite. Run it again with `pnpm test:tz -- src/app/__tests__/screens.smoke.render.test.tsx`.

Test rules that exist because the suite once passed while the app was broken:

- A test must import the shipped implementation. Re-declaring the logic under test asserts only that the test agrees with itself.
- Assert values, not types. `expect(typeof x).toBe('boolean')` passes for both answers.
- A test must be able to fail for the reason it claims. `planMitzvot` (run through `buildPlan`) drops every trigger before `input.now`, which is the real clock unless a test passes one, so fixtures in the past pass vacuously; derive dates from `Date.now()` instead.
- A fixture must mean the same moment in every zone. `new Date(2026, 3, 24, 20)` is 20:00 on the device's clock, so build an instant for an instant API with `at(location, '2026-04-24T20:00')` from [src/testing/zmanim.ts](src/testing/zmanim.ts). Calendar-day APIs (`dateKey`, `getHebrewDate`, `getHolidays`, and `isShabbat` / `omerDayFor` without a location) read device-local dates, so they take local-component dates. The app's day (`appDay()`, `appDayEnd()`), `appDayWindow()`, `currentOrNextWindow()`, `computeStats()`, `judgeDay()` and the check-in deadlines read an instant against the location's alot, so they take `at(location, …)` instants, never a device-local `new Date(y, m, d, h)`, which lands on a different date at the location in other zones.
- Run [pnpm test:tz](scripts/test-timezones.js) after touching date or timezone logic. It runs every suite in four real zones, and a setup guard fails any run whose zone did not take effect.
- A suite that schedules notifications pins `Date` (and only `Date`) to a fixed weekday. Nothing fires inside a holy block, so on the real clock the suite would fail every Shabbat. Faking timers or `queueMicrotask` too would stall the completion store's queued side effects.

When adding ESM or native-adjacent dependencies, check `transformIgnorePatterns` in [package.json](package.json); Jest may need the dependency allowlisted.

For notification changes, run at least:

```bash
pnpm test -- src/services/__tests__/NotificationScheduler.test.ts
pnpm test -- src/services/__tests__/notificationResponseHandler.test.ts
pnpm typecheck
```

For mitzvah/zmanim changes, run at least:

```bash
pnpm test -- src/data/__tests__/mitzvot.test.ts
pnpm test -- src/data/__tests__/mitzvot.windows.test.ts
pnpm test -- src/services/__tests__/ZmanimService.test.ts
pnpm test -- src/services/__tests__/HebcalService.test.ts
pnpm typecheck
```

## Common Change Checklist

- New route: add the file under [src/app/](src/app), update navigation/tabs if needed, then update [routes.test.ts](src/app/__tests__/routes.test.ts) and add its case to [screens.smoke.render.test.tsx](src/app/__tests__/screens.smoke.render.test.tsx), which fails on a screen file without one.
- New screen: open two sibling screens of the same kind first. A stack screen takes `ScreenHeader`, a tab `NavBar`; build lists, sheets, dialogs, banners and segmented choices from the shared components, take every colour, spacing, radius and type style from the theme tokens, put its icons through `MitzvahIcon` / `IconTile`, add both dictionaries' keys, and document it in the closest AGENTS.md. [designSystem.test.ts](src/app/__tests__/designSystem.test.ts) must stay green.
- New UI copy: update both [he.json](src/i18n/he.json) and [en.json](src/i18n/en.json), then run i18n tests.
- New theme token: add it to every palette in `THEMES` in [colors.ts](src/theme/colors.ts), then run theme tests.
- New mitzvah: update the registry, default enabled behavior, detail/schedule/history expectations, and tests. A mitzvah added after release needs the `merge` in [useMitzvotStore.ts](src/stores/useMitzvotStore.ts) to reach existing users.
- Removed mitzvah: delete its registry entry, siddur text and icon, add its id to `RETIRED_MITZVOT` in [useMitzvotStore.ts](src/stores/useMitzvotStore.ts), raise `SCHEDULE_FORMAT` so its pending reminders clear on the first foreground, and drop it from the store copy in [release/](release) and [docs/index.html](docs/index.html). Its completions stay.
- New scheduler export: update [NotificationScheduler.web.ts](src/services/NotificationScheduler.web.ts) too; [schedulerWebParity.test.ts](src/services/__tests__/schedulerWebParity.test.ts) enforces it.
- New notification action/category ID: update scheduler constants, response handling, the [Android config plugin](scripts/withMitzvahNotificationAction.js), and notification tests.
- New notification not tied to a mitzvah: an id `parseId` rejects (no `__`), a `data.kind`, no mitzvah category (its "done" button would mark a fake mitzvah), the kind in `PendingNotificationMeta` ([ids.ts](src/services/notifications/ids.ts) and the web shim), a planner candidate that names its channel, and its tap route in [notificationResponseHandler.ts](src/services/notificationResponseHandler.ts).
- New decision about whether the app may act at an instant: extend `quietBlockAt()` in [skipRules.ts](src/utils/skipRules.ts). Never add a second copy of the quiet window.
- New background task (`TaskManager.defineTask`): define it in a module imported from the root [index.js](index.js), never only behind a route module — headless launches do not load the router tree.
- New persisted store: add it to `STORES` in [BackupService.ts](src/services/BackupService.ts) unless it is device-only or sensitive, and a new MMKV instance stays out of the Android backup until its file joins `BACKED_UP` in [scripts/withAndroidBackupRules.js](scripts/withAndroidBackupRules.js).
- New persisted store field: add a default and reset behavior; a nested shape change bumps `STORE_VERSION` and replaces the identity `migrate` in [persistOptions.ts](src/stores/persistOptions.ts) with a step that transforms the old state.
- New surface that shows or files "today": take the day from `appDay()` ([src/utils/locationDay.ts](src/utils/locationDay.ts)) and a mitzvah's window from `dayWindow()` / `appDayWindow()` / `currentOrNextWindow()` ([src/utils/buildDayTimeline.ts](src/utils/buildDayTimeline.ts)), and file a mark under `window.date`; never `dateKey(new Date())`.
- New decision about whether a mitzvah applies to a day: extend [skipRules.ts](src/utils/skipRules.ts). Never add a second copy of that predicate.
- New nusach text or day-dependent insert: follow [scripts/siddur/AGENTS.md](scripts/siddur/AGENTS.md) — registry in [siddur.ts](src/data/siddur.ts), day flags in [siddur.ts](src/utils/siddur.ts), manifest, `pnpm siddur:build`, dated content tests.
- New standalone siddur text (no mitzvah): its id in `StandaloneTextId` ([siddur.ts](src/types/siddur.ts)), its name and group in `STANDALONE_TEXTS` ([siddur.ts](src/data/siddur.ts)), a new group's i18n key `siddur.group.<group>` and an icon of the same name in `ICON_NAMES` ([MitzvahIcon.tsx](src/components/MitzvahIcon.tsx)), a manifest entry for all four nuschaot, `pnpm siddur:build`, and dated cases in [siddur.test.ts](src/data/__tests__/siddur.test.ts). The catalog and the reader need no change.
- New Android permission or config plugin: re-run [pnpm prebuild:clean](package.json) and check the generated manifest, then [pnpm check:dox](scripts/check-dox.js).
- New or moved AGENTS.md: run [pnpm check:dox](scripts/check-dox.js) — it verifies links, section order, and every Child DOX Index.
- Version bump: raise `version` in [app.json](app.json) and [package.json](package.json) in the same edit, and only in a change that also produces a native build. See [Release and Updates](#release-and-updates) for why a bump on its own strands every installed user.
- New taharah rule or preset value: change [taharahPresets.ts](src/data/taharahPresets.ts), raise `TAHARAH_RULES_VERSION`, update the pinned values in its test and the same cell in [docs/taharah-review.html](docs/taharah-review.html), then run `pnpm test:tz -- src/utils/__tests__/taharah`.
- New taharah event type or task kind: extend [taharah.ts](src/types/taharah.ts), the engine, the `taharah.task` union of `PendingNotificationMeta` in [ids.ts](src/services/notifications/ids.ts) and the web shim, the taharah planner, and the log screen.
- Chok LeYisrael content: follow [scripts/chok/AGENTS.md](scripts/chok/AGENTS.md). No raktora text, page cache or generated asset is committed, published or built into an app before the owner's written permission; restore the empty map with `pnpm chok:build --empty` after any local full build.

## Documentation Notes

Older docs and prototypes may still use earlier branding or assumptions. Treat the current code, [app.json](app.json), [AUDIT.md](AUDIT.md), and this file as authoritative unless the user says otherwise.

## DOX Framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Links

- Every reference to a project file or folder must be a relative Markdown link to that path, not plain text, so any reader can open it directly
- This applies to every Child DOX Index entry and to any inline mention of a concrete file or folder in a DOX doc
- Link targets are relative to the directory of the AGENTS.md that contains them, so they resolve when the doc is opened in place
- Child DOX Index entry format: `- [<relative-path>](<relative-path>) — <scope description>`
- Before editing or indexing a linked target, read it first (see Read Before Editing); a link must always point at a file that exists

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run `pnpm check:dox`, plus the verification named by the docs you touched
6. Report any docs intentionally left unchanged and why

`pnpm check:dox` ([scripts/check-dox.js](scripts/check-dox.js)) enforces the mechanical half of this
contract: dead links, missing or misordered sections, and a Child DOX Index that disagrees with the
tree. It cannot judge whether the prose is still true — that part is still the closeout's job.

## User Preferences

- Answers and work products should be high quality and verified as far as practical for the requested scope.
- Agents should choose and use relevant skills on their own when the request calls for them.
- Task queues, PRDs, planning files, and similar planning artifacts must be written in English unless the user explicitly asks for another language.
- In coding tasks, apply YAGNI: favor simple, concise solutions, including one-liners when they genuinely improve clarity without sacrificing quality, readability, maintainability, or design.
- DOX indexes and durable file references should use Markdown links to the referenced files whenever practical.

## Child DOX Index

- [assets/AGENTS.md](assets/AGENTS.md) - Static image assets for icons, splash, favicon, and notifications.
- [design/AGENTS.md](design/AGENTS.md) - Design handoff materials and prototype boundaries.
- [docs/AGENTS.md](docs/AGENTS.md) - Public GitHub Pages site: support page and privacy policy.
- [release/AGENTS.md](release/AGENTS.md) - Store metadata, privacy copy, and release-facing documents.
- [scripts/AGENTS.md](scripts/AGENTS.md) - Local utility scripts and Expo config plugins.
- [src/AGENTS.md](src/AGENTS.md) - Application source, routes, services, stores, data, i18n, theme, and tests.

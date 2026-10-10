# AGENTS.md

Canonical working notes for AI agents in this repository. Keep this file current when architecture, commands, routes, stores, notification behavior, or test strategy changes.

## Project Snapshot

- App: Hebrew-first Expo/React Native mobile app for daily mitzvah reminders inside halachic time windows. The current display name is configured in [app.json](app.json); the package/slug remains `jew-in-time`. The English display name, "Jew in Time", comes from [locales/en.json](locales/en.json).
- EAS project: `@avraham-sason/jew-in-time`, ID `8cc2a377-fcc9-4c78-bdde-ec0fc8f2a84e`.
- Runtime model: local/offline first. Zmanim, Hebrew calendar, history, settings, completions, and reminders are computed on-device. There is no backend.
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
pnpm test -- -t "name fragment"    # Jest test-name filter
pnpm typecheck                     # tsc --noEmit
pnpm lint                          # eslint (eslint-config-expo + prettier config), zero warnings expected
pnpm format                        # prettier --write; format:check is the read-only form
pnpm check:dox                     # AGENTS.md links, section order and Child DOX Index
pnpm siddur:build                  # rebuild the bundled nusach texts from pinned Sefaria and Wikisource sources
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

- **Anything Metro bundles** — TypeScript, JSX, i18n strings, and bundled assets (fonts and the siddur texts included) — ships as an over-the-air update: `pnpm update:preview`, or `pnpm update:production` for real users.
- **Anything native** — a dependency with native code, an Android permission, a config plugin under [scripts/](scripts), or an identity field in [app.json](app.json) — needs a build: `pnpm build:android:production`. EAS builds it on its own servers and runs prebuild there, which is why the native folders stay gitignored and are safe to delete locally.
- A native module that `expo` already links transitively (`expo-file-system`, `expo-keep-awake`) may be added as a direct dependency over OTA only at the exact version the shipped binary carries. Check the committed lockfile before raising one.
- The taharah feature added `expo-secure-store`, `expo-crypto` and `expo-local-authentication`, none of which the 1.0.16 binary carries, and set `android.allowBackup` to false so the scheduled reminders expo-notifications keeps in SharedPreferences (their ids name the taharah task and day) never ride a Google backup. Until a build with a version bump ships, nothing that imports those modules may go out as an update; 1.0.18 is that build, and it also carries `@sentry/react-native` and `expo-background-task` (which replaced `expo-background-fetch`).
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
- [src/app/(tabs)/](<src/app/(tabs)>) - Main tabs: schedule, history, home, siddur, settings; the hidden `index` redirects to home.
- [src/app/mitzvot.tsx](src/app/mitzvot.tsx) - The mitzvot library as a stack screen, opened from Settings and the onboarding ready screen.
- [src/app/onboarding/](src/app/onboarding) - Onboarding flow: welcome, profile (gender, marital status and the taharah opt-in), nusach, location/notifications, ready.
- [src/app/taharah/](src/app/taharah) - Taharat hamishpacha: dashboard, event log, calendar and minhag settings, behind the biometric lock in its `_layout.tsx`.
- [src/app/mitzvah/[id].tsx](<src/app/mitzvah/[id].tsx>) - Static and custom mitzvah details, reminders, content blocks.
- [src/app/siddur/[id].tsx](<src/app/siddur/[id].tsx>) - Nusach reader: a mitzvah's or a standalone text in the user's nusach and language, resolved for the day, with optional auto-scroll. Its section picker lists a text's chapters (Shacharit's eleven stations, from ברכות השחר to קוה אל ה׳, plus Hallel and Musaf on their days), or every section of a text without chapters.
- [src/app/(tabs)/siddur.tsx](<src/app/(tabs)/siddur.tsx>) - Siddur tab: today's texts first, then the twelve standalone texts (meals, blessings, travel, night, festivals and celebrations) by group, each greyed out on a day it is not said. [src/app/siddur/index.tsx](src/app/siddur/index.tsx) only redirects `/siddur` to it.
- [src/app/day/[date].tsx](<src/app/day/[date].tsx>) - Read-only per-day route for schedule/history drilldown.
- [src/app/custom-mitzvah.tsx](src/app/custom-mitzvah.tsx) - Create/edit custom mitzvot.
- [src/app/checkin.tsx](src/app/checkin.tsx) - Post-block check-in: mark what was done during the Shabbat / Yom Tov block that just ended.
- [src/app/hilulot.tsx](src/app/hilulot.tsx) - Hilulot of tzaddikim: the notification switch and the coming hilulot, opened from the library row and a hilula notice.
- [src/data/](src/data) - Static registries: mitzvot, cities, nuschaot, and custom-to-static adapter.
- [src/services/](src/services) - Non-React logic and native wrappers: zmanim, Hebcal, location, storage, notifications, completions, reset, OS-settings deep links.
- [src/stores/](src/stores) - Zustand stores persisted through MMKV.
- [src/components/](src/components) - Reusable React Native UI.
- [src/theme/](src/theme) - Theme colors, typography, spacing, animation/radius tokens.
- [src/utils/](src/utils) - Pure helpers: day timeline, history stats, the shared `skipOn` predicate, and the taharah engine under [src/utils/taharah/](src/utils/taharah).
- [src/hooks/](src/hooks) - Shared React hooks (`useNow`).
- [src/i18n/](src/i18n) - Flat [he.json](src/i18n/he.json) and [en.json](src/i18n/en.json) dictionaries plus a tiny translation wrapper.
- [src/testing/](src/testing) - Test-only fixture helpers. Never imported by shipped code.
- [locales/](locales) - Native string tables (`he.json`, `en.json`) wired by `locales` in [app.json](app.json): the app's display name per language on iOS (`CFBundleDisplayName`) and Android (`app_name`), and the iOS location and Face ID permission prompts. Each file is split into `ios` and `android` objects, because Expo writes every top-level key into Android `strings.xml` and Android lint rejects a translated key with no default-locale entry. They are native, so a change ships only in a build.
- [scripts/](scripts) - Local workflow scripts and Expo config plugins.
- [scripts/siddur/](scripts/siddur) - Build from pinned Sefaria and Wikisource sources to [assets/siddur/](assets/siddur), the generated nusach texts.
- [design/jew-in-time/](design/jew-in-time) - Claude Design handoff. Use it only for UI/design work; read its README and Hi-Fi prototype before porting visuals. [design/stage1-previews/index.html](design/stage1-previews/index.html) is the preview board for the shipped design system (logo, icon styles, palettes, type scale).
- [docs/](docs) - Public site published through GitHub Pages: support page, the privacy policy both stores link to, and [taharah-review.html](docs/taharah-review.html), the rule table a rav reviews.
- [release/](release) - Store listing and privacy policy drafts.
- [AUDIT.md](AUDIT.md) - Failure-point audit with per-finding status. Read before assuming a known defect is still open.

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
- `tzitzit`
- `krias_shma_shacharit`
- `shacharit`
- `mincha`
- `maariv`
- `birchot_hashachar`
- `candle_lighting`
- `havdalah`
- `sefirat_haomer`

Default enabled mitzvot are `tefillin`, `tzitzit`, `krias_shma_shacharit`, `shacharit`, `mincha`, and `maariv`.

Each `Mitzvah` has:

- `timeType`: `fixed-moment`, `range-within-day`, `all-day`, `sunset-trigger`, `date-range`, `monthly-window`, or `annual-seasonal`.
- `category`: daily/weekly/seasonal/learning grouping used by UI.
- `computeWindow(ctx)`: returns `{ start, end }` or `null`.
- `defaultReminders`: reminder definitions with `anchor`, `offsetMin`, `label`, optional `bodyVariants`, `includeContentInBody`, and `skipIfDone`.
- `skipOn`: skip contexts. Every surface consumes `shabbat`, `yomtov` and `cholHamoed` through `isSkippedAt()`. `cholHamoed` follows the tefillin minhag in `keepsCholHamoed()`: skipped in Israel and for every nusach but Ashkenaz abroad.
- `nuschaotSupported`: supported nusach IDs.
- optional `contentBlocks`: text/blessing/link blocks shown on detail screens and optionally included in notifications.

When adding or changing a mitzvah, update `MITZVOT`, any relevant i18n/UI labels, and tests under [src/data/__tests__/](src/data/__tests__), [src/services/__tests__/](src/services/__tests__), and any affected route/component tests.

Custom mitzvot live in `useCustomMitzvotStore` and are adapted through [customMitzvotAdapter.ts](src/data/customMitzvotAdapter.ts). Custom IDs are generated as `custom_<timestamp>_<suffix>`. Use `getAllMitzvot(nusach?)` or `findAnyMitzvah()` when a screen/service must include custom mitzvot. Passing the nusach applies `nuschaotSupported` filtering; every surface that lists mitzvot must filter the same way.

## Zmanim and Calendar

- `ZmanimService.getZmanim(date, location)` wraps `kosher-zmanim` `ComplexZmanimCalendar`, resolves the calendar day in the location's timezone, caches up to 90 entries, and returns cloned `Date` objects. It returns `null` (never throws) when the sun neither rises nor sets. It replaces kosher-zmanim's antimeridian adjustment with `antimeridianAdjustment()`, because kosher-zmanim 0.9.0 reads a DST zone's raw offset with the wrong sign and gave Sydney and New Zealand the next day's zmanim.
- Sunrise/sunset use sea-level getters. `tzeitHakochavim` uses `getTzaisGeonim7Point083Degrees()`.
- Candle lighting uses the same sea-level sunset basis, via `candleLightingMinutes(location)`: 40 minutes in Jerusalem (local minhag), 18 elsewhere in Israel, 20 outside Israel, or `location.candleLightingMinutes` when set. It opens once per holy block, on its erev; havdalah once, at the block's exit, plus the Sunday night after a Tisha B'Av fast that falls on Sunday, as it is or deferred from Shabbat, at tzeit itself.
- Shabbat and Yom Tov leave `HOLY_BLOCK_EXIT_MIN` (10) minutes after tzeit, the user's call on 2026-10-10: `holyBlockExit(zmanim)` in [src/services/ZmanimService.ts](src/services/ZmanimService.ts) is the one place the margin lives. It sets a block's `end` (so the Shabbat screen, the pre-block notice and the check-in nudges show and use the exit), and `HebcalService.nightfall()` opens every night window of a block's last day (maariv, the Omer, havdalah, a tevila) at the exit instead of tzeit, so none starts inside the quiet block. The Hebrew date still turns at tzeit, and a fast still ends at tzeit.
- Shabbat and Yom Tov are ordinary days for history and the streak (user decision 2026-10-06), marked after the fact. Everything whose window reaches into a block waits in that block's check-in until it is finished or until midnight that ends the first weekday after the block (device clock); only then is a missing mark a miss. [checkIn.ts](src/utils/checkIn.ts) owns that, and [historyStats.ts](src/utils/historyStats.ts) judges every item done, missed or still open.
- A holy block is a maximal run of Shabbat / Yom Tov / Yom Kippur days at the location (second-day Yom Tov by `inIsrael`), from candle lighting on the erev to the exit of the last day, ten minutes after its tzeit: `HebcalService.holyBlockAt()` / `holyBlockOn()`. The app is never active inside one, and that is the only mode — the user ruled out any setting for it on 2026-10-06. No notification fires strictly inside a block (`isQuietAt()`), and the root layout covers every route with `ShabbatScreen`. The edges stay open, so candle lighting at the start and havdalah or maariv at the end still fire.
- `HebcalService` wraps `@hebcal/core` for Hebrew dates, parasha, holidays, yom tov, Daf Yomi, Omer, and Shabbat.
- Always pass `Location` to `HebcalService.isShabbat(date, location)` for halachic boundary behavior. Without a location it falls back to Gregorian Saturday only.
- Avoid UTC date shortcuts for mitzvah logic.
- Two calendars meet here, and they disagree whenever the device's zone is not the location's. A day the app shows or keys (`dateKey()`, schedule cells, history rows) is the device's calendar date. Zmanim, Shabbat, Yom Tov and the Hebrew date belong to the location's. Never answer a location question through device-local getters:
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
- Android channels (`ANDROID_CHANNELS`, planned per candidate): `default` for mitzvah reminders and the pre-block notice (the id is kept so installs keep the sound the user chose), `hilulot`, `taharah` (private on the lock screen) and `system` for check-in reminders and the update notice. A reminder's `data.hasText` is the same decision as its category (`mitzvah_reminder_text` exactly when it is true) and sends the body tap to the reader. The channel table is in [src/services/AGENTS.md](src/services/AGENTS.md).
- Scheduled identifier format: `${mitzvahId}__${YYYY-MM-DD}__${reminderIndex}`. A notification not tied to a mitzvah uses an id without `__` and carries `data.kind`: the pre-block notice is `blockNotice:<first holy day>`, with no category. The update notice is `update:<update id>`, `data.kind = 'update'` with `data.updateId`, presented at once, with no category. A hilula notice is `hilula:<hebrew abs day>:<before|evening>`, `data.kind = 'hilula'`, with no category.
- Pending guard: `PENDING_LIMIT = 60`, `IOS_MAX = 64`
- Horizon: the location's calendar days from today and tomorrow, then on through any holy block that is reached or starts the next day, up to the first weekday after it. Each step is the device-local midnight of that location date with its zmanim read at the location's noon, so ids and completion keys name the window's own day and a DST change in either zone cannot skip or repeat one. Candidates are ordered by trigger time and capped at `IOS_MAX - 4` on iOS / `PENDING_LIMIT` elsewhere, so an overflow drops the furthest-out reminders rather than all of tomorrow.
- Check-in reminders (`checkin:<firstHolyDay>:<0|1|2>`, `data.kind = 'checkin'`, no category) fire at a block's exit, two hours later, and at 20:00 the next day — or half an hour before the next block's candle lighting when that evening is already holy — until the check-in is finished or everything in it is marked or skipped. A mark that settles the check-in withdraws them at once (`settleCheckIn()`). `cancelCheckIn()` withdraws them and clears the tray; the foreground handler suppresses one for a finished check-in.
- The pre-block notice fires an hour before candle lighting for every user with notifications on: title by block kind, lighting and exit times, the Omer counts of the block's nights when `sefirat_haomer` is enabled, and a line for each hilula whose notice the block swallows when `hilulotEnabled` is on.
- Hilula notices (`hilula:<abs>:<before|evening>`) exist only while `useUserStore.hilulotEnabled`: one at the shkia a day before a tzaddik's date opens and one at the shkia that opens it, for the core list in [src/data/hilulot.ts](src/data/hilulot.ts). They are a setting, not a mitzvah: the library lists them as a row (the user's call, 2026-10-08), but they stay out of `MITZVOT`, so they never reach history, the streak, home, the check-in or `MARK_DONE`.
- Taharah reminders (`taharah:<task>:<hebrew abs day>[:<onah>]`, `data.kind = 'taharah'`) are built from `taharahTasksFor()` for every horizon day when the feature is on: hefsek before shkia, the two daily bedikot (category `taharah_bedika`, whose `MARK_DONE` records a clean bedika), tevila prep and tevila at nightfall (tzeit, or a block's exit on motzaei Shabbat), perisha onot, the onah-beinonit bedika, "did the period arrive", a `postBlock` nudge after a block with unrecorded bedikot, and one merged `preBlock` notification for everything a block would have swallowed. Discreet wording is the default. [src/services/AGENTS.md](src/services/AGENTS.md) holds the details.
- Daily rebuild task: `jew-in-time-daily-rebuild-v2`, an `expo-background-task` task registered with `minimumInterval: 60` (minutes; the OS decides the real cadence). Registering it first unregisters the legacy `jew-in-time-daily-rebuild` that an `expo-background-fetch` build left behind. Its rebuild is gated by `notifications:last-rebuild-date` and intended to run once per local day at/after 00:15; every run also calls `notifyIfUpdateReady()`.
- Background notification action task: `jew-in-time-notification-actions`.
- Delivery must stay EXACT. expo-notifications only calls `setExactAndAllowWhileIdle` when `AlarmManager.canScheduleExactAlarms()` is true, and there is no JS API to detect the fallback — so the manifest is the only guarantee. `USE_EXACT_ALARM` covers API 33+, `SCHEDULE_EXACT_ALARM` (capped at `maxSdkVersion=32` by [scripts/withExactAlarmPermissions.js](scripts/withExactAlarmPermissions.js)) covers Android 12. Pinned by [exactAlarmConfig.test.ts](src/services/__tests__/exactAlarmConfig.test.ts).

Behavior to preserve:

- `scheduleAll()` and `rebuild()` go through `withLock()`, which coalesces on the trailing edge: a request arriving mid-run queues exactly one re-run so the newest state is always applied.
- `rebuild()` cancels all scheduled notifications and schedules enabled mitzvot again. Only `rebuildForNewDay()` records the last rebuild date, so a settings-driven rebuild cannot suppress the nightly recovery run.
- A plan holds nothing for disabled or no-permission cases, Shabbat/Yom Tov skips, `null` windows, skipped or completed mitzvot for that date, past triggers, and any trigger strictly inside a holy block.
- `cancelForMitzvah(id, date)` cancels all pending reminders for that mitzvah/date and dismisses the presented ones, so marking a mitzvah done anywhere clears it from the tray and prevents later same-day notifications.
- A language change rebuilds the schedule, because notification text and button titles are translated at scheduling time.
- `SCHEDULE_FORMAT` is raised whenever a scheduled notification changes shape, so the first foreground after an update rebuilds once.
- `useCompletionsStore.markDone`, `markSkipped`, and `unmark` also trigger notification cancellation/rebuild through a queued `require()` to avoid import cycles.
- `initNotificationHandlers()` is called from [_layout.tsx](src/app/_layout.tsx) after fonts load and returns a teardown the layout runs on unmount. It also calls `refreshSchedulingOnForeground()`, which home repeats on `AppState 'active'` so the horizon cannot silently expire. It sets the foreground handler, registers category/action tasks, syncs permission, dismisses already-completed presented notifications, subscribes to store changes, and registers the daily rebuild task.
- Tapping the notification body routes to `/mitzvah/[id]`; tapping `OPEN_TEXT` routes to `/siddur/[id]` with the notification's `dateKey`, buffered like the body tap on a cold start; tapping `MARK_DONE` marks completion without foregrounding the app. The pre-block notice opens home, a check-in reminder opens `/checkin`, a hilula notice opens `/hilulot`, and an update notice reloads into its update, or opens home when that update, or a newer one, is already running (`isUpdateApplied()`). Inside a holy block a tap opens nothing (only `MARK_DONE` still runs), and a tap buffered on a cold start before the block is dropped rather than replayed into it.
- [withMitzvahNotificationAction.js](scripts/withMitzvahNotificationAction.js) is an Expo config plugin that writes an Android Kotlin service to dismiss a notification after the mark-done action. Keep this in mind when changing notification action IDs.
- Both `TaskManager.defineTask` calls live at [NotificationScheduler.ts](src/services/NotificationScheduler.ts) module scope, and the bundle entry is the root [index.js](index.js) (the `main` field in [package.json](package.json)), which imports [src/services/crashReporting.ts](src/services/crashReporting.ts) first, so Sentry is up in a headless launch too, then the router entry and that module. A killed-state `MARK_DONE` tap and a background task arrive as headless launches that never load route modules — a `defineTask` reachable only through the router tree never runs and the OS-invoked event is silently dropped. Pinned by [backgroundTaskEntry.test.ts](src/services/__tests__/backgroundTaskEntry.test.ts).

The web scheduler file is intentionally a no-op shim. If adding exported scheduler helpers, add matching exports to both native and web files.

## State and Persistence

All primary stores use Zustand with MMKV persistence through `StorageService.createZustandStorage()`, except `useTaharahStore`, which persists to its own encrypted instance. Every store passes `version` and the identity `migrate` from [persistOptions.ts](src/stores/persistOptions.ts): without a `migrate`, zustand discards the persisted state on a version mismatch.

- `useUserStore` (`user-store`): nusach, location, theme (one of the six palette names), language, notification permission/toggle, profile fields, halachic opinions, in-Israel flag, onboarding flag, the reader's text size and auto-scroll (`siddurAutoScroll`, off by default, and `siddurScrollSpeed`, a level into the 15 `SIDDUR_SCROLL_SPEEDS`), `prayerMode` (`minyan` or `alone`, `minyan` by default; `alone` folds the minyan-only passages in the siddur reader), the hilula notices switch (`hilulotEnabled`, off by default), `gender` and `maritalStatus` (`married` or `single`), each `null` until answered, taharah opt-in.
- `useMitzvotStore` (`mitzvot-store`): enabled state and custom reminders per mitzvah.
- `useCompletionsStore` (`completions-store`): `completions[YYYY-MM-DD][mitzvahId] = timestamp` and parallel `skipped` map, `checkIns[firstHolyDay] = finishedAt`, and `archivedDays` — runs of kept days that retention pruned, so the streak reaches past 400 days.
- `useCustomMitzvotStore` (`custom-mitzvot-store`): user-created mitzvah definitions.
- `useTaharahStore` (`taharah-store`): the taharah event log, minhag settings and reminder leads, in an MMKV instance encrypted with a key held in `expo-secure-store` ([TaharahStorage.ts](src/services/TaharahStorage.ts)). `expo-secure-store` and `expo-crypto` are native modules the shipped 1.0.16 binary does not carry, so code importing them needs a build before it can ship over the air.

[zustandMiddleware.ts](src/stores/zustandMiddleware.ts) deliberately requires `../../node_modules/zustand/middleware.js`. Do not replace it with a direct ESM import unless Metro and Jest are both verified.

`AppResetService.reset()` cancels notifications, resets all stores, and clears MMKV on native, including the taharah data and its key.

## UI, Theme, RTL, and i18n

- The app loads Heebo font weights in [_layout.tsx](src/app/_layout.tsx).
- Use `useTheme()` and `src/theme/*` tokens. Avoid hard-coded colors in new UI unless there is a narrow reason.
- Six palettes live in [src/theme/colors.ts](src/theme/colors.ts): gold, pink, purple and blue (light, white surfaces on a tinted background), dark and plum (dark plum with a rose accent), chosen in Settings as colour circles with no visible labels. `gold` / `onGold` / `goldLight` are each palette's accent tokens, `goldText` is the accent as a text colour on light surfaces (gold itself reads 2.75:1 on white), `onUrgent` is the label colour on an `urgent` fill, `headerAccent` is the accent drawn on the header, `overlay` is the scrim behind sheets and dialogs, and `isDark` is true for the two dark palettes (`DARK_THEMES`). `BRAND` (`navy`, `gold`, `parchment`, `white`) holds the palette-independent brand colours the logo, the provider-free error boundary and a Switch thumb use.
- The type scale in [src/theme/typography.ts](src/theme/typography.ts) is display 28, title 22, heading 17, subheading / body / bodyBold 15, caption / captionBold 13, small 12 and micro 11. Spacing and radius come from [src/theme/tokens.ts](src/theme/tokens.ts) (`spacing` xs 4 to xxxl 40, `radius` xs 4 to xxl 24 and full).
- Translation tables are flat JSON dictionaries in [he.json](src/i18n/he.json) and [en.json](src/i18n/en.json); tests enforce key parity and non-empty values.
- `setLocale()` and `useI18n()` are lightweight wrappers. The `i18n-js` package is installed but the current app does not rely on the normal `i18n-js` runtime API.
- RTL is dynamic based on `useUserStore.language`. `_layout.tsx` calls `I18nManager.allowRTL/forceRTL`; native language direction changes can require a reload.
- Web also sets `document.documentElement.dir/lang` and `body.dir`.
- Main reusable UI components: `MitzvahCard`, `CompletedRow`, `ReminderEditor`, `TimeRibbon`, `BottomTabs`, `NavBar`, `AppLogo`, `ShabbatScreen`, `ChipRow`, `SettingsSection`, `DayStepper`, `OnboardingDots`, `ChoiceRow`, `ThemeSwatchRow`, `ScrollSpeedStepper`, `TaharahLock`, `ScreenHeader` / `HeaderPill`, `SegmentedControl`, `ConfirmDialog`, `BottomSheet` / `SheetAction`, `Banner`, `SectionLabel`, `ListRow`, `IconTile` and `MitzvahIcon`.
- Design-system rules, each guarded by [designSystem.test.ts](src/app/__tests__/designSystem.test.ts) where a source scan can check it:
  - A stack screen renders `ScreenHeader` (back pill, title, `actions`); a tab renders `NavBar`. Neither keeps a local back button or header style.
  - Icons come from `MitzvahIcon` / `IconTile`, a mitzvah's through `iconFor(mitzvah.icon)`; no text glyph stands in for one.
  - A segmented choice is `SegmentedControl`, a confirmation `ConfirmDialog`, an action sheet or picker `BottomSheet` with `SheetAction`, a status strip `Banner`, a list heading `SectionLabel`, an icon-title-caption row `ListRow`, and a pill row `ChipRow`; a screen never keeps a local copy and renders no `Modal` of its own.
  - No spacing or radius literal where a token matches, no white literal (`onGold`, `onUrgent` or `BRAND.white`), and no `fontWeight` on Heebo text (a `typography` variant or `fontFamilies.heebo`).

## Tests

Jest uses the `jest-expo` preset configured in [package.json](package.json).

Coverage areas:

- [src/data/__tests__/](src/data/__tests__) - registry integrity, windows, city data, skip metadata, nusach filtering, and siddur content per nusach on dated days.
- [src/services/__tests__/](src/services/__tests__) - zmanim, Hebcal, location, storage, scheduler, notification responses, settings logic, web-shim parity, exact-alarm config.
- [src/stores/__tests__/](src/stores/__tests__) - store behavior and completion/skipped edge cases.
- [src/utils/__tests__/](src/utils/__tests__) - day timeline, history stats, cross-surface `skipOn` agreement, liturgical day flags, and the taharah engine (`taharah.*.test.ts`: onot, cycle, vestot, tasks, summary), which also runs under `pnpm test:tz -- src/utils/__tests__/taharah`.
- [src/i18n/__tests__/](src/i18n/__tests__) - translation parity and brand regression checks.
- [src/theme/__tests__/](src/theme/__tests__) - token/key sanity.
- [src/app/__tests__/routes.test.ts](src/app/__tests__/routes.test.ts) - Expo Router route discovery/regression tests.
- [src/app/__tests__/designSystem.test.ts](src/app/__tests__/designSystem.test.ts) - Source-level design-system tripwires: no text glyph icons, white literals, `fontWeight` or Heebo font-name literals outside their one home, stack screens on `ScreenHeader` and tabs on `NavBar`, and one `settings.theme.<name>` label per palette.
- [src/components/__tests__/](src/components/__tests__) - reusable component behavior.
- [src/components/__tests__/](src/components/__tests__) `*.render.test.tsx` - render tests of the shared building blocks (`ConfirmDialog`, `BottomSheet`, `Banner`, `MitzvahCard`, `ScreenHeader`, `SegmentedControl`, `ListRow`) on `@testing-library/react-native`, rendered through `renderWithTheme()` from [src/testing/render.tsx](src/testing/render.tsx). They assert roles, labels, states, call counts and palette colours; there are no snapshots.

Test rules that exist because the suite once passed while the app was broken:

- A test must import the shipped implementation. Re-declaring the logic under test asserts only that the test agrees with itself.
- Assert values, not types. `expect(typeof x).toBe('boolean')` passes for both answers.
- A test must be able to fail for the reason it claims. `planMitzvot` (run through `buildPlan`) drops every trigger before `input.now`, which is the real clock unless a test passes one, so fixtures in the past pass vacuously; derive dates from `Date.now()` instead.
- A fixture must mean the same moment in every zone. `new Date(2026, 3, 24, 20)` is 20:00 on the device's clock, so build an instant for an instant API with `at(location, '2026-04-24T20:00')` from [src/testing/zmanim.ts](src/testing/zmanim.ts). Calendar-day APIs (`dateKey`, `getHebrewDate`, `getHolidays`, and `isShabbat` / `omerDayFor` without a location) read device-local dates, so they take local-component dates.
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

- New route: add the file under [src/app/](src/app), update navigation/tabs if needed, then update [routes.test.ts](src/app/__tests__/routes.test.ts).
- New screen: open two sibling screens of the same kind first. A stack screen takes `ScreenHeader`, a tab `NavBar`; build lists, sheets, dialogs, banners and segmented choices from the shared components, take every colour, spacing, radius and type style from the theme tokens, put its icons through `MitzvahIcon` / `IconTile`, add both dictionaries' keys, and document it in the closest AGENTS.md. [designSystem.test.ts](src/app/__tests__/designSystem.test.ts) must stay green.
- New UI copy: update both [he.json](src/i18n/he.json) and [en.json](src/i18n/en.json), then run i18n tests.
- New theme token: add it to every palette in `THEMES` in [colors.ts](src/theme/colors.ts), then run theme tests.
- New mitzvah: update the registry, default enabled behavior, detail/schedule/history expectations, and tests. A mitzvah added after release needs the `merge` in [useMitzvotStore.ts](src/stores/useMitzvotStore.ts) to reach existing users.
- New scheduler export: update [NotificationScheduler.web.ts](src/services/NotificationScheduler.web.ts) too; [schedulerWebParity.test.ts](src/services/__tests__/schedulerWebParity.test.ts) enforces it.
- New notification action/category ID: update scheduler constants, response handling, the [Android config plugin](scripts/withMitzvahNotificationAction.js), and notification tests.
- New notification not tied to a mitzvah: an id `parseId` rejects (no `__`), a `data.kind`, no mitzvah category (its "done" button would mark a fake mitzvah), the kind in `PendingNotificationMeta` ([ids.ts](src/services/notifications/ids.ts) and the web shim), a planner candidate that names its channel, and its tap route in [notificationResponseHandler.ts](src/services/notificationResponseHandler.ts).
- New decision about whether the app may act at an instant: extend `quietBlockAt()` in [skipRules.ts](src/utils/skipRules.ts). Never add a second copy of the quiet window.
- New background task (`TaskManager.defineTask`): define it in a module imported from the root [index.js](index.js), never only behind a route module — headless launches do not load the router tree.
- New persisted store field: add a default and reset behavior; a nested shape change bumps `STORE_VERSION` and replaces the identity `migrate` in [persistOptions.ts](src/stores/persistOptions.ts) with a step that transforms the old state.
- New decision about whether a mitzvah applies to a day: extend [skipRules.ts](src/utils/skipRules.ts). Never add a second copy of that predicate.
- New nusach text or day-dependent insert: follow [scripts/siddur/AGENTS.md](scripts/siddur/AGENTS.md) — registry in [siddur.ts](src/data/siddur.ts), day flags in [siddur.ts](src/utils/siddur.ts), manifest, `pnpm siddur:build`, dated content tests.
- New standalone siddur text (no mitzvah): its id in `StandaloneTextId` ([siddur.ts](src/types/siddur.ts)), its name and group in `STANDALONE_TEXTS` ([siddur.ts](src/data/siddur.ts)), a new group's i18n key `siddur.group.<group>`, a manifest entry for all four nuschaot, `pnpm siddur:build`, and dated cases in [siddur.test.ts](src/data/__tests__/siddur.test.ts). The catalog and the reader need no change.
- New Android permission or config plugin: re-run [pnpm prebuild:clean](package.json) and check the generated manifest, then [pnpm check:dox](scripts/check-dox.js).
- New or moved AGENTS.md: run [pnpm check:dox](scripts/check-dox.js) — it verifies links, section order, and every Child DOX Index.
- Version bump: raise `version` in [app.json](app.json) and [package.json](package.json) in the same edit, and only in a change that also produces a native build. See [Release and Updates](#release-and-updates) for why a bump on its own strands every installed user.
- New taharah rule or preset value: change [taharahPresets.ts](src/data/taharahPresets.ts), raise `TAHARAH_RULES_VERSION`, update the pinned values in its test and the same cell in [docs/taharah-review.html](docs/taharah-review.html), then run `pnpm test:tz -- src/utils/__tests__/taharah`.
- New taharah event type or task kind: extend [taharah.ts](src/types/taharah.ts), the engine, the `taharah.task` union of `PendingNotificationMeta` in [ids.ts](src/services/notifications/ids.ts) and the web shim, the taharah planner, and the log screen.

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

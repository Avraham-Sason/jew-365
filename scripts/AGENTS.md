# AGENTS.md

## Purpose

- Own local workflow scripts and Expo config plugins that affect development startup or generated native behavior.

## Ownership

- [withExactAlarmPermissions.js](withExactAlarmPermissions.js) caps `SCHEDULE_EXACT_ALARM` at `maxSdkVersion=32` so exact alarms work on every Android version without triggering Google's exact-alarm declaration form.
- [free-port.js](free-port.js) frees a local TCP port before `pnpm web`, cross-platform.
- [test-timezones.js](test-timezones.js) runs the suite once per zone (UTC, Asia/Jerusalem, America/Los_Angeles, Pacific/Kiritimati). It puts `TZ` and `JEST_TZ` in the environment of the Jest process it spawns, so Node resolves the zone at startup and every worker inherits it. Extra arguments are forwarded to Jest.
- [jest-timezone-setup.js](jest-timezone-setup.js) is a Jest `setupFiles` guard. When `JEST_TZ` is set, it fails the run unless the test process really runs in that zone.
- [withMitzvahNotificationAction.js](withMitzvahNotificationAction.js) is an Expo config plugin that injects Android notification action handling.
- [withAndroidBackupRules.js](withAndroidBackupRules.js) writes `res/xml/jew_365_backup_rules.xml` (Android 11 and below) and `jew_365_data_extraction_rules.xml` (cloud backup and device transfer, Android 12 and up) and points the manifest's `fullBackupContent` and `dataExtractionRules` at them. Both list the same `BACKED_UP` includes: the main MMKV file, its `.crc` and React Native's `I18nUtil` preferences. An `<include>` turns every other file off, so the taharah files, the secure store, expo-notifications and expo-updates stay out. [../app.json](../app.json) passes `configureAndroidBackup: false` to `expo-secure-store`, whose own rules would otherwise compete for the same attributes.
- [check-dox.js](check-dox.js) enforces the mechanical half of the DOX contract: dead links, plain-text file references, section order, and Child DOX Index accuracy.
- [jest-asset-stub.js](jest-asset-stub.js) stands in for siddur and Chok LeYisrael asset modules under Jest, where Metro asset resolution does not exist.
- [publish-update.js](publish-update.js) backs every `pnpm update:*`. It reads the update messages EAS holds for the channel's branch and the [../app.json](../app.json) `version` (the runtime version, by the `appVersion` policy) and takes the next number: one above the highest `<version>-<n>:` message prefix, or, when no message carries one, one above the count of updates. It prefixes `--message` with `<version>-<n>: `, puts `n` in `EXPO_PUBLIC_UPDATE_NUMBER`, which Metro inlines into the bundle, and runs `eas update --clear-cache` so no cached transform keeps an older number. A branch EAS does not know yet starts at 1. It refuses to publish without `--message` or when EAS cannot list the branch. It refuses to publish while [../src/data/chokAssets.generated.ts](../src/data/chokAssets.generated.ts) differs from the last commit (`chokMapCommitted()`), so a local Chok LeYisrael build never ships by accident.
- [logo/export.mjs](logo/export.mjs) is the second half of `pnpm logo:build` (the first is [../design/jew365-concepts/vector/build.mjs](../design/jew365-concepts/vector/build.mjs), which draws the logo SVGs and writes `mark-o-meta.json`). Plain Node plus a Chromium-based browser, found from `CHROME_PATH`, then the standard Edge and Chrome paths on Windows and macOS, then Chrome, Chromium and Edge on `PATH`; it fails with a clear message when there is none. It renders each SVG in the headless browser with a transparent background, crops the screenshot, and writes with its own PNG encoder: [../assets/icon.png](../assets/icon.png) opaque RGB on cream, [../assets/adaptive-icon.png](../assets/adaptive-icon.png) and [../assets/adaptive-monochrome.png](../assets/adaptive-monochrome.png) drawn to a 0.255-width radius, well inside the 66/108 safe circle it still checks, because Samsung's launcher crops past that circle (filling it cut the crown, check and bell on a real phone, 2026-10-21), [../assets/splash.png](../assets/splash.png) and [../assets/splash-dark.png](../assets/splash-dark.png) inside 0.96 of their width, [../assets/notification-icon.png](../assets/notification-icon.png) as a white 96 px silhouette and [../assets/favicon.png](../assets/favicon.png) at 48 px. It refuses a file whose transparency or ink radius is wrong, prints each file's size and colour type, then writes [../src/components/logo.generated.ts](../src/components/logo.generated.ts) (the SVG strings and aspect ratios behind `AppLogo`) and formats it with Prettier. Outputs are never edited by hand.
- Script tests live in [__tests__/](__tests__/).
- [siddur/AGENTS.md](siddur/AGENTS.md) owns the siddur content build.
- [chok/AGENTS.md](chok/AGENTS.md) owns the Chok LeYisrael content build, local only until the source's owner gives written permission.

## Local Contracts

- Scripts must be plain Node and cross-platform. A shell-specific script silently breaks every non-Windows contributor and CI runner; that is why `pnpm web` no longer shells out to PowerShell.
- Scripts must be non-interactive: they run from `pnpm` scripts and in CI, where nothing can answer a prompt.
- The notification config plugin must stay aligned with scheduler constants in [../src/services/AGENTS.md](../src/services/AGENTS.md), especially `MARK_DONE`.
- Generated native folders are not owned here; the plugin source is the durable artifact.
- Set a test zone through the `env` of a spawned Jest process. Assigning `process.env.TZ` inside Jest does nothing, because `setupFiles` get a copy of `process.env`, so the clock never moves. A `TZ=` prefix in Git Bash is dropped for native programs as well; PowerShell `$env:TZ` and cmd `set TZ` do work.

## Work Guidance

- Prefer narrow script changes over adding new tools.
- For config plugin changes, reason through both manifest mutations and generated Kotlin output.

## Verification

- Run `pnpm web` or `node scripts/free-port.js <port>` after changing [free-port.js](free-port.js).
- Run `pnpm test:tz` after changing date or timezone handling.
- After changing [test-timezones.js](test-timezones.js) or [jest-timezone-setup.js](jest-timezone-setup.js), check that the guard still fails a run whose zone did not apply, e.g. `JEST_TZ=Pacific/Kiritimati npx jest src/theme` from Git Bash.
- Run `pnpm test -- scripts/__tests__/publishUpdate.test.js` after changing [publish-update.js](publish-update.js). For the inlining, `npx expo export --platform android --no-bytecode --clear` with `EXPO_PUBLIC_UPDATE_NUMBER` set must compile `appVersionLabel()` to that number, and to `0` without it.
- Run `pnpm doctor` after changing Expo config plugin behavior.
- After changing [logo/export.mjs](logo/export.mjs), run `pnpm logo:build` (it prints each PNG's size, colour type and ink radius), look at the PNGs, then `pnpm test -- scripts/__tests__/logoAssets.test.js src/components/__tests__/AppLogo.render.test.tsx`. For a change to the splash, icon or notification wiring, `npx expo prebuild --platform android --clean --no-install` and read `res/values/styles.xml`, the `splashscreen_logo` drawables, `mipmap-anydpi-v26/ic_launcher.xml` (it must hold a `<monochrome>` layer), `values/colors.xml` and `values-night/colors.xml`; delete `android/` afterwards.
- After changing [withAndroidBackupRules.js](withAndroidBackupRules.js), run `pnpm test -- scripts/__tests__/androidBackupRules.test.js`, then `npx expo prebuild --platform android --no-install` and read `android/app/src/main/res/xml/` and the `<application>` attributes of the generated manifest; delete `android/` afterwards. On a device or emulator, `adb shell bmgr enable true` and `adb shell bmgr transport com.android.localtransport/.LocalTransport`, then, with the app opened once and backgrounded (a force-stopped app answers "Backup is not allowed"), `adb shell bmgr backupnow com.jew365.app`, `adb shell pm clear com.jew365.app` and `adb shell bmgr restore 1 com.jew365.app` (the token from `bmgr list sets`) exercise a real backup and restore; as root, `tar -tvf /data/data/com.android.localtransport/files/1/_full/com.jew365.app` lists exactly what was backed up. Verified on 2026-10-14 (API 37), under the app's previous package: the archive held the three `BACKED_UP` files and nothing else, and the restored install opened on home with its settings and streak.
- Run `pnpm check:dox` after changing [check-dox.js](check-dox.js) itself, and confirm it still fails on a deliberately broken link before trusting a pass.
- Use a dev client or native build to verify Android notification-action behavior.

## Child DOX Index

- [siddur/AGENTS.md](siddur/AGENTS.md) - Build from pinned Sefaria and Wikisource sources to the bundled, day-conditioned nusach texts.
- [chok/AGENTS.md](chok/AGENTS.md) - Build from the raktora pages of "חוק לישראל השלם" to the Chok LeYisrael assets.

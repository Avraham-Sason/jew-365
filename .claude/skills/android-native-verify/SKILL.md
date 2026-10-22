---
name: android-native-verify
description: "Verify a Jew 365 change on a real Android build in the local emulator (AVD test_phone), send screenshots, or download the latest finished EAS APK to the user's Downloads folder with package and versionCode checked. Use for: תבדוק באמולטור, צילומי מסך מהאמולטור, תריץ על אנדרואיד, תוריד לי את ה-APK, תביא לי את ה-APK, native check, test on the emulator, emulator screenshots, download the APK, latest APK. Not for web-only UI checks (use the expo-web preview) and not for publishing a build or an update (see the ship skill)."
---

# android-native-verify

All commands go through `native.ps1` beside this file. Run it with PowerShell 7 from anywhere:

```
pwsh -NoProfile -File "<repo>\.claude\skills\android-native-verify\native.ps1" <command> [options]
```

Every command prints `[native] ...` lines for what it did and, on any failure, `[native] FAILED: <reason>` with exit code 1. A failure is final for that step: read the reason, fix the cause, run the command again (every command is safe to repeat).

## 1. Native or web preview

Use the web preview (the `expo-web` launch config in `.claude/launch.json`, port 8090, never `pnpm web`, which kills Docker's port 8081 on this machine) for layout, copy, theme, navigation and pure logic.

Use the emulator for anything the web build fakes or lacks:

- notifications and their action buttons, the exact-alarm permission, the background task, the update banner;
- MMKV persistence, the secure store, biometric lock (taharah screens), backup and restore, the share sheet;
- deep links (`jew365://...`), RTL after a reload, fonts and the launcher icon and splash (`assets/`, baked into `android/` at prebuild), Android permissions and config plugins;
- anything `react-native-web` renders wrong (the web `Switch`, the notification permission state).

If a change is only layout or logic, say so and use the web preview instead of paying for a native build.

## 2. Build or OTA

Decide this before verifying, because it sets what the emulator run proves:

- JS-only change (TypeScript, JSX, i18n strings, bundled assets): ships over the air with `pnpm update:production --message "..."` (the production channel, never preview, unless the user names it). The emulator dev build loads the working tree through Metro, so one native build covers every later JS-only iteration.
- Native change (a dependency with native code, an Android permission, a config plugin under `scripts/`, `app.json` identity fields, `locales/`): needs a new build, `pnpm build:android:production-apk` for a direct-install APK or `pnpm build:android:production` for the Play AAB. Raise `version` in `app.json` and `package.json` in the same edit, and only in a change that produces a build. Run `pnpm prebuild:clean` after identity changes. Never hand-edit a version code.
- Never run a build, an update, a commit or a push from this skill. They are the user's explicit call (see the ship skill).
- Uploading an AAB to the Play Console is always the user's step.

## 3. Verify a change in the emulator

1. `prepare` (first time, and after any change to files you want tested):

   ```
   native.ps1 prepare
   ```

   Copies every tracked and untracked-but-not-ignored file (except `.claude/`, `.agents/`, `design/`, `docs/`, `release/`) to `C:\work\kjn`. `-Copy` must be a folder under `C:\work\` that is not the repo, inside it, a parent of it or a drive root; the script refuses anything else, and refuses to write into a non-empty folder it did not create (no `.kjn-manifest`). The short path is mandatory: the repo path plus pnpm's `.pnpm` folders and the `.cxx` prefab folders go past 260 characters and `react-native-worklets` fails with `ninja: error: manifest 'build.ninja' still dirty after 100 tries`. It writes `.npmrc` with `node-linker=hoisted` and runs `pnpm install --frozen-lockfile`.

   Re-running it is cheap: when `pnpm-lock.yaml`, `app.json`, `app.config.*`, `plugins/`, `assets/`, `scripts/with*.js` and `locales/*.json` match the hash stored in the copy, it only syncs the changed files and keeps `node_modules` and the generated `android/`. When they differ it deletes the stale `android/` (a stale one builds the wrong applicationId and scheme), stops Gradle and reinstalls. `-Force` forces the full path.

2. `run` (optionally with a deep link into the screen under test):

   ```
   native.ps1 run
   native.ps1 run -DeepLink "jew365://siddur/shacharit?date=2026-10-28"
   ```

   Starts AVD `test_phone` if it is not running and waits for `sys.boot_completed`, runs `adb reverse tcp:8083 tcp:8083` (the dev client cannot reach Metro on the LAN address), starts `expo run:android --device test_phone --port 8083` in the copy, waits for the build to install, the app to launch and Metro to print `Logs for your project will appear below` (first build takes many minutes; `-TimeoutMin` raises the 45 minute limit; the log is `%TEMP%\jew365-native\run.log`), then opens `exp+jew-365://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8083` and the deep link. A second `run` reuses the Metro it started.

   Emulator ownership: the script picks the emulator by `adb -s <serial> emu avd name` equal to `-Avd`, passes `-s <serial>` to every adb call and `--device test_phone` to expo, and records `serial` and `startedByUs` in `%TEMP%\jew365-native\run.json`. When an emulator of that AVD is already running and this skill did not start it, `run` fails with "belongs to another session": ask the user, and pass `-UseRunning` only if he says to attach to it.

   Deep links: `jew365://siddur/<id>?date=YYYY-MM-DD` opens the reader; any route under `src/app/` works the same way.

3. Drive the screen. The script has no tap command; use adb directly (it is on PATH):

   - `adb shell input tap <x> <y>`, `adb shell input text ...`, `adb shell input keyevent KEYCODE_BACK`;
   - `adb shell uiautomator dump /sdcard/ui.xml` then `adb exec-out cat /sdcard/ui.xml` exposes labels and short texts, so find tap targets from the dump instead of guessing coordinates;
   - in Git Bash export `MSYS_NO_PATHCONV=1` first, or `/sdcard/...` gets mangled; in PowerShell no flag is needed.

4. `shot <name>`:

   ```
   native.ps1 shot home-after-fix -OutDir "<session scratchpad directory>"
   ```

   Saves `<OutDir>\<name>.png` from the emulator `run` recorded (it fails if none is recorded) with `adb exec-out screencap -p`, choosing a display id from `dumpsys SurfaceFlinger --display-id` (the emulator has two displays and `screencap` without `-d` can return the wrong one or fail), and prints `screenshot saved: <full path>`. Always pass the session scratchpad as `-OutDir`: the file-sending tool reads only session folders. Without `-OutDir` the file lands in `%TEMP%\jew365-native\shots`.

5. Send each screenshot to the user with the file-sending tool (`SendUserFile`) using the printed path, one short Hebrew line per image saying what it shows. The user asked for pictures of every native check ("send me screenshots from the emulator"); do not describe the result without them.

6. Report: what was verified on the emulator, what was not, and the screenshots. Say plainly if a step could not run.

## 4. Teardown (always, at the end of the check)

```
native.ps1 teardown                 # gradlew --stop, stop the Metro this skill started, free the port
native.ps1 teardown -Delete         # also delete C:\work\kjn (only a folder with .kjn-manifest)
native.ps1 teardown -StopEmulator   # also close the emulator, only one this skill started
```

Teardown stops Metro by the PID recorded in `run.json`, never by whatever listens on 8083: if another process holds the port it says so and leaves it. With `-StopEmulator` it leaves an emulator it did not start (or attached to with `-UseRunning`) running and says so.

Stop the Gradle daemon before deleting the copy (the script does). Delete the copy and close the emulator when the user asks ("close the emulator and delete the copy"), or when the check is finished and nothing else needs them; keep the copy while more native iterations are coming, because `prepare` then takes seconds.

## 5. Download the latest APK

```
native.ps1 apk                          # profile production-apk
native.ps1 apk -BuildProfile preview    # another EAS profile
```

Runs `npx eas-cli build:list --platform android --limit 10 --json --non-interactive` in the repo (it needs an eas-cli login that can see `@jew-365-org/jew-365`; when the login is missing the script reports eas-cli's error as is, and the user logs in from a real terminal), picks the newest FINISHED build of the profile, downloads its artifact to `Downloads\jew365-<version>-<buildNumber>.apk`, and verifies it with `aapt dump badging` (package must be `com.jew365.app`, versionCode must equal the build record's build number). Without `aapt` it says so and prints the values from the build record instead. A file that is already in Downloads is reused, not downloaded again.

Report the printed path, version, versionCode, and that the build is signed with the EAS keystore (SHA-256 `DC:62:...:00:B4`), so it installs over a Play install and the reverse. Install steps for the user: copy the APK to the phone, open it, allow installs from that source; on the emulator `adb install -r <path>`.

`production-apk` is the direct-install profile. The `production` profile produces the AAB for the Play Console; `apk` fails loudly if the newest build of a profile has no APK or has expired.

## 6. Known limits

- A native build from the copy is slow the first time and incremental later; do not start it speculatively.
- The Sentry plugin keeps placeholders in `app.json`; the dev build runs with Sentry off, as intended.
- `.env` is not copied (it is gitignored), so `EXPO_PUBLIC_*` variables are unset in the dev build.
- The emulator may be held by another session (an install or build in progress, `adb shell` not answering). The script bounds every adb call and fails with "the emulator does not answer", and `run` refuses an emulator it did not start; never kill an emulator you did not start, ask the user.
- Port 8083 is the project's native-test Metro port. If something else holds it, `run` fails instead of killing it.

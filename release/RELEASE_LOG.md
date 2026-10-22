# Release Log

Every step toward the stores, in order: what was done, what it produced, and every failure that blocked progress with how it was cleared. Newest day last. The answers given in the Play Console live in [PLAY_CONSOLE_METADATA.md](PLAY_CONSOLE_METADATA.md); open work lives in [../not-close.md](../not-close.md).

## 2026-10-20

- Accounts moved to 365jew@gmail.com: Expo organization `jew-365-org` (project transferred, same project ID, keystore SHA-256 `DC:62…00:B4` checked identical after the move), GitHub organization `jew-365` (Pages moved to `https://jew-365.github.io/jew-365/`), Formspree form `mrpevdbk`. The Play Console stays owned by avi6190i with 365jew as admin, so the identity verification is not repeated.
- Decision: upload to a Google Play closed test now and ship the redesign during it; Play App Signing uses the EAS keystore so a direct APK and a Play install are signed alike.
- AAB `3753424b` (1.0.20, versionCode 3) built from a clean worktree of `3f0ab1f`. Never uploaded (superseded by the redesign).
- Play app `com.jew365.app` created; all ten App content declarations answered; Hebrew default listing (`iw-IL`) with an English translation; category Lifestyle; contact details.
- Blocked: the built-in browser cannot upload files. Cleared: store graphics uploaded through Claude in Chrome.
- Blocked: coordinate clicks drifted in Play's scrolling dialogs and ticked the wrong boxes. Cleared: clicks by element reference, each dialog checked before saving.
- Temporary store graphics uploaded: icon, feature graphic, five screenshots.
- Testers: Google Group `jew365-testers@googlegroups.com` created. Blocked: Google Groups asked for a CAPTCHA, which Claude does not solve. Cleared: the owner solved it.
- Track `Closed testing - Alpha`: all 178 countries, the testers group, feedback to 365jew@gmail.com.
- Privacy policy gained the `#delete` section the Data safety form links to; store copy and Play answers recorded; pushed (`96f6f52`).

## 2026-10-21

- Every promise of no server, no database or offline only removed from store copy, the site, the privacy policy, the app and the docs (`dcf802a`); the Play descriptions in Hebrew and English edited to match. The owner's standing rule from then on: no text anywhere states or implies it, even while it is true; current data flows are described in the present tense. On 2026-10-22 the rule itself was taken out of the agent docs, so this log is its only written record in the repo.
- Redesign (warm palette, premium UI, the Jew 365 logo) merged with the Expo SDK 54 patch upgrades into `main` (`93f2af4`) after typecheck, lint, DOX and 2,710 tests in four zones; pushed.
- Builds 1.0.20: AAB `a0d84bad` (versionCode 4) and APK `811bbbb9` (versionCode 5).
- Play App Signing: Play had generated its own key when the app was created (SHA-256 `47:2D:E3:57…`). Blocked: Claude Code's auto mode refused Claude's click on "Change app signing key". Cleared: after the owner's approval in chat the click passed. The PEPK zip was made by the owner running the export script (decrypts the keystore backup, checks the SHA-256, runs PEPK, cleans up). Blocked: the browser upload tool reads only this session's folders. Cleared: the owner uploaded the zip. Play now shows the EAS key `DC:62…00:B4` as the app signing key and the upload key.
- Store graphics replaced with the redesigned set; screenshots ordered home, siddur, reader, history, settings.
- Blocked: the 1.0.20 APK showed the launcher icon cropped on the owner's Samsung phone (the mark filled the whole 66/108 safe circle). Cleared: the adaptive mark drawn to a 0.255-width radius; version raised to 1.0.21 (`3a7b177`); builds `0b2ddd8f` (AAB) and `e2682ebc` (APK).
- Blocked: the browser upload tool caps a file at 10 MB, below an AAB. Standing workaround: the owner uploads every AAB; Claude does the rest of the release.

## 2026-10-22

- The owner saw the same icon after installing 1.0.21: the APK held the fixed icon (checked by extracting its foreground), so the launcher showed a cached one; a restart refreshes it. The four orange symbols were missing by design of the icon variant.
- Rule set by the owner: the four symbols in every logo asset at every size. All icons now come from the full mark; the notification accent moved from orange to the logo's blue `#012B97`. Before building, an exact preview was made from the files `expo prebuild` generates (launcher masks at real pixels and 3x, notification bar and shade). Committed `11be1c8`, pushed.
- Builds 1.0.21: AAB `cc56fee1` (versionCode 8) and APK `d54afeab` (versionCode 9), both signed with `DC:62…00:B4`, the APK checked for the symbols and the blue colour. Store icon replaced with the symbols version.
- The owner installed the APK and approved it; the owner uploaded the AAB to the closed test release.
- Blocked: the release showed three errors. Cleared each:
  - "Add a full description" and "Complete the steps on the Dashboard": the store listing had only ever been saved as a draft. Next, then Save, published it to the overview; the dashboard's setup steps completed.
  - Exact alarm permission: declared core functionality Calendar (the owner's call).
  - The listing's AI asset declaration: icon and feature graphic labelled as created or edited using AI, screenshots not (the owner's call).
- Release `8 (1.0.21)` with Hebrew and English notes saved without errors (one non-blocking warning about a deobfuscation file), and all sixteen changes sent for Google's review. Play's quick checks run first, then the review (typically up to 7 days).
- 02:11: Play's quick checks passed with no issues; Publishing overview shows "Your changes are now in review". The review itself is under way (typically up to 7 days).
- 02:21: Google approved the release. `8 (1.0.21)` is "Available to selected testers" on `Closed testing - Alpha`, and Play notified "App update published". The Testers tab's links are the ones in the invitation: Join on Android `https://play.google.com/store/apps/details?id=com.jew365.app`, Join on the web `https://play.google.com/apps/testing/com.jew365.app` (the opt-in page loads and names the app). The Dashboard shows 0 testers opted in; the group has one member, the owner.
- 10:45: the first two testers opted in: the owner's own account `avi6190i` (also the Play Console owner, and it counts toward the 12) and one invited tester; the Dashboard shows 2. Blocked: the store link from the invitation kept opening "Item not found" for the owner, while the other tester saw the app. Cleared: the store link on the opt-in page ("You are a tester") opened the app; the invitation now sends testers there when the store link fails.

- The public site (support page, both privacy policies, the taharah review page) moved to the redesign's palette, and its favicon to the full mark with the four symbols, now written by `pnpm logo:build`; merged with the remaining local work and pushed in one push.

## Next

- Send the invitation in [PLAY_CONSOLE_METADATA.md](PLAY_CONSOLE_METADATA.md) to 15 to 20 people; its links are the ones the Testers tab shows. The 14 days count from each opt-in, and production needs at least 12 opted in for 14 days in a row; the Dashboard shows the count ("testers currently opted-in").
- Then apply for production from the Dashboard.

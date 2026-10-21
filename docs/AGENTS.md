# AGENTS.md

## Purpose

- Own the public website served by GitHub Pages from this folder: the support page and the privacy policy that both app stores link to.

## Ownership

- [index.html](index.html) is the support and marketing page. Apple's Support URL and Marketing URL point here. It is one Hebrew page: the tagline, a feature list, the support address, the FAQ, a privacy summary and a one-line English summary that names the app "Jew 365".
- [privacy/index.html](privacy/index.html) is the Hebrew privacy policy, the canonical text.
- [privacy/en/index.html](privacy/en/index.html) is the English privacy policy and must stay a faithful equivalent of the Hebrew one.
- [taharah-review.html](taharah-review.html) is the Hebrew review document for the rav who approves the halachic rules of the family-purity tracker. It is reached by direct URL only (nothing links to it, and it is `noindex`). It must match [../src/data/taharahPresets.ts](../src/data/taharahPresets.ts) exactly: a changed preset value, rule or `TAHARAH_RULES_VERSION` changes the table, the rules version in its meta line and the numbered list of items to verify in the same edit. It is a review document, not a user-facing policy, and not a claim about shipped behavior.
- [style.css](style.css) is shared by every page here, [taharah-review.html](taharah-review.html) included. Its dark scheme mirrors the app's dark palette (`T_DARK` in [../src/theme/colors.ts](../src/theme/colors.ts)): background `#0D1925`, text `#EDE7DB`. Its light text is the app's navy `#1C2B4A`.
- [favicon.png](favicon.png) is a copy of [../assets/favicon.png](../assets/favicon.png) that every page links as its icon; replace it when the app's favicon changes.
- [fonts/](fonts) holds the Heebo Regular and Bold files [style.css](style.css) serves. Their licence is [fonts/OFL.txt](fonts/OFL.txt), the SIL Open Font License 1.1 with the copyright line the font files carry; it stays beside the fonts, because the licence requires it to travel with every copy.

## Local Contracts

- The support page and the privacy policies are public and legally binding. Every claim must be provable from the shipped code, not from intent.
- The policy states that the app has no server of its own and names every third party the app talks to. Today that is Expo (EAS Update: a technical update check carrying a random installation identifier Expo counts installs by, no personal data), Formspree (Formspree, Inc., formspree.io: only a message the user sends from Settings → Contact us, carrying the name, phone and message typed there plus the app version, the OS and its version and the UI language, exactly the body `sendContactMessage()` in [../src/services/ContactService.ts](../src/services/ContactService.ts) posts) and Sentry (Functional Software, Inc., sentry.io: crash reports from production builds only, carrying the stack trace, device model, OS version, app version and update id, with no personal data, no taharah data and no screen content, IP addresses not stored, and no in-app opt-out). Adding any other analytics, crash reporting, ad SDK or backend call, or widening what Sentry receives, breaks that claim and requires editing both language versions in the same change.
- Both policies carry the same thirteen sections, in this order: what the app stores; profile answers (gender, marital status); family purity tracking; biometric lock; where data is stored; what does leave the device; crash reports; what the app does not do; permissions and why they are needed (location, notifications, exact alarms, run at boot, hourly background refresh, biometrics, wake lock); deleting your data; children; changes to this policy; contact. A new data category gets its own section or list item in both.
- The policy states the backup exactly as the code behaves: on Android the Auto Backup whitelist of [../scripts/withAndroidBackupRules.js](../scripts/withAndroidBackupRules.js) (preferences, mitzvot, history, profile answers; taharah data out), on iOS the device's iCloud backup of the app's storage (the encrypted taharah file may ride it without its key, and so may the unencrypted fallback file), and the exported file of [../src/services/BackupService.ts](../src/services/BackupService.ts) (unencrypted, never taharah data). Changing either changes both language versions.
- The policy states how the family purity data is protected exactly as [../src/services/TaharahStorage.ts](../src/services/TaharahStorage.ts) behaves, including the unencrypted fallback file when the key cannot be read. Change one, change the other.
- The reset wording is the app's own: Settings → Device and notifications → App → Reset the app (`settings.device`, `settings.app` and `settings.logout` in [../src/i18n/he.json](../src/i18n/he.json) and [../src/i18n/en.json](../src/i18n/en.json)). The FAQ paths follow the app's labels the same way: hilulot and Rosh Chodesh (Settings → My mitzvot, the library the row opens, where the "הילולות צדיקים" and "ראש חודש" rows carry the switches; `/hilulot` repeats the hilulot switch) family purity (Settings → Profile → Family purity), backup (Settings → Backup and restore, `settings.backup`; on a new phone, `onboarding.restore` on the welcome step), and contact (Settings → Contact us, `settings.contact`).
- Contact details and store URLs are real values. Never write a placeholder here.
- Both language versions change together. A section added to one and missing from the other is a compliance gap.
- Update the effective date at the top of both policy pages whenever their substance changes, and only then.
- Names: the Hebrew pages use the Hebrew display name in [../app.json](../app.json), `יהודי 365`; the English pages use `Jew 365`, the same as `app.name` in [../src/i18n/en.json](../src/i18n/en.json).
- Plain static HTML with no build step and no external assets: Heebo is served from [fonts/](fonts) through the `@font-face` rules in [style.css](style.css), so a page view contacts no third party. Add no external font, stylesheet, script or tracker.

## Work Guidance

- Before editing a data claim, verify it against [../app.json](../app.json) permissions, [../src/stores/](../src/stores) for what is persisted, and [../src/services/](../src/services) for what leaves the device.
- Store listing copy lives in [../release/](../release) and links back to these URLs. Change one, check the other.

## Verification

- Open both policy pages in a browser and confirm the Hebrew renders right-to-left and the language switch links resolve.
- Open [taharah-review.html](taharah-review.html) at phone width (375px) and at desktop width: confirm the Hebrew renders right-to-left, nothing scrolls horizontally, the rules table collapses into stacked cards with a label on every value, and each `לאימות` badge jumps to its numbered item in section 8.
- Run [pnpm check:dox](../scripts/check-dox.js) after adding or moving a file here.
- Confirm the live URLs resolve after publishing: `https://jew-365.github.io/jew-365/`, `https://jew-365.github.io/jew-365/privacy/` and `https://jew-365.github.io/jew-365/privacy/en/`.

## Child DOX Index

- No child AGENTS.md files.

# AGENTS.md

## Purpose

- Own release-facing written artifacts for stores, privacy, and public metadata.

## Ownership

- [APP_STORE_METADATA_HE.md](APP_STORE_METADATA_HE.md) and [APP_STORE_METADATA_EN.md](APP_STORE_METADATA_EN.md) own App Store listing copy. The English file also holds the App Privacy answers.
- [PLAY_CONSOLE_METADATA.md](PLAY_CONSOLE_METADATA.md) owns Google Play listing copy (Hebrew default as `iw-IL`, English translation), the Data safety answers, the App content answers as submitted, the content rating notes, the store graphics in use, and the closed test (track, testers group, release notes, the testers' invitation). A change in the Play Console is recorded there in the same pass.
- [RELEASE_LOG.md](RELEASE_LOG.md) is the chronological record of every step toward the stores: what was done, what it produced, and every failure that blocked progress with how it was cleared.
- The published privacy policy lives in [../docs/privacy/index.html](../docs/privacy/index.html) and [../docs/privacy/en/index.html](../docs/privacy/en/index.html), not here. This folder owns store copy only.

## Local Contracts

- Keep release copy aligned with the current display name, package identifiers, privacy behavior and data flows described in [../AGENTS.md](../AGENTS.md) and [../app.json](../app.json).
- Names and tagline: the Hebrew store name is `יהודי 365` with the subtitle `כל מצווה בזמנה`; the English store name is `Jew 365` with the subtitle `Every mitzvah in its time`.
- Do not claim backend, account, sync, analytics, or cloud behavior unless current source code and config prove it. The outbound data flows in the copy are crash reporting to Sentry (Functional Software, Inc.) from production builds and a contact message the user sends from Settings → Contact us through Formspree (Formspree, Inc.), and the store forms must say so: App Store Connect lists Crash Data, not linked to the user, not used for tracking, and Contact Info (Name, Phone Number) and Other User Content, linked to the user, used for App Functionality (support), not used for tracking; Play Data safety lists crash logs and diagnostics, collected and not shared (Sentry is a service provider, which Play does not count as sharing), required, for analytics; name, phone number and other in-app messages, collected, not shared, optional, for app functionality (the support form); and device or other IDs, collected, not shared, required, for app functionality and analytics (the update check's random installation identifier); deletion requests by email, at the policy's `#delete` section. The published policy names every third party the app talks to, and the store forms must match it.
- Backup is not collection: Android Auto Backup and the iCloud device backup are the operating system's services in the user's own account, and the exported file goes only where the user sends it, so none of them is declared as collected in a store form. Taharah data is in none of them.
- The optional taharah tracker keeps menstrual-cycle related dates on the device and does not collect them. Answer every store health question from that fact.
- The same tracker sets the App Store age-rating questionnaire to Infrequent/Mild Medical/Treatment Information, and the rating is whatever App Store Connect computes from its questionnaire. Never submit `4+`. Answer the Play content rating questionnaire from the same facts.
- Hebrew copy should preserve Hebrew-first product positioning; English copy should be a faithful market-facing equivalent, not a literal machine translation.
- The feature list in the copy is the shipped feature list: nine built-in mitzvot, custom mitzvot, notification buttons, the siddur (the mitzvah texts plus sixteen standalone texts, Tehillim, Nishmat Kol Chai and Selichot among them, four nuschaot, auto-scroll), schedule and history, the Shabbat and Yom Tov rest with the check-in and the pre-block notice, the optional notices for the hilulot of 57 tzaddikim and for Rosh Chodesh (three days before, the evening before, on the day), the weekly report after Shabbat (on by default: a notification that opens a report screen, past reports from the history tab), the optional taharah tracker, the halacha hotline (dial or WhatsApp, Ashkenazi or Sephardi by nusach), backup and restore (Android's automatic backup, the iCloud device backup, and a backup file), six palettes, twenty cities or GPS. A feature that is added or removed changes every listing in the same edit.

## Work Guidance

- Update release documents when app behavior, permissions, data collection, branding, or store-visible features change.
- Log every store step and every blocking failure in [RELEASE_LOG.md](RELEASE_LOG.md) in the same pass, the owner's rule (2026-10-22): a build, an upload, a declaration, a submission, a review result, and anything Claude could not get past alone, with how it was cleared.
- Console form-filling through the browser follows the [store-console skill](../.claude/skills/store-console/SKILL.md): every answer submitted to a console is recorded in the owning file above in the same pass.
- Store URLs and contact details must be real values. A placeholder in a field a store form consumes is a release blocker, not a note for later.
- Field limits: Apple subtitle 30 characters, promotional text 170, keywords 100 with no space after the commas, description 4000; Play short description 80, full description 4000.

## Verification

- Run `pnpm test -- src/i18n/__tests__/i18n.test.ts` after changing the app name, which the brand regression test pins.
- Cross-check any permission or data claim against [../app.json](../app.json), the published policy in [../docs/](../docs), and the privacy behavior described in [../src/services/AGENTS.md](../src/services/AGENTS.md) before publishing.
- Confirm the display name here matches [../app.json](../app.json) and `app.name` in [../src/i18n/en.json](../src/i18n/en.json); the store listing, the on-device name and this copy must agree.

## Child DOX Index

- No child AGENTS.md files.

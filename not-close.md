# Not Closed

Every open item of the project in one place: tasks, bugs, open questions, and other open items (reviews, external dependencies, unverified paths, cleanup). Add new open work here, never in a separate tasks, bugs or questions file, and delete an item in the change that closes it. Closed work lives in git history; the closed findings of the 2026-08-09 failure-point audit stay in [AUDIT.md](AUDIT.md).

Standing rules: no commit or OTA without per-action approval; every siddur text ships for all four nuschaot or not at all; English under a Hebrew segment is the pinned source's translation of exactly that segment ([scripts/siddur/AGENTS.md](scripts/siddur/AGENTS.md), Local Contracts).

## Tasks

### High — Chok LeYisrael release

Chok LeYisrael is built, merged and shipped hidden: the committed asset map is empty, so `hasChokContent()` is false and no surface shows it. Its day rules and decisions live in [src/utils/AGENTS.md](src/utils/AGENTS.md) and [scripts/chok/AGENTS.md](scripts/chok/AGENTS.md). Hard rule until the permission arrives in writing: the repository is public, so no Chok text, page cache or generated asset is committed or shipped; a local full build (`pnpm chok:build`) is allowed for validation and previews, and `pnpm chok:build --empty` restores the empty map before anything is committed, published or built.

- [ ] Obtain written permission from the raktora owner
  - **What it is:** Send the permission request (drafted in Hebrew, ready to send; it names the Zohar's Hebrew translation and asks where it comes from, since a publisher may own it, and says only that the app has no ads) to raktora@walla.co.il and keep the written reply. In the same thread, tell the owner about the source gaps the build found: Tetzaveh has no haftarah, the Vaera haftarah stops after Ezekiel 28:26, the Vezot Haberakhah haftarah has Joshua 1:1-7 only, and Rashi on Proverbs 20:18 (Vayakhel, Thursday) is cut short.
  - **What it solves:** The site is marked "כל הזכויות שמורות"; the app may not bundle its text without permission.
  - **Expected result:** A written yes that covers bundling the full text in the free app with credit, stored with the release records; or a no, which sends the content back to the user's source decision.
  - **Status:** The email is ready to send, with the user's contact line (reply, phone or WhatsApp on 054-6559314). Until the owner replies, Chok LeYisrael stays hidden exactly as shipped in update 1.0.18-9, with no local preview build meanwhile (the user's call, 2026-10-12). The next step starts when the user forwards the reply.

- [ ] Ship Chok LeYisrael once the permission is in hand
  - **What it is:** Set `DEDICATION` if the owner wants it; drop or keep the Zohar's Hebrew translation per the owner's answer about its source; choose the delivery (18.56 MB raw against 4.62 MB gzipped: check whether EAS Update serves assets compressed, else gzip the assets and inflate in JS); remove `assets/chok/` from [.gitignore](.gitignore) and commit the full build; rewrite every AGENTS.md line that says the feature is hidden; update the store copy in [release/](release) and [docs/index.html](docs/index.html); then, with the user's approval, publish over the air (no native change: `expo-asset` and `expo-file-system` are already in the binary).
  - **What it solves:** Ships the feature and keeps the contracts true.
  - **Expected result:** `pnpm check:dox`, `pnpm typecheck`, `pnpm lint` and `pnpm test:tz` green; a numbered production update.

## Bugs

### Low

- [ ] The Chok evening reminder swings far north
  - **What it is:** The evening reminder is alot + 945 min, which in Jerusalem, Tel Aviv and Los Angeles lands 19:50–21:40 and never inside an erev window, but north of about 40° it swings (London 17:03–22:00) and fires before candle lighting on summer erev days (New York 10, Paris 17, London 19 a year). A reminder anchored on tzeit or a clock time needs a new `Reminder.anchor` kind across the registry, the scheduler, the reminder editor and their tests. Hidden while Chok content is not shipped.
  - **What it solves:** Sensible evening reminders for users in northern cities.
  - **Expected result:** A new anchor kind with dated tests in at least London and New York, and the Chok evening reminder moved onto it.

- [ ] Completions and notification ids are keyed by civil date, not halachic day
  - **What it is:** [AUDIT.md](AUDIT.md) §2.11 and the completion-key half of §2.8, left open deliberately: completions and notification identifiers key off the device's civil date (`dateKey()`), so a window that crosses midnight (maariv, the Omer, Chok LeYisrael, a custom mitzvah set across midnight) is filed under a calendar day rather than its halachic day. Changing the key format rewrites every stored completion and invalidates every scheduled id, so it needs a store migration (`STORE_VERSION` plus a `migrate` step in [persistOptions.ts](src/stores/persistOptions.ts)) and a `SCHEDULE_FORMAT` raise, not an edit. The midnight-to-alot open question below is its visible edge.
  - **What it solves:** One day key for a mitzvah on every surface, whatever the clock time of the mark.
  - **Expected result:** A `halachicDateKey(instant, location)` for completions with `dateKey` kept for UI grouping, a migration that rewrites stored keys, and dated tests under `pnpm test:tz`.

## Open Questions

- **Single-word corrections to a pinned translation**
  - **Question:** May the "no authored translation" rule allow a single-word fix where the pinned translation is wrong rather than typo'd ("peace" for "לחן")?
  - **Assumption:** No. Three passages keep their source English: Ashkenaz `tefilat_haderech` renders "לחן ולחסד ולרחמים" as "peace, kindness, and mercy" (Community translation); Chabad mincha's Ten Days "מי כמוך" adds "kindness" ("for a life of kindness" for "לחיים ברחמים"); Edot `tefilat_haderech` has no English for "ותשלח ברכה במעשה ידינו".
  - **What I did:** Left all three as printed. Per case the options are an `enEdits` word fix justified as typo-class (precedent: "fill the verse" → "fill the universe"), a different pinned source for that leaf, or accepting it.
  - **What it affects:** The English of those three passages, and whether the rule in [scripts/siddur/AGENTS.md](scripts/siddur/AGENTS.md) gains a wrong-word exception.
  - **Why it is not a structural change:** Each case is one entry in [scripts/siddur/manifest.js](scripts/siddur/manifest.js) and a rebuild; done when each is fixed with a pinned test or recorded as accepted in [scripts/siddur/AGENTS.md](scripts/siddur/AGENTS.md).

- **Home between midnight and alot**
  - **Question:** Between midnight and alot, should home's current card follow a window still open from the previous day, for every mitzvah?
  - **Assumption:** No. Home turns to the new civil day at midnight, so it shows the new day's Chok LeYisrael as coming up, as it already does for maariv and the Omer, while the reader opened without a date still shows and marks the previous learning day.
  - **What I did:** Shipped the Chok reader on the learning day (alot to alot) and left home on the civil day.
  - **What it affects:** Home between 00:00 and alot for every night-window mitzvah, and, since 2026-10-12, for a custom mitzvah set across midnight (22:00–01:00): after midnight home shows its next window as coming up, so yesterday's still-open window can be marked only from its notification's done button. Its reminders after midnight do fire: the scheduler plans the day before the horizon too.
  - **Why it is not a structural change:** A display rule in [src/hooks/useDayModel.ts](src/hooks/useDayModel.ts); completion keys stay as they are, so flipping it rewrites no stored data. The key format itself is the civil-date bug above.

- **The remaining Chok LeYisrael defaults**
  - **Question:** Are the four defaults taken without a user decision right?
  - **Assumption:** Israel versus abroad follows `inIsrael`; the haftarah is the Sephardi one for Edot HaMizrach and the Ashkenazi one for the other nuschaot (`HAFTARAH_VARIANT`); the Thursday-night slot is readable but not tracked on its own; Friday of a Vezot Haberakhah week has no portion.
  - **What I did:** Shipped all four, hidden with the feature, in [src/utils/chok.ts](src/utils/chok.ts).
  - **What it affects:** Which portion and haftarah a reader sees, and whether Thursday night has its own "סיימתי" and streak entry.
  - **Why it is not a structural change:** Each lives in one named place in [src/utils/chok.ts](src/utils/chok.ts), and the assets carry both haftarah variants and every slot, so a flip is a code change plus a dated test; each confirmed default is then recorded in [scripts/chok/AGENTS.md](scripts/chok/AGENTS.md).

- **Where the tallit katan blessing lives**
  - **Question:** Is a fold at the top of the standalone `tefillin` text the right home for the tallit katan blessing?
  - **Assumption:** Yes, since `tzitzit` was removed on 2026-10-11; Shacharit's tallit and tefillin section leaves the tallit katan out.
  - **What I did:** Built it so in every nusach; [scripts/siddur/AGENTS.md](scripts/siddur/AGENTS.md) lists it as pending the user's review.
  - **What it affects:** Where a reader finds the tallit katan blessing.
  - **Why it is not a structural change:** One spec in [scripts/siddur/manifest.js](scripts/siddur/manifest.js) and a rebuild; no stored data.

- **The Chabad passage before marital relations**
  - **Question:** Should the Chabad bedtime-Shema passage before marital relations be hidden from single users, now that the profile records marital status?
  - **Assumption:** No. It stays folded for every reader.
  - **What I did:** Folded it for every reader ([scripts/siddur/AGENTS.md](scripts/siddur/AGENTS.md), Bedtime Shema review item).
  - **What it affects:** The Chabad Kriat Shema al Hamita for users whose `maritalStatus` is `single` or unanswered.
  - **Why it is not a structural change:** A reader condition beside `prayerMode`'s minyan fold plus one manifest tag; `maritalStatus` is already persisted in `useUserStore`.

## Other Open Items

- **iOS has never been built.** `eas build:list --platform ios` returns no builds (checked 2026-10-12). `pnpm build:ios:production` needs the user's interactive Apple login, then `pnpm submit:ios` (it prompts for the Apple account and target app each run) and the App Store listing from [release/](release). Until then every iOS-only path is unverified: the auto-scroll's animated `contentOffset` path in [src/app/siddur/[id].tsx](<src/app/siddur/[id].tsx>), Face ID in the taharah lock, the 64-pending notification cap, and the keyboard lift of the time-picker sheet ([TimeField](src/components/TimeField.tsx)) on a small iPhone when its typing field is tapped.
- **No Sentry account yet** (the user's call, 2026-10-09), so crash reporting stays off: `organization` and `project` of the `@sentry/react-native/expo` entry in [app.json](app.json) are placeholders, no `EXPO_PUBLIC_SENTRY_DSN` is set, and every profile in [eas.json](eas.json) sets `SENTRY_DISABLE_AUTO_UPLOAD`. To close: open the account, set the DSN (Metro inlines it, so it ships over the air), add `SENTRY_AUTH_TOKEN` as an EAS secret, fill `organization` / `project` (native config, so the next build), and drop the two production `env` lines.
- **Rav review of the taharah rules.** [docs/taharah-review.html](docs/taharah-review.html) holds 14 "לאימות" items awaiting a rav's answers; the rule table ships as initial. Each correction comes back as one preset edit in [src/data/taharahPresets.ts](src/data/taharahPresets.ts) that raises `TAHARAH_RULES_VERSION` and edits the same cell of the page.
- **Halachic review of the siddur texts.** The open items are listed in [scripts/siddur/AGENTS.md](scripts/siddur/AGENTS.md) (Work Guidance): meals, bedtime Shema, sights and food, Kiddush Levana, Sheva Berachot, Chanukah, and Shacharit's tallit and tefillin section. The tallit katan and Chabad questions above are the two that wait on the user rather than a rav.
- **Taharah device checks are not recorded.** The biometric lock, the `expo-secure-store` key and the headless `MARK_DONE` of a bedika were built and tested in Jest only (2026-10-08); no device run is recorded since.
- **Merged local branches.** Seven local branches are fully merged into `main`. Five are checked out nowhere and wait only for the user to run `git branch -d fix/audit-remediation hok-leisrael master reduce-apk-size refactor` (the agent's own run was refused by the auto-mode classifier on 2026-10-12; `fix/audit-remediation` stays on `origin`). The other two, `claude/adoring-agnesi-250cfe` and `claude/magical-wozniak-a1d944`, are checked out in clean worktrees under [.claude/](.claude) that belong to two inactive desktop sessions ("Fix vacuous scheduler test 6.6", "Fix the no-op timezone test matrix…"): archive or delete those sessions, let Settings › Storage clean up their worktrees, then delete the two branches.

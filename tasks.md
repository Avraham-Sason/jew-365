# Tasks

Open items first, by priority; completed work stays below for the record. Standing rules: no commit or OTA without per-action approval; every siddur text ships for all four nuschaot or not at all; English under a Hebrew segment is the pinned source's translation of exactly that segment (`scripts/siddur/AGENTS.md`, Local Contracts).

Leftovers of the 2026-10-11 English alignment round (commit 1d6a37f, update 1.0.18-7) were recorded on 2026-10-11.

## High Priority — Chok LeYisrael and the "More" tab (branch `hok-leisrael`)

User decisions of 2026-10-11: the schedule tab becomes "עוד" / "More", a hub holding the schedule and Chok LeYisrael; the text is the complete "חוק לישראל השלם" of raktora.50webs.com, used only with its owner's written permission; Chok LeYisrael is a mitzvah in the library under the `learning` category, off by default (reminders, "סיימתי", history, streak, weekly report); Rashi and Bartenura are included, folded closed by default; Hebrew only; the permission request says only that the app has no ads.

Day rules, decided 2026-10-11 after research: a week takes the parasha of its Shabbat; a week whose Shabbat is a festival follows hebcal's `findParshaHaShavua()` rule (`@hebcal/leyning`; written in `src/utils/chok.ts`, not copied, so no licence notice is owed): a Shabbat on 3–22 Tishrei in Israel or 3–23 abroad gives Vezot Haberacha, any other festival Shabbat gives the next parasha read. Nothing is learned on Yom Tov itself (Ben Ish Chai, year 2, Lech Lecha 9; Kaf HaChaim 132:7); Chol HaMoed is learned. In a double week the user chooses the first parasha, the second or both: a reader control with the three options, asked once through a sheet and remembered for later double weeks (the Chida learned the first only; no source found for both). Days of the current week that were missed, Yom Tov days included, show as closed make-up folds at the top of the reader before today's portion (the Ari via Kaf HaChaim 132:6: a missed day is made up the next day, before that day's portion).

Findings of 2026-10-11: no openly licensed complete Chok LeYisrael exists (none on Sefaria or in Otzaria; Hebrew Wikisource has 3 complete weeks of bare references). raktora has all 54 parashiyot fully vocalized, one windows-1255 page per parasha (`hokleisrael/<name>.htm`), machine-marked: `<!--It=…,c=,p=-->` Torah, `Io` Onkelos, `Ir` Rashi, `In` Nevi'im, `Ip` Rashi on Nevi'im, `Ik` Ketuvim, `Ih` the Friday haftarah (Sephardi and Ashkenazi variants where they differ), each closed by `<!--ep-->`; Mishnah with Bartenura, Gemara, Zohar, halacha and mussar are plain HTML under per-day anchors. Seven slots per parasha (Sunday to Thursday, Thursday night, Friday; Vezot Haberacha has no Friday). About 300–340 KB of text per parasha, ~17 MB for the whole work.

Hard rule until the permission arrives in writing: the repository is public, so no Chok text (source cache or generated asset) is committed, and nothing that carries it ships. Parser tests run on a synthetic fixture. A local full build (`pnpm chok:build`) is allowed for validation and previews; `pnpm chok:build --empty` restores the committed empty map before anything is committed, published or built.

- [ ] Obtain written permission from the raktora owner
  **What it is:** Send the permission request (drafted in Hebrew, ready to send) to raktora@walla.co.il and keep the written reply.
  **What it solves:** The site is marked "כל הזכויות שמורות"; the app may not bundle its text without permission.
  **Expected result:** A written yes that covers bundling the full text in the free app with credit, stored with the release records; or a no, which sends the content back to the user's source decision.

- [ ] Confirm the remaining defaults
  **What it is:** Defaults taken without a user decision, to confirm or flip: Israel versus abroad follows `inIsrael`; the haftarah variant is the Sephardi one for Edot HaMizrach and the Ashkenazi one for the other nuschaot; the Thursday-night slot is readable but not tracked on its own; Friday of a Vezot Haberacha week has no portion.
  **What it solves:** Each is a reversible default living in one named place.
  **Expected result:** Each recorded in the chok AGENTS.md and pinned by a dated test.

- [x] Turn the schedule tab into the "More" hub (commit 3a3f3b2, 2026-10-11; the same pass fixed the month grid that wrapped after six cells, the badge over two-digit dates, the full-height week cards, and drew every chevron as the `chevronLeft` / `chevronRight` icon, because the `‹` glyph mirrors in Hebrew and pointed back)
  **What it is:** `src/app/(tabs)/schedule.tsx` moves to the stack route `src/app/schedule.tsx` (`ScreenHeader` with back, its segmented control and arrows in the header body). A new `src/app/(tabs)/more.tsx` takes the tab's place (home stays third) with a `NavBar` and one bordered card of `ListRow`s: the schedule and Chok LeYisrael (caption: today's parasha and slot). `BottomTabs` swaps `schedule` for `more` with its own icon; `calendar` and `chok` join `ICON_NAMES`; `nav.more` and the row copy go into both dictionaries.
  **What it solves:** Room for Chok LeYisrael and later additions without a sixth tab.
  **Expected result:** `routes.test.ts`, `designSystem.test.ts` and the i18n parity suite pass; the hub and the schedule render at 360 and 375 widths in both languages on the web preview; the day drilldown from the schedule still opens `/day/[date]`.

- [x] Build the Chok LeYisrael assets from the pinned raktora pages (built 2026-10-11, local only: 54 assets, 18.56 MB raw, 4.62 MB gzipped; the committed map stays empty until the permission; the delivery choice moves to the release task)
  **What it is:** `scripts/chok/` with its own AGENTS.md: fetch each of the 54 pages once into a gitignored cache, decode windows-1255, parse by the markup codes and day anchors into the reader's section/segment shape (Torah verse with its Onkelos, Rashi and Rashi on Nevi'im and Bartenura as closed folds, haftarah per variant), NFC-normalize, and write `assets/chok/<parasha>.chok` plus `src/data/chokAssets.generated.ts`. The build fails on a missing slot, a verse count that breaks the 6/4/5/6/5/26/rest rule, an empty section or a second run that changes a file.
  **What it solves:** The content, reproducibly, from one pinned source with its credit and dedication.
  **Expected result:** 54 × 7 slots (6 for Vezot Haberacha) built; parser tests green on a synthetic fixture; total size measured and the delivery chosen (plain, or gzip with a pure-JS inflate so it still ships over the air).

- [x] Resolve the portion for a day (commit 3a3f3b2, 2026-10-11)
  **What it is:** Pure `chokParashiyot()`, `chokPortionAt()`, `chokPortionOn()` and `chokMakeUpsBefore()` in `src/utils/chok.ts` over hebcal `getSedra(year, inIsrael).lookup()`: the learning day runs alot to alot, Thursday from nightfall is the Thursday-night slot, motzaei Shabbat is the next parasha's Sunday, plus the rules decided above (festival rule written after hebcal's, not copied).
  **What it solves:** One answer for the reader, the hub caption, the mitzvah window and the notification.
  **Expected result:** Dated tests for an ordinary, a double, a festival and a diverging Israel/abroad week, green under `pnpm test:tz`.

- [x] Read Chok LeYisrael in the siddur reader (built and verified 2026-10-11 against a local full build; the day row is a header-tone SegmentedControl because seven ChipRow pills do not fit 320 points in English; Rashi on every book, Bartenura and the Zohar's Hebrew translation fold closed; the Targum of the prophets shows beside Onkelos)
  **What it is:** A third text kind in `/siddur/[id]` (`chok_leyisrael` with `date`), loaded per parasha; `SiddurText.nusach` becomes optional; the subtitle names the parasha and slot; a slot row (`ChipRow`: א׳ ב׳ ג׳ ד׳ ה׳ ליל ו׳ ו׳) switches within the week; the section picker lists Torah, Nevi'im, Ketuvim, Mishnah, Gemara, Zohar, halacha and mussar; credits show the source and its dedication.
  **What it solves:** Text size, auto-scroll, the picker, keep-awake and "סיימתי" come from the existing reader instead of a second copy.
  **Expected result:** Every slot of three sample parashiyot opens, folds start closed, the toolbar still fits one line at 360 points.

- [ ] Add Chok LeYisrael as a learning mitzvah
  **What it is:** A `chok_leyisrael` registry entry, category `learning`, off by default, with its window, default reminder, `skipOn` (Shabbat, Yom Tov) and `hasSiddurText()` support, so the reminder offers "open text", home, history, the streak, the check-in and the weekly report follow it; the store `merge` brings it to existing installs; "סיימתי" in the reader; and the make-up folds at the top of the reader for this week's missed days (`chokMakeUpsBefore()` minus the marked ones, Yom Tov days included), shown only while the mitzvah is on. Hidden with the rest of the feature while `hasChokContent()` is false.
  **What it solves:** Tracking and reminders through the machinery every mitzvah already uses.
  **Expected result:** The mitzvah suites, the scheduler and response-handler suites and `pnpm test:tz -- src/data` pass; enabling it in the library schedules its reminder.

- [ ] DOX, store copy and release
  **What it is:** Update the AGENTS.md chain (root source map, app, tabs, components, data, siddur reader, new chok build), the store copy in `release/` and `docs/index.html`; with the permission in hand: set `DEDICATION` if the owner wants it, drop or keep the Zohar's Hebrew translation per the owner's answer about its source, choose the delivery (18.56 MB raw against 4.62 MB gzipped; check whether EAS Update serves assets compressed, else gzip the assets and inflate in JS), remove `assets/chok/` from `.gitignore`, commit the full build; then, with the user's approval, publish over the air (no native change: `expo-asset` and `expo-file-system` are already in the binary).
  **What it solves:** Keeps the contracts true and ships the feature.
  **Expected result:** `pnpm check:dox`, `pnpm typecheck`, `pnpm lint` and `pnpm test:tz` green; a numbered production update.

## Medium Priority
- [ ] Add "affects X" indicators to the custom-mitzvah settings
  **What it is:** On `src/app/custom-mitzvah.tsx`, next to each setting that already carries an explanation (skip on Shabbat / Yom Tov, active days, reminders, rich content), add a small visual indicator naming the surface the setting changes: the schedule, the notification, the reader, history. Reuse an existing shared component (`ChipRow` or a caption variant); no new one-off styling.
  **What it solves:** Item 5 of the custom-mitzvah rework of 2026-10-11 asked for an explanation *and* a visual indicator per setting; the completeness check marked it partial because only the explanations shipped.
  **Expected result:** Every explained setting shows its indicator in Hebrew and English at 360 and 375 widths without wrapping into a third line; `designSystem.test.ts` stays green.

- [ ] Fold the Sefard sustenance prayer inside Shema Koleinu
  **What it is:** In `sefardShacharit()`, `sefardMincha()` and `sefardMaariv()` (`scripts/siddur/manifest.js`), put the "אתה הוא יהוה האלהים הזן ומפרנס" prayer and its instruction under a `SOME_SAY` label (a new label, "יש מוסיפים תפילה על הפרנסה" / "Some add a prayer for sustenance"), while the chatimah "כי אתה שומע תפלת כל פה" stays outside the fold with the English the alignment round moved onto it. Check the three services: in shacharit the chatimah shares the prayer's source segment (cut it with `optionalParts` + `until`), in mincha and maariv it has its own segment.
  **What it solves:** The source prints "One may add the following prayer", which the project's fold rule ("יש נוהגים / יש אומרים / מי שרוצה") covers, yet the prayer shows open to every reader.
  **Expected result:** `pnpm siddur:build` passes twice with no diff; a dated case in `src/data/__tests__/siddur.test.ts` shows the fold label on the three Sefard services and the chatimah visible outside it with its English.

## Low Priority
- [ ] Decide the three aligned-but-inaccurate translations
  **What it is:** Three places where the English sits under the right Hebrew but renders it wrongly or incompletely, left alone because the policy forbids writing a translation: Ashkenaz `tefilat_haderech` renders "לחן ולחסד ולרחמים" as "peace, kindness, and mercy" (Community translation); Chabad mincha's Ten Days "מי כמוך" adds "kindness" ("for a life of kindness" for "לחיים ברחמים"); Edot `tefilat_haderech` has no English for "ותשלח ברכה במעשה ידינו". Options per case: an `enEdits` word fix justified as a typo-class correction (precedent: "fill the verse" → "fill the universe"), a different pinned source for that leaf, or leaving it.
  **What it solves:** Closes the last items the alignment audit surfaced without widening the "no authored translation" rule silently.
  **Expected result:** Each of the three is either fixed in the manifest with a pinned test or recorded as accepted in `scripts/siddur/AGENTS.md`; the user's decision is noted on the task.

- [ ] Let an edit reach memory-filled English (Edot maariv half-Kaddish note)
  **What it is:** The Edot maariv instruction "ואומר החזן חצי קדיש" has no source English; the translation memory filled it from Ashkenaz's post-Yishtabach note, whose tail says this Kaddish closes Pesukei Dezimrah. The alignment round dropped it (`enDrop`) because `enEdits` only run on source English. Add a build mechanism in `scripts/siddur/build.js` for English that arrives through `fillTranslations()` (either `enEdits` entries flagged `memory: true` applied after the fill, or a per-segment `enMemory: false` plus an explicit `en` on the spec taken verbatim from a named source segment), document it in `scripts/siddur/AGENTS.md`, then restore the one sentence "The Half-Kaddish is recited by the Chazzan." on that segment.
  **What it solves:** The note is Hebrew-only for English readers today; the general gap is that no manifest mechanism can correct or trim a memory fill.
  **Expected result:** The build fails on a memory edit that does not match exactly once; the Edot maariv dump shows the one-sentence English; the "English stays aligned" test keeps `/in this case, the Pesukei Dezimrah/` out of every maariv text.

## Open Questions
- Should the "no authored translation" rule allow single-word corrections where the pinned translation is wrong rather than typo'd ("peace" for "לחן")? The three cases above wait on this.

## Completed

### Standalone siddur catalog (2026-10-08 plan, shipped on 1.0.18)
Texts not tied to a mitzvah or a notification, read through the existing nusach reader. Decisions of 2026-10-08: entry from a home shortcut and the library header, no sixth tab; Retzei / VeHachalitzenu and the Yom Tov Yaaleh Veyavo are never shown.

- [x] Split `SiddurTextId` into mitzvah and standalone ids
- [x] Add the standalone text registry to `src/data/siddur.ts`
- [x] Expose the Hebrew day in effect at an instant from `HebcalService`
- [x] Decouple the reader route from the mitzvah
- [x] Add the catalog screen (now the siddur tab, `src/app/(tabs)/siddur.tsx`)
- [x] Add the home shortcut and the library header button
- [x] Add i18n keys for the catalog
- [x] Add the new day flags for yesterday's inserts
- [x] Manifest: Birkat Hamazon for all four nuschaot
- [x] Manifest: Al Hamichya and Borei Nefashot for all four nuschaot
- [x] Manifest: Tefilat Haderech for all four nuschaot
- [x] Add `pnpm siddur:build` output and the generated map
- [x] Tests for the reader decoupling and the catalog
- [x] DOX pass for M1
- [x] M2: Kriat Shema al Hamita, Asher Yatzar, birchot hanehenin and birchot hare'iya
- [x] Fold yesterday's inserts in Birkat Hamazon and Al Hamichya
- [x] Halachic review list for the standalone texts
- [x] M3: Kiddush Levana, mezuzah blessing, Sheva Berachot, Chanukah candles
- [x] Publish M1–M3 over the air (shipped in the 1.0.18 production updates; Tikkun HaKlali joined on 1.0.18-5)

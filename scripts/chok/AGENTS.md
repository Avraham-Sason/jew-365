# AGENTS.md

## Purpose

- Own the build from the Torat Emet text of "חק לישראל" to the downloadable Chok LeYisrael add-on in [../../docs/chok/](../../docs/chok): one content-addressed JSON file per parasha, a manifest and a license note, published by GitHub Pages and assembled by the reader by day.

## Ownership

- [source/](source) holds the Torat Emet files the build reads, committed so every build is reproducible: the five nikud files y_hok10.txt to y_hok50.txt and [source/License.txt](source/License.txt), windows-1255 with CRLF lines, kept byte-exact by the -text -diff rule in [../../.gitattributes](../../.gitattributes). The te'amim files y_hok11.txt to y_hok51.txt stay local only, gitignored; the build needs them only with `TEAMIM` on and says so when they are absent.
- [manifest.js](manifest.js) owns what the build expects of the source and what it publishes:
  - `TEAMIM` (false) picks the nikud or the te'amim files, `SOURCE_DIR` is the source folder and `sourceFiles(teamim)` lists the five names (`y_hok<n>0.txt`, or `y_hok<n>1.txt` with te'amim).
  - `PARASHIYOT` lists the 54 parashiyot in order, each hebcal name (`parasha`) with its source heading (`heading`, the text after `# פרשת `).
  - `CREDIT` (in every asset), `MANIFEST_CREDIT` (Hebrew and English, in the manifest and the license note), `LICENSE` and `DEDICATION` (`null` until the owner of the text agrees to one) are the one place for the credit and the license.
  - `SITE_DIR` is the output folder; `assetSlug()` is the hebcal name lowercased with each run of other characters one hyphen, and `assetFileName(parasha, sha8)` is `<slug>.<sha8>.json`.
  - The structure [validate.js](validate.js) checks: `VERSE_COUNTS`, `VERSE_COUNT_EXCEPTIONS`, `HAFTARAH_VARIANT_PARASHIYOT`, `NO_HAFTARAH_PARASHIYOT` and `TORAH_ENDS_THURSDAY_NIGHT` (Vezot Haberakhah included: a Friday of Mishnah to Mussar and a Thursday night of Torah and haftarah only).
- [parse.js](parse.js) reads one source file into parashiyot, each a set of slots, each slot a list of sections (`kind`, the printed heading, an optional haftarah `variant`, and segments in the reader's `SiddurSegment` shape, with a `verse` mark the build strips):
  - `decodeSource()` decodes windows-1255 and normalizes to NFC.
  - The first line of a file is a header of `&Key=value` fields (`parseHeader()`). Its `CosmeticsType` holds the display macros, or `=<UniqueId>` to use another file's (`sourceRules()`). Every `rep` part is a list of `from=to` pairs split on `^^` (`macroRules()`, a pair without `=` fails the build), applied in order to each line by `expandLine()`, which then turns `<QM>` into `?` and `_nbsp;` and a bare `&nbsp` into `&nbsp;`. A macro whose replacement draws a background colour is a commentary badge (`badgeMacros()`).
  - Lines (`parseBook()`): `#` opens a book heading, either `# פרשת <name>` or the skipped `# הקדמות` (the intro, ignored until the next `#`); `@` opens a day, named by one of `יום ראשון` to `יום חמישי` (the spelling `יום שלשי` included), `ליל שישי` or `יום שישי`, and starts its Torah section; `~` opens a section whose heading's first words give its kind (נביאים, כתובים, משנה, גמרא, זוהר, הלכה פסוקה, מוסר, הפטרת); `$ ` and `**` lines are ignored; any other non-blank line before a parasha's first day fails the build. Every other line is a paragraph: its expansion plus a `<br>`. A day may have no Torah section (the Friday haftarah days), and a Torah section with no code is dropped.
  - The source's codes mark the verse texts (`It` Torah, `In` Nevi'im, `Ik` Ketuvim, `Ih` haftarah) and Onkelos (`Io`), each closed by `<!--ep-->`. A commentary starts at its badge (a small רש''י, ברטנורה or תרגום הזוהר on a background colour) and runs to the close of the span around the badge, or on into the next span of the same style while its code is still open; it becomes a segment folded under רש״י / Rashi, ברטנורה / Bartenura or תרגום הזוהר / Zohar translation. Attribute values may be quoted with `'` or `"`.
  - A verse section has one segment per verse: its number as a note run (with the chapter before verse 1 of a new chapter), the verse, and as a second paragraph its targum in the run style `t`: Onkelos up to its own closing code, or the uncoded Targum of the prophets up to the verse's commentary; the haftarah has none. The printed numbers are dropped. Small print and anything on a background colour (aliyah markers) are note runs, bold is `b`.
  - Repairs that apply wherever the defect occurs: a closing code with no text since the last code is dropped; a Torah verse without its opening code gets one after its printed number when its Onkelos code names it; a code never closed ends at the close of its span; a lone letter left before a targum that lacks it moves into that targum; a verse opened twice keeps the text after the last opening and the rest as a note.
  - Text before a section's first verse and text after a verse's commentary are note segments in place. Mishnah, Gemara, Zohar, halacha and mussar are plain text cut into segments at their commentaries, with paragraphs at `<br>`. `''` and `"` between Hebrew letters become ״.
  - `parseBook()` also counts the badge macros in a parasha's raw lines, so the validator can compare them with the commentaries it parsed.
- [validate.js](validate.js) owns `validateParasha(parasha, slots, badges)`, whose problems fail the build: slots other than all seven; a slot's sections other than `expectedKinds()`; a repeated heading; a Torah slot whose verse count is not 6/4/5/6/5 for Sunday to Thursday and 26 for Thursday night outside `VERSE_COUNT_EXCEPTIONS`; a Torah verse that does not follow the one before it across the week; a prophets or writings chapter that skips a verse; a haftarah or chapter without verses; an empty section, paragraph or run; a segment without Hebrew; an unknown label; and a commentary count that differs from the badge count of the source.
- [build.js](build.js) (`pnpm chok:build`):
  - `readSources()` reads and decodes the five files, naming every missing one; `readParashiyot()` parses them, checks the 54 headings against `PARASHIYOT` in order and validates each parasha.
  - `buildOutputs()` returns every output: each asset is the JSON of `{ parasha, credit, dedication, slots }` without the verse marks, named by the first eight hex digits of its sha-256; then [../../docs/chok/LICENSE.txt](../../docs/chok/LICENSE.txt) (`licenseText()`); then the manifest, last, with `format`, `version`, the credits, the license, the total `bytes` and per parasha its `path`, `sha256` and `bytes`. `nextContentVersion()` keeps the previous version while every hash is unchanged and raises it by one otherwise.
  - The build runs twice and fails when the runs differ, writes only changed files (assets, license, manifest last), deletes every other JSON file in the output folder, and prints the file count with their raw and gzipped size and the content version, then how many files it wrote.
- Tests live in [__tests__/](__tests__/): [parse.test.js](__tests__/parse.test.js) on [fixture.txt](__tests__/fixture.txt), a synthetic book in our own placeholder words that reproduces each case above, [validate.test.js](__tests__/validate.test.js), [manifest.test.js](__tests__/manifest.test.js) and [build.test.js](__tests__/build.test.js).

## Local Contracts

- The source is the Torat Emet database under CC BY-NC-SA 2.5, credited exactly as `MANIFEST_CREDIT`.
- The files in [../../docs/chok/](../../docs/chok) are a processed version published under the same license, which [../../docs/chok/LICENSE.txt](../../docs/chok/LICENSE.txt) states. Every surface that shows the text shows the credit and the license.
- The source files come from the Torat Emet installer InstallToratEmet.exe (toratemetfreeware.com, served with Last-Modified 2025-06-30), where they sit in one folder per book under Books\001_TORA, unpacked with 7-Zip, and are never edited by hand: a defect is fixed by a rule in [parse.js](parse.js) or [validate.js](validate.js), never in a source file. To refresh: download the installer, unpack it with 7-Zip, copy the y_hok files and License.txt over [source/](source), run `pnpm chok:build` and `pnpm test -- scripts/chok`, and commit the source and [../../docs/chok/](../../docs/chok) together; the manifest version rises on its own when any output changes.
- "Local only" applies to the te'amim files alone. No fixture or test carries source text.
- Every output is generated and never hand-edited. Names are content-addressed so a cached manifest never points at a changed file. The manifest is written last, and its `version` rises only when a file's hash changes.
- A repair is a rule over the markup; a new defect must fail the build. Never widen a rule until it passes silently.
- Every slot and both haftarah variants are kept, the Friday of Vezot Haberakhah included. What the reader shows is decided in [../../src/utils/AGENTS.md](../../src/utils/AGENTS.md).
- `TEAMIM` selects the cantillation files, whose `<TF>` encoding has no decoder, so the build fails on it.
- Source gaps kept as printed:
  - Tetzaveh has no haftarah.
  - The Vaera haftarah is Ezekiel 28:25-26 only.
  - The Vezot Haberakhah haftarah is Joshua 1:1-7.
  - The Zohar of Shemot's Thursday has no Hebrew translation.
  - Pinchas: "ויהי אחרי המגפה" opens 26:1, so Monday has 4 verses.

## Work Guidance

- Read the failing file through the error: it names the file, parasha, slot, heading and verse.

## Verification

- `pnpm test -- scripts/chok` after any change here; it also parses the committed source and checks that [../../docs/chok/](../../docs/chok) is what the build produces.
- `pnpm chok:build` passes, and a second run prints `wrote 0 files`.

## Child DOX Index

- No child AGENTS.md files.

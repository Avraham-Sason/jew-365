# AGENTS.md

## Purpose

- Own the build that turns the 54 pages of "חוק לישראל השלם" on raktora.50webs.com into the bundled Chok LeYisrael assets, one per parasha, that the reader assembles by day.

## Ownership

- [manifest.js](manifest.js) owns the source list and what the build expects of it: `PAGES` (each hebcal parasha name with its raktora file name, in hebcal's order with Vezot Haberakhah last; a page's address is `pageUrl(file)`), `CREDIT` and `DEDICATION` (the one place for the source's credit and its dedication line; `DEDICATION` stays `null` until the owner agrees to it), `assetFileName()` (the hebcal name lowercased, each run of other characters one hyphen, plus `.chok`), `REPAIRS` (per page, the empty opening codes to ignore, `strayOpenings`, and the verses without a targum, `noTargum`) and the structure [validate.js](validate.js) checks: `VERSE_COUNTS`, `VERSE_COUNT_EXCEPTIONS`, `HAFTARAH_VARIANT_PARASHIYOT`, `NO_HAFTARAH_PARASHIYOT` and `TORAH_ENDS_THURSDAY_NIGHT`.
- [parse.js](parse.js) reads one page: `decodePage()` decodes windows-1255 and normalizes to NFC, and `parsePage(html, repairs, where)` returns its slots, each a list of sections (`kind`, the printed heading, an optional haftarah `variant`, and segments in the reader's `SiddurSegment` shape, with a `verse` mark the build strips). Its rules come from a survey of all 54 pages on 2026-10-11:
  - A day starts at the link whose `name` is a day (`יום ראשון` to `יום חמישי`, the spelling `יום שלשי` included, `ליל שישי`, `יום שישי`) and ends at the next; the last ends at the close of the content cell. The day's Torah section starts at the anchor itself; every other section starts at a heading link whose `href` ends with `!`, and the `href` is its heading. A link that repeats a day anchor's `href`, ends in "תורה" or is a `#NOTE:` editor icon belongs to a heading. A heading's kind comes from its first words (נביאים, כתובים, משנה, גמרא, זוהר, הלכה פסוקה, מוסר, הפטרת); any other heading fails the build, and כמנהג הספרדים or כמנהג האשכנזים in a haftarah heading is its variant.
  - The source's codes mark the verse texts (`It` Torah, `In` Nevi'im, `Ik` Ketuvim, `Ih` haftarah) and Onkelos (`Io`), each closed by `<!--ep-->`. A commentary starts at its badge (a small רש''י, ברטנורה or תרגום הזוהר on a background colour) and runs to the close of the span around the badge, or on into the next span of the same style while its code is still open; it becomes a segment folded under רש״י / Rashi, ברטנורה / Bartenura or תרגום הזוהר / Zohar translation.
  - A verse section has one segment per verse: its number as a note run (with the chapter before verse 1 of a new chapter), the verse, and as a second paragraph its targum in the run style `t`: Onkelos up to its own closing code, or the uncoded Targum of the prophets up to the verse's commentary; the haftarah has none. The printed numbers are dropped. Small print and anything on a background colour (aliyah markers) are note runs, bold is `b`.
  - Repairs that apply wherever the defect occurs: a closing code with no text since the last code is dropped; a Torah verse without its opening code gets one after its printed number when its Onkelos code names it; a code never closed ends at the close of its span; a lone letter left before a targum that lacks it moves into that targum; a verse opened twice keeps the text after the last opening and the rest as a note. Two empty codes and one half verse are listed in `REPAIRS`.
  - Text before a section's first verse and text after a verse's commentary are note segments in place. Mishnah, Gemara, Zohar, halacha and mussar are plain text cut into segments at their commentaries, with paragraphs at `<br>` and `<p>`. `''` and `"` between Hebrew letters become ״.
- [validate.js](validate.js) owns `validateParasha(parasha, slots)`, whose problems fail the build: slots other than all seven (Vezot Haberakhah without Friday); a slot's sections other than `expectedKinds()`; a repeated heading; a Torah slot whose verse count is not 6/4/5/6/5 for Sunday to Thursday and 26 for Thursday night outside `VERSE_COUNT_EXCEPTIONS`; a Torah verse that does not follow the one before it across the week; a prophets or writings chapter that skips a verse; a haftarah or chapter without verses; an empty section, paragraph or run; a segment without Hebrew; an unknown label.
- [build.js](build.js) (`pnpm chok:build`) downloads each missing page once into a gitignored cache folder next to it, parses and validates all 54 twice and fails when the runs differ, writes one asset per parasha into the gitignored chok folder under the assets folder and [../../src/data/chokAssets.generated.ts](../../src/data/chokAssets.generated.ts), rewrites only changed files, deletes stale assets and prints the asset count with their raw and gzipped size. `pnpm chok:build --empty` writes the empty map and deletes the generated assets, needing neither the cache nor the network.
- Tests live in [__tests__/](__tests__/): [parse.test.js](__tests__/parse.test.js) on [fixture.html](__tests__/fixture.html), a synthetic page in our own placeholder words that reproduces each markup case above, [validate.test.js](__tests__/validate.test.js) and [manifest.test.js](__tests__/manifest.test.js).

## Local Contracts

- The raktora text is used only with its owner's written permission, which has not arrived, and the repository is public. Until it does, no raktora page, cached file or generated asset is committed or shipped: the cache and the generated assets stay in [../../.gitignore](../../.gitignore), the committed [../../src/data/chokAssets.generated.ts](../../src/data/chokAssets.generated.ts) is the empty map, which hides every Chok LeYisrael surface, and no fixture, test or manifest entry carries raktora text. A local full build is allowed for validation and previews; restore the empty map with `pnpm chok:build --empty` before anything is committed, and never run an EAS build while the map has entries; `pnpm update:*` refuses on its own while the map differs from the last commit.
- Both outputs are generated; never hand-edit an asset or the map.
- A repair is a rule over the markup or an entry in `REPAIRS`, never an edit carrying source text. A new defect must fail the build; never widen a rule until it passes silently.
- The build keeps both haftarah variants and every slot; the reader picks a variant (`HAFTARAH_VARIANT` in [../../src/utils/chok.ts](../../src/utils/chok.ts)). The four product decisions over what the build produces (Israel or abroad, the haftarah per nusach, Thursday night, the Friday of Vezot Haberakhah), each with its reason and where to flip it, are in [../../src/utils/AGENTS.md](../../src/utils/AGENTS.md) (Local Contracts).
- Source gaps kept as printed, to raise with the owner: Tetzaveh has no haftarah, the Vaera haftarah stops after Ezekiel 28:26, the Vezot Haberakhah haftarah has Joshua 1:1-7 only, and Rashi on Proverbs 20:18 (Vayakhel, Thursday) is cut short.

## Work Guidance

- Read the failing page through the error: it names the page, slot, heading and verse.

## Verification

- `pnpm test -- scripts/chok` after any change here.
- With the cache present, `pnpm chok:build` passes and a second run rewrites no file; then `pnpm chok:build --empty`.

## Child DOX Index

- No child AGENTS.md files.

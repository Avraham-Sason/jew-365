# AGENTS.md

## Purpose

- Own design handoff bundles and prototype materials used to guide production UI work.

## Ownership

- Child design bundles own their own source transcripts, prototypes, and implementation guidance.
- Production app code remains owned by [../src/AGENTS.md](../src/AGENTS.md).
- [stage1-previews/index.html](stage1-previews/index.html) is the self-contained stage 1 preview page (logo variants, icon styles, palettes and type scale) the product owner used to choose the earlier navy-and-gold direction, superseded by the 2026-10-21 redesign; it is source material, never imported by the app.
- [references/2026-10-21/](references/2026-10-21) holds the product owner's two references for the 2026 redesign, as received: [ui-mockup.webp](references/2026-10-21/ui-mockup.webp), the target look (cream background, light cards, peach icon tiles, orange accent, dark ink text; light headers on the page background and a floating tab bar). Its first phone is the history tab, and the "בית" label under it is a mistake. The other phones show the siddur tab, the reader with its controls row, settings with icon tiles, the day view's cards with a time-left bar, and the done list with its undo pill. [logo.jpg](references/2026-10-21/logo.jpg) is the chosen logo: a blue stopwatch ring with a crown and hour ticks, JEW over 365° in dark blue with an orange degree ring, and orange tefillin, tallit, Torah scroll and shofar in the ring's opening, between a check at its top end and a bell at its bottom end. Both are source material and are never imported by the app.
- [jew365-concepts/vector/index.html](jew365-concepts/vector/index.html) is the self-contained Jew 365 logo board, and every `mark-*.svg`, every `wordmark*.svg` and `mark-o-meta.json` beside it is generated with it by [jew365-concepts/vector/build.mjs](jew365-concepts/vector/build.mjs) (`node design/jew365-concepts/vector/build.mjs`, Node built-ins only; `pnpm logo:build` runs it and then the export). The lead marks (`openClockMark`) use bold rounded strokes (`T`, round caps) for JEW over °365 inside an open clock ring centered on the minimum enclosing circle of the ink. Mark `n` (י״ג) has a thin ring with seven ticks from 12 to 6, 365° centered under JEW (`link: false`) and four mitzvah symbols in the ring's opening (`MITZVOT_SYMBOLS`: tefillin, tallit, Torah scroll, shofar). The earlier rounds sit in a closed `details`.
- Mark `o` (י״ד, 2026-10-21) is the logo the product owner chose, drawn after [logo.jpg](references/2026-10-21/logo.jpg) and the one that ships. It reuses `n`'s letters and symbols in a styled ring (`styled: true`): a gradient ring (`BLUE_ORANGE.ring`, stops sampled from the reference along a 150° axis), a stopwatch crown at 12, ticks on the closed side whose ends keep 1.5 ring widths from the nearest letter outline, a check at the ring's top end and a bell at its bottom end (the ring stops at their pale outline through a `mask`), and a pale outline around every letter, the check and the bell (`HALO_GAP`, `HALO_LINE`, a transparent gap, so it works on any background). The tallit is `tallitShawl` (a folded scarf with stripes and fringe), the four symbols are outline-only, and `scaledMark()` sizes them and the check and bell from the ring radius to the reference's proportions. The palette `BLUE_ORANGE` keeps its on-dark values under `hero*`. Outputs: `mark-o.svg` and `mark-o-dark.svg` (the full mark, splash and in-app), `mark-o-icon.svg` (the launcher icon: open ring, crown, ticks, JEW 365° and the check and bell, no line symbols, no outline) with `mark-o-icon-mono.svg` (its single-colour twin for the Android monochrome layer), `mark-o-notif.svg` (the notification silhouette: a closed ring, a crown and 365), `wordmark-o.svg` and `wordmark-o-dark.svg` (JEW over 365°), `mark-o-mono.svg`, and `mark-o-meta.json` (each shape's centre, reach and box, read by the export). The board opens with an "י״ד" section: the mark beside the reference, then the icon and the silhouette through the checks below, and the wordmarks on cream and on night.
- The board's checks are silhouette, sizes, Android adaptive icon masks with the 66dp safe zone, notification icon and color worlds. [../scripts/logo/export.mjs](../scripts/logo/export.mjs) turns the generated SVGs into the app's PNG assets and [../src/components/logo.generated.ts](../src/components/logo.generated.ts). The board is source material and the app never imports it. Edit `build.mjs` and rerun it, never the generated files.

## Local Contracts

- Treat design files as source material, not production code.
- Do not modify production UI from a design bundle without also reading the applicable source-code DOX chain under [../src/AGENTS.md](../src/AGENTS.md).

## Work Guidance

- Keep design-specific rules in the closest bundle-level AGENTS.md.

## Verification


## Child DOX Index

- [handoff/AGENTS.md](handoff/AGENTS.md) - Claude Design handoff for the original UI direction.

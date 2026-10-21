# AGENTS.md

## Purpose

- Own static image assets referenced by [../app.json](../app.json), including app icons, splash, favicon, and notification artwork.

## Ownership

- [icon.png](icon.png), [adaptive-icon.png](adaptive-icon.png), [adaptive-monochrome.png](adaptive-monochrome.png), [splash.png](splash.png), [splash-dark.png](splash-dark.png), [favicon.png](favicon.png), and [notification-icon.png](notification-icon.png) are release-facing assets, all generated. The logo pipeline owns them: [../design/jew365-concepts/vector/build.mjs](../design/jew365-concepts/vector/build.mjs) draws mark `o` (the logo of 2026-10-21) and [../scripts/logo/export.mjs](../scripts/logo/export.mjs) turns its SVGs into these PNGs and into [../src/components/logo.generated.ts](../src/components/logo.generated.ts), which [AppLogo](../src/components/AppLogo.tsx) draws; `pnpm logo:build` runs both.
- [README.md](README.md) records every asset, its size and what it shows. They are native assets: a change reaches users only with the next build.
- [siddur/](siddur) holds the generated nusach texts, one JSON file per nusach and text. The build in [../scripts/siddur/AGENTS.md](../scripts/siddur/AGENTS.md) owns them; never edit them here.
- A chok folder beside siddur holds the generated Chok LeYisrael texts, built by [../scripts/chok/AGENTS.md](../scripts/chok/AGENTS.md). It is gitignored until the source's owner gives written permission, so a clean checkout has none; never commit it before then.

## Local Contracts

- Keep filenames stable unless [../app.json](../app.json) is updated in the same change.
- Preserve platform-specific constraints: the notification icon stays a white silhouette on a transparent background, the adaptive foreground and its monochrome twin keep all ink inside Android's 66/108 safe circle, and the splash images keep all ink inside 0.96 of their width (Android 12 masks the splash icon to a circle). [icon.png](icon.png) is opaque RGB. The export checks the ink radius and the transparency of each file and fails otherwise.
- Do not introduce old branding into raster assets.
- Every logo asset is drawn from the full mark with its four orange symbols (tefillin, tallit, Torah scroll, shofar), at any size: the launcher and store icons, the monochrome layer, the notification silhouette, the favicon and the splash (the owner's rule, 2026-10-22). A simplified variant without them is never exported.
- Never edit a PNG here by hand: the next `pnpm logo:build` overwrites it.

## Work Guidance

- Change the generator ([../design/jew365-concepts/vector/build.mjs](../design/jew365-concepts/vector/build.mjs) or [../scripts/logo/export.mjs](../scripts/logo/export.mjs)) and run `pnpm logo:build`; it writes every logo asset at once.

## Verification

- Run `pnpm test -- scripts/__tests__/logoAssets.test.js` after an export: it pins every file's size and colour type and the [../app.json](../app.json) wiring.
- Run `pnpm doctor` after asset path, plugin, or app config changes.
- For visual asset changes, verify on the relevant platform or web build because Jest does not cover raster appearance.

## Child DOX Index

- No child AGENTS.md files.

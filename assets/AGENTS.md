# AGENTS.md

## Purpose

- Own static image assets referenced by [../app.json](../app.json), including app icons, splash, favicon, and notification artwork.

## Ownership

- [icon.png](icon.png), [adaptive-icon.png](adaptive-icon.png), [splash.png](splash.png), [favicon.png](favicon.png), and [notification-icon.png](notification-icon.png) are release-facing assets.
- [README.md](README.md) records expected asset names and dimensions.
- [siddur/](siddur) holds the generated nusach texts, one JSON file per nusach and text. The build in [../scripts/siddur/AGENTS.md](../scripts/siddur/AGENTS.md) owns them; never edit them here.
- A chok folder beside siddur holds the generated Chok LeYisrael texts, built by [../scripts/chok/AGENTS.md](../scripts/chok/AGENTS.md). It is gitignored until the source's owner gives written permission, so a clean checkout has none; never commit it before then.

## Local Contracts

- Keep filenames stable unless [../app.json](../app.json) is updated in the same change.
- Preserve platform-specific constraints: notification icons should remain monochrome on transparent background, and adaptive icon foregrounds should remain safe for Android masking.
- Do not introduce old branding into raster assets.

## Work Guidance

- Prefer updating source artwork outside this folder, then exporting final PNGs into this folder.
- Avoid optimizing or regenerating every asset when only one platform image changes.

## Verification

- Run `pnpm doctor` after asset path, plugin, or app config changes.
- For visual asset changes, verify on the relevant platform or web build because Jest does not cover raster appearance.

## Child DOX Index

- No child AGENTS.md files.

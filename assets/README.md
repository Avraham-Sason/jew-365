Every image here is generated: `pnpm logo:build` rebuilds the SVGs of `design/jew365-concepts/vector` and then
exports all of the files below with `scripts/logo/export.mjs` (headless Chrome or Edge at exact pixel size). Edit
the generator, never a PNG. All of them are native assets: a change reaches users only with the next build.

The logo is mark `o` (the open stopwatch ring with a crown, hour ticks, JEW over 365°, four orange symbols, a
check and a bell). Cream is `#F6F1E8`, night is `#0E1626`. Every asset carries the four symbols, however small (the owner's rule,
2026-10-22).

- icon.png (1024×1024, RGB, opaque): the launcher icon on cream, centred, its shapes inside a circle 78% of the
  width. The launcher icon is the full mark, the four orange symbols included (the owner's call, 2026-10-22).
- adaptive-icon.png (1024×1024, transparent): the same mark drawn to a radius of 0.255 of the width, well inside
  Android's 66/108 safe circle (0.305), because a Samsung launcher cropped a mark that filled that circle;
  `app.json` supplies the cream background.
- adaptive-monochrome.png (1024×1024, transparent): the same layout in black, for Android 13 themed icons, which
  use only its alpha.
- notification-icon.png (96×96, transparent): the full mark as a white silhouette, the four symbols included,
  about 6 px of padding, square.
- splash.png (1024×1024, transparent): the full mark with all its shapes inside a circle 0.96 of the width,
  because Android 12 masks the splash icon to a 192 dp circle of its 200 dp image; the splash plugin in
  `app.json` sets the cream background.
- splash-dark.png (1024×1024, transparent): the same with the on-dark colours, on the night background.
- favicon.png (48×48, transparent): the web build's icon, the full mark.

The in-app logo is not a PNG: `src/components/logo.generated.ts` holds the SVG strings that `AppLogo` draws, and
the same export writes it.

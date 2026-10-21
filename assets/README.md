Every image here is generated: `pnpm logo:build` rebuilds the SVGs of `design/jew365-concepts/vector` and then
exports all of the files below with `scripts/logo/export.mjs` (headless Chrome or Edge at exact pixel size). Edit
the generator, never a PNG. All of them are native assets: a change reaches users only with the next build.

The logo is mark `o` (the open stopwatch ring with a crown, hour ticks, JEW over 365°, four orange symbols, a
check and a bell). Cream is `#F6F1E8`, night is `#0E1626`.

- icon.png (1024×1024, RGB, opaque): the launcher icon on cream, centred, its shapes inside a circle 78% of the
  width. The launcher icon is the open ring with the check and the bell, without the four line symbols.
- adaptive-icon.png (1024×1024, transparent): the same icon, every pixel inside Android's 66/108 safe circle
  (radius 0.305 of the width); `app.json` supplies the cream background.
- adaptive-monochrome.png (1024×1024, transparent): the same layout in black, for Android 13 themed icons, which
  use only its alpha.
- notification-icon.png (96×96, transparent): the white silhouette (a closed ring, a crown and 365), about 6 px
  of padding, square.
- splash.png (1024×1024, transparent): the full mark with all its shapes inside a circle 0.96 of the width,
  because Android 12 masks the splash icon to a 192 dp circle of its 200 dp image; the splash plugin in
  `app.json` sets the cream background.
- splash-dark.png (1024×1024, transparent): the same with the on-dark colours, on the night background.
- favicon.png (48×48, transparent): the launcher icon for the web build.

The in-app logo is not a PNG: `src/components/logo.generated.ts` holds the SVG strings that `AppLogo` draws, and
the same export writes it.

Place required images here:
- icon.png (1024×1024)
- splash.png (1242×2436 recommended)
- adaptive-icon.png (1024×1024 foreground)
- favicon.png (48×48)
- notification-icon.png (96×96 monochrome on transparent)

icon.png, adaptive-icon.png and splash.png are rendered from the geometry of `src/components/AppLogo.tsx`
(logo variant ב, approved 2026-10-09) as inline SVG in headless Chrome at exact pixel size:
- icon.png: opaque parchment `#F5EFE4` background, logo 700 px wide, centred.
- adaptive-icon.png: transparent background (app.json supplies the parchment), logo 600 px wide, inside
  Android's 66/108 safe zone (626 px).
- splash.png: parchment background, logo 500 px wide centred at y 1000, the store name `יהודי בזמן` in Heebo
  Bold 104 px navy at y 1400 and the store subtitle `כל מצווה בזמנה` in Heebo Medium 60 px `#7F5A0F`
  (gold palette `goldText`) at y 1530.

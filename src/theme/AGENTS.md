# AGENTS.md

## Purpose

- Own visual tokens, typography, colors, shadows, and theme provider behavior.

## Ownership

- [tokens.ts](tokens.ts), [colors.ts](colors.ts), [typography.ts](typography.ts), and [shadowStyle.ts](shadowStyle.ts) own theme primitives.
- [colors.ts](colors.ts) owns the six palettes (`THEMES`, `THEME_NAMES`, `ThemeName`): four light ones, gold (`T_LIGHT`, the default: warm cream page, warm-white cards, orange accent; the owner's 2026-10-21 redesign), pink (the same warm style with a rose accent), and purple and blue (a tinted page with white surfaces), and two dark ones, dark (night navy with the orange accent) and plum (dark plum, rose accent), listed in `DARK_THEMES`, the one place `isDarkTheme()` reads. Palette ids never change, so no store migrates. `paletteForGender(gender, current)` beside it maps a gender answer to a palette inside the current light or dark class (light: gold for male, pink for female; dark: dark for male, plum for female), so purple and blue land on gold or pink; [../stores/taharahOptIn.ts](../stores/taharahOptIn.ts) `chooseGender()` is its one caller. It also owns `BRAND` (`navy`, `gold`, `onGold`, `parchment`, `white`), the default palette's identity read off `T_LIGHT`, which the provider-free error boundary draws with (the logo has its own generated colours), and the `overlay` token, the scrim behind every sheet and dialog.
- [tokens.ts](tokens.ts) owns `spacing` (xs 4, sm 8, md 12, lg 16, xl 20, xxl 28, xxxl 40) and `radius` (xs 4, sm 8, md 12, lg 16, xl 20, xxl 24, full 999). [typography.ts](typography.ts) owns the `typography` variants (display 28, title 22, heading 17, subheading and body and bodyBold 15, caption and captionBold 13, small 12, micro 11), `fontFamilies` and `APP_FONTS`, the list of font names the root layout loads.
- [ThemeProvider.tsx](ThemeProvider.tsx) owns runtime theme access: it resolves `useUserStore.theme` to `{ colors, isDark, name }` and syncs the OS appearance through `Appearance.setColorScheme`, so alerts, the keyboard and switches follow the palette.
- Theme tests live in [__tests__/](__tests__/).

## Local Contracts

- A new token is added to every palette in `THEMES`; the theme test pins identical key sets.
- `gold`, `onGold` and `goldLight` are the accent tokens of every palette, rose in the plum theme and so on, so a screen never assumes they are yellow. `gold` is a fill, never a text colour: the orange reads 2.5:1 on the card in the gold palette. Accent text on `surface`, `bg` or `goldLight` uses `goldText` (a darker orange-brown in the gold palette, a darker rose in pink, the accent itself elsewhere), and a label on an `urgent` fill uses `onUrgent`. `goldWash` and `goldWashStrong` are the accent as a faint tint, the `gold` value with an `09` and an `18` alpha suffix (so 8-digit hex, the one form besides 6-digit hex and `rgba` the theme test accepts), for the schedule's current row and today's cell. Text on a `gold` fill uses `onGold`, never a literal white. Headers draw on the page tokens (`bg`, `text`, `textSub`, `goldText`) and the tab bar on `tabBg`; no screen draws a coloured header band.
- The four light palettes share the status colours (urgent, warning, safe). Gold and pink share the warm-white `surface` and `tabBg`; purple and blue keep white ones. The theme test pins that.
- The theme test also pins WCAG contrast floors (text/bg, text/surface, text/surface2, textMuted/surface, onGold/gold, goldText/surface, goldText/bg, goldText/goldLight, onUrgent/urgent, urgent/urgentBg and urgent/surface at 4.5 or more, textSub/surface at 4.0 or more), so a palette edit that breaks readability fails the suite; it reads hex tokens only. Every palette name has a `settings.theme.<name>` label in both dictionaries, pinned by the same suite.
- The theme picker is [ThemeSwatchRow](../components/ThemeSwatchRow.tsx), never a local copy.
- Keep typography compatible with the Heebo and Noto Serif Hebrew font loading in [../app/_layout.tsx](../app/_layout.tsx). Noto Serif Hebrew is the prayer-text family because it covers every nikud and cantillation mark; Heebo does not.
- New UI should use theme tokens and `useTheme()` instead of one-off styling. A screen or component never writes a spacing or radius number where a token matches (values 1 to 3, hairlines and fixed box sizes are not spacing), never writes a white literal (a label on a `gold` fill is `onGold`, on `urgent` it is `onUrgent`, anything else white is `BRAND.white`), and never sets `fontWeight` on Heebo text: it takes a `typography` variant or a `fontFamilies.heebo` family. [../app/__tests__/designSystem.test.ts](../app/__tests__/designSystem.test.ts) guards the glyph, white, translucent white, `fontWeight` and font-name rules, the header split between stack screens and tabs, and that no file reads a `colors.header*` token or keeps a screen-local card or button style.

## Work Guidance

- Prefer extending existing tokens over scattering hard-coded colors or spacing.
- Coordinate token changes with affected components and screenshots/manual checks when visual risk is high.

## Verification

- Run `pnpm test -- src/theme/__tests__/theme.test.ts` and `pnpm test -- src/app/__tests__/designSystem.test.ts` after token, color, typography, or provider changes.
- Run `pnpm typecheck` after theme type changes.

## Child DOX Index

- No child AGENTS.md files.

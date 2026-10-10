# AGENTS.md

## Purpose

- Own visual tokens, typography, colors, shadows, and theme provider behavior.

## Ownership

- [tokens.ts](tokens.ts), [colors.ts](colors.ts), [typography.ts](typography.ts), and [shadowStyle.ts](shadowStyle.ts) own theme primitives.
- [colors.ts](colors.ts) owns the six palettes (`THEMES`, `THEME_NAMES`, `ThemeName`): four light ones, gold (`T_LIGHT`, white surfaces on parchment), pink, purple and blue (white surfaces on a tinted background, restored on 2026-10-10 at the user's request), and two dark ones, dark (navy, gold accent) and plum (dark plum, rose accent), listed in `DARK_THEMES`, the one place `isDarkTheme()` reads. It also owns `BRAND` (`navy`, `gold`, `parchment`, `white`), the palette-independent brand colours the logo and the provider-free error boundary draw with, and the `overlay` token, the scrim behind every sheet and dialog.
- [tokens.ts](tokens.ts) owns `spacing` (xs 4, sm 8, md 12, lg 16, xl 20, xxl 28, xxxl 40) and `radius` (xs 4, sm 8, md 12, lg 16, xl 20, xxl 24, full 999). [typography.ts](typography.ts) owns the `typography` variants (display 28, title 22, heading 17, subheading and body and bodyBold 15, caption and captionBold 13, small 12, micro 11), `fontFamilies` and `APP_FONTS`, the list of font names the root layout loads.
- [ThemeProvider.tsx](ThemeProvider.tsx) owns runtime theme access: it resolves `useUserStore.theme` to `{ colors, isDark, name }` and syncs the OS appearance through `Appearance.setColorScheme`, so alerts, the keyboard and switches follow the palette.
- Theme tests live in [__tests__/](__tests__/).

## Local Contracts

- A new token is added to every palette in `THEMES`; the theme test pins identical key sets.
- `gold`, `onGold` and `goldLight` are the accent tokens of every palette, rose in the plum theme and so on, so a screen never assumes they are yellow. `gold` is a fill, never a text colour: it reads 2.75:1 on white in the gold palette. Accent text on `surface`, `bg` or `goldLight` uses `goldText` (a darker gold in the gold and pink palettes, the accent itself elsewhere), and a label on an `urgent` fill uses `onUrgent`. Text on a `gold` fill uses `onGold`, never a literal white. `headerAccent` is the accent as drawn on `headerBg` (the home counter, the history streak, the schedule view toggle, the logo star): the same value as `gold` in the gold and dark palettes and a pale tint in pink, purple and blue, because `gold` on their tinted headers reads under 2:1.
- The light palettes keep white surfaces and the shared status colours (urgent, warning, safe) and differ in `bg`, `border`, accent and header; the theme test pins that.
- The theme test also pins WCAG contrast floors (text/bg, text/surface, textMuted/surface, onGold/gold, goldText/surface, goldText/bg, goldText/goldLight, onUrgent/urgent, headerText/headerBg and headerAccent/headerBg at 4.5 or more, textSub/surface at 4.0 or more), so a palette edit that breaks readability fails the suite; it reads hex tokens only, so `headerSub` (rgba) is checked by hand when a header changes. Every palette name has a `settings.theme.<name>` label in both dictionaries, pinned by the same suite.
- The theme picker is [ThemeSwatchRow](../components/ThemeSwatchRow.tsx), never a local copy.
- Keep typography compatible with the Heebo and Noto Serif Hebrew font loading in [../app/_layout.tsx](../app/_layout.tsx). Noto Serif Hebrew is the prayer-text family because it covers every nikud and cantillation mark; Heebo does not.
- New UI should use theme tokens and `useTheme()` instead of one-off styling. A screen or component never writes a spacing or radius number where a token matches (values 1 to 3, hairlines and fixed box sizes are not spacing), never writes a white literal (a label on a `gold` fill is `onGold`, on `urgent` it is `onUrgent`, anything else white is `BRAND.white`), and never sets `fontWeight` on Heebo text: it takes a `typography` variant or a `fontFamilies.heebo` family. [../app/__tests__/designSystem.test.ts](../app/__tests__/designSystem.test.ts) guards the glyph, white, `fontWeight` and font-name rules and the header split between stack screens and tabs.

## Work Guidance

- Prefer extending existing tokens over scattering hard-coded colors or spacing.
- Coordinate token changes with affected components and screenshots/manual checks when visual risk is high.

## Verification

- Run `pnpm test -- src/theme/__tests__/theme.test.ts` and `pnpm test -- src/app/__tests__/designSystem.test.ts` after token, color, typography, or provider changes.
- Run `pnpm typecheck` after theme type changes.

## Child DOX Index

- No child AGENTS.md files.

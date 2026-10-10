# AGENTS.md

## Purpose

- Own reusable React Native UI components shared across routes.

## Ownership

- Components include [MitzvahCard.tsx](MitzvahCard.tsx), [CompletedRow.tsx](CompletedRow.tsx), [ReminderEditor.tsx](ReminderEditor.tsx), [TimeRibbon.tsx](TimeRibbon.tsx), [BottomTabs.tsx](BottomTabs.tsx), [NavBar.tsx](NavBar.tsx), [AppLogo.tsx](AppLogo.tsx), [OnboardingDots.tsx](OnboardingDots.tsx), [ChoiceRow.tsx](ChoiceRow.tsx), [SettingsSection.tsx](SettingsSection.tsx), [ThemeSwatchRow.tsx](ThemeSwatchRow.tsx), [ScrollSpeedStepper.tsx](ScrollSpeedStepper.tsx), [TaharahLock.tsx](TaharahLock.tsx), [ShabbatScreen.tsx](ShabbatScreen.tsx), and the shared building blocks [ScreenHeader.tsx](ScreenHeader.tsx), [SegmentedControl.tsx](SegmentedControl.tsx), [ConfirmDialog.tsx](ConfirmDialog.tsx), [BottomSheet.tsx](BottomSheet.tsx), [Banner.tsx](Banner.tsx), [SectionLabel.tsx](SectionLabel.tsx), [ListRow.tsx](ListRow.tsx), [IconTile.tsx](IconTile.tsx) and [MitzvahIcon.tsx](MitzvahIcon.tsx).
- [ShabbatScreen.tsx](ShabbatScreen.tsx) renders an in-tree overlay above the navigator, never a native `Modal`, which on iOS cannot present over another one; its emblem is `IconTile candles`. Android back exits the app. The caller decides when it shows. The file also owns `QuietBlockContext` and `useQuietBlock()`.
- A component that opens an overlay uses [BottomSheet.tsx](BottomSheet.tsx) or [ConfirmDialog.tsx](ConfirmDialog.tsx), which gate on `useQuietBlock()` themselves; only those two files render a `Modal`, as [ReminderEditor.tsx](ReminderEditor.tsx) does through `BottomSheet`.
- [ScreenHeader.tsx](ScreenHeader.tsx) is the header of every stack screen, a tab uses [NavBar.tsx](NavBar.tsx). `ScreenHeader` takes `title`, `subtitle`, `onBack` (draws the back pill, its chevron following the language direction), `actions` (a row at the end of the pill row, which may shrink so a caller's wrapping group, such as the reader's controls, folds instead of overflowing), `leading` (before the title, such as an icon tile) and `children` (a body row under the title). It also exports `HeaderPill` (`label`, `onPress`, `accessibilityLabel`, `selected`: a pill that turns `headerAccent` while selected) and `HEADER_PILL_BG` / `HEADER_PILL_BG_PRESSED`, the one translucent white a header control draws on.
- [NavBar.tsx](NavBar.tsx) draws the logo, the `title` with an optional `subtitle`, and an `actions` node at the end; it has no `left` or `right` prop.
- [SegmentedControl.tsx](SegmentedControl.tsx) is the one segmented choice (`options` as `{ value, label }`, `value`, `onChange`, `tone` `surface` or `header`, `style`); each option is a `radio` with the selected state. The generic `T extends string` keeps `onChange` typed to the option values.
- [ConfirmDialog.tsx](ConfirmDialog.tsx) is the one confirmation modal: `visible`, `title`, `body`, `confirmLabel`, `cancelLabel` (default `common.cancel`), `destructive` (an `urgent` confirm button), `busy` (disables both buttons), `onConfirm`, `onCancel`. A backdrop tap and Android back both cancel.
- [BottomSheet.tsx](BottomSheet.tsx) is the one action sheet and picker host: `visible`, `title`, `caption`, `onClose`, `children`, and always a Close button of its own, so a caller adds no Cancel. It lifts above the keyboard on iOS. `SheetAction` is a row inside it (`label`, `onPress`, `destructive`); `selected` draws it on `goldLight` with the selected state, and `onLayout` lets a long list scroll the selected row into view.
- [Banner.tsx](Banner.tsx) is the status strip (`text`, `tone` `warning` | `urgent` | `safe` | `accent` | `info`, optional `onPress` which makes it a button, `style`); `bannerPalette()` is exported and picks text colours apart from the border, because the status colours read under 3:1 on their own tint.
- [SectionLabel.tsx](SectionLabel.tsx) is the heading above a list (`text`, optional `count` appended in brackets, `style`).
- [ListRow.tsx](ListRow.tsx) is the icon, title and caption row (`icon`, `iconTone` `accent` | `muted`, `title`, `caption`, `trailing`, `onPress`, `onLongPress`, `disabled`, `accessibilityLabel`, `style`); without `onPress` it is not a button, and `onLongPress` passes straight through to the `Pressable`. The mitzvot library, the siddur tab, Settings, home's next-up row and the hilulot screen all use it.
- [IconTile.tsx](IconTile.tsx) is the rounded tile around an icon (`name`, `tone` `accent` | `muted` | `done`, `size`, `style`) and [MitzvahIcon.tsx](MitzvahIcon.tsx) the drawing itself (`name`, `size`, `color`, `tint`, `variant`, `strokeWidth`). `ICON_NAMES` lists every drawing, `iconFor(mitzvah.icon)` maps a registry icon string to an `IconName` and falls back to `custom`, and `ICON_VARIANT` (`outline` | `duotone`) is the one-line switch for the icon style app-wide. A screen never draws a glyph for a mitzvah.
- [DayStepper.tsx](DayStepper.tsx) steps a device calendar day by one with arrows that follow the language direction, a civil date line over the Hebrew date, and disables a step past `min` / `max`. It also exports `formatDayLine()`, the civil date line the taharah screens share.
- [ChipRow.tsx](ChipRow.tsx) draws a wrapping row of selectable pills for any `string | number` value list: `values`, the `selected` value (or `null`), `onSelect`, `renderLabel`, and a `style` for the row. The active pill is gold; settings, the taharah screens and the city picker all use it, so a pill never gets a local copy.
- [ChoiceRow.tsx](ChoiceRow.tsx) draws one full-width selectable option row (`label`, `selected`, `onPress`): gold border and a tick while selected, plain otherwise, with the button role and the selected state for a screen reader. The onboarding profile and nusach steps list their choices with it, so an option row never gets a local copy.
- [OnboardingDots.tsx](OnboardingDots.tsx) draws the onboarding progress dots for `step` of `total`; `ONBOARDING_STEPS` is the one count every onboarding screen passes, and the caller's `style` places it.
- [SettingsSection.tsx](SettingsSection.tsx) is the bordered card both settings screens group their rows in (`title`, `children`); a screen never declares its own section.
- [ThemeSwatchRow.tsx](ThemeSwatchRow.tsx) draws one radio per `THEME_NAMES` entry (`selected`, `onSelect`, `labelFor`): a ring in the current accent while selected, inside it a disc in the palette's `bg` with a dot in the palette's accent, and no visible text: the circles speak for themselves (the user's call, 2026-10-08) and `labelFor` feeds only the accessibility label. Settings is its one caller, so the palette picker never gets a local copy.
- [ScrollSpeedStepper.tsx](ScrollSpeedStepper.tsx) steps the auto-scroll speed level (`level`, `onChange`) between 1 and `SIDDUR_SCROLL_SPEEDS.length` as − level +, disabling a step past either end; `tone` draws it on the reader header or on a settings card. The reader header and the Settings tab both use it, so the speed control never gets a local copy.
- [AppLogo.tsx](AppLogo.tsx) draws the mark from `BRAND` (navy disc, gold ring and star, white tick) in every palette and takes only a `size`.
- [BottomTabs.tsx](BottomTabs.tsx) draws the five tabs (schedule, history, home, siddur, settings; the siddur tab with the `siddur` `MitzvahIcon`) in the order the layout registers them and singles out the `home` route: a 44-point disc lifted above the bar's top edge, gold when focused and `goldLight` otherwise, ringed in the bar color. Every other tab keeps the plain icon and label.
- [TaharahLock.tsx](TaharahLock.tsx) wraps the taharah navigator and covers it while `lockStatusFor()` says locked; the unlock flow and the session rules are in [../app/taharah/AGENTS.md](../app/taharah/AGENTS.md).
- Component tests live in [__tests__/](__tests__/).

## Local Contracts

- Use [../theme/AGENTS.md](../theme/AGENTS.md) tokens and `useTheme()` instead of hard-coded colors unless there is a narrow reason.
- Keep components reusable and prop-driven; business rules belong in [../services/AGENTS.md](../services/AGENTS.md), [../stores/AGENTS.md](../stores/AGENTS.md), [../data/AGENTS.md](../data/AGENTS.md), or [../utils/AGENTS.md](../utils/AGENTS.md).
- Preserve RTL and Hebrew-first layout behavior. Position with direction-relative `start`/`end`; never combine a `language`-driven rotation with physical `left`/`right`, which RN swaps by `I18nManager.isRTL` instead — two sources of truth that disagree on first launch.
- The same swap applies to `textAlign`: native RN flips `left`/`right` under `I18nManager.isRTL`, while react-native-web keeps them literal, so a web preview cannot catch it. Leave `textAlign` at its start default, or derive the physical edge from `I18nManager.isRTL`, as the siddur reader does. A `TextInput`'s `textAlign` is physical on Android and web, so an LTR-only field such as a URL uses the literal `'left'` with `writingDirection: 'ltr'`.
- [MitzvahCard.tsx](MitzvahCard.tsx) takes an `icon` (`IconName`, default `custom`; callers pass `iconFor(mitzvah.icon)`) drawn as an `IconTile` in the `done` tone once completed, and renders the open-text button beside the check button only when the caller passes `onOpenText`; the caller decides availability through `hasSiddurText()`. Its outer Pressable is disabled only when nothing on the card responds: react-native-web turns a disabled Pressable into `pointer-events: none`, which would swallow the check button of a card that has no `onPress`, as on the check-in screen.
- Logic worth testing must be exported and imported by the test, never re-declared inside it.

## Work Guidance

- Add focused tests for reusable behavior that can regress independently of a route.
- Avoid changing shared component semantics to satisfy one screen unless the new contract is valid for all callers.

## Verification

- Run `pnpm test -- src/components/__tests__/TimeRibbon.test.ts` after TimeRibbon changes.
- Run relevant route or service tests for components whose behavior is coupled to those domains.
- Run `pnpm typecheck` after component prop changes.

## Child DOX Index

- No child AGENTS.md files.

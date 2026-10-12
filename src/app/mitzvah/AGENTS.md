# AGENTS.md

## Purpose

- Own mitzvah detail routes for static and custom mitzvot.

## Ownership

- [[id].tsx](%5Bid%5D.tsx) renders mitzvah details, reminders, content blocks, and detail-level actions, including the "פתח נוסח" button into [../siddur/AGENTS.md](../siddur/AGENTS.md). Its header is [ScreenHeader](../../components/ScreenHeader.tsx) with the mitzvah's [IconTile](../../components/IconTile.tsx) (`iconFor(mitzvah.icon)`) as `leading` and the next-reminder preview as its child, and the delete-reminder confirmation is a [ConfirmDialog](../../components/ConfirmDialog.tsx).

## Local Contracts

- Use [../../data/customMitzvotAdapter.ts](../../data/customMitzvotAdapter.ts), `getAllMitzvot()`, or `findAnyMitzvah()` when a detail route must include both static and custom mitzvot.
- Reminder edits must stay compatible with [../../services/AGENTS.md](../../services/AGENTS.md) scheduler contracts.
- Reminders are added and edited in [ReminderEditor](../../components/ReminderEditor.tsx), a [BottomSheet](../../components/BottomSheet.tsx) holding a [SegmentedControl](../../components/SegmentedControl.tsx) for the anchor (start, end and, for a registry mitzvah only, a set clock time through a [TimeField](../../components/TimeField.tsx): drawn inline in the editor's sheet; the screen passes `mitzvah`, the user's `location` and `settings` and `allowClock={!mitzvah.isCustom}`), the label and offset fields and Save; the sheet's own close button is the only way out besides Save. Save accepts a reminder that `nextReminderAt()` would fire at least once in the scheduler's lookahead, whatever the window shown today (a Friday's ends at candle lighting), and refuses one that never fires with `reminder.errors.outsideWindow` or, for a clock time, `reminder.errors.timeOutsideWindow`. A reminder row reads its anchor label and offset (`+30 דק'`), or for a `clock` reminder the `HH:MM` it fires at (`minutesToTime()`). The screen renders no `Modal` and no `useQuietBlock()` of its own: the sheet and the dialog gate themselves on the quiet block. A reminder row's delete button draws the `close` icon, the add row the `plus` icon, and the legend under the time window a filled circle `View` in the ribbon's safe, warning or urgent colour, never a text glyph.
- Content block rendering must support text, blessing, link and siddur blocks without breaking Hebrew-first layout. `ContentBlockView` draws a siddur block as a link-style row captioned `detail.openSiddur` that pushes the reader at `/siddur/<textId>` with no date, so the reader resolves the text for the day in effect. A siddur block whose `textId` is no longer in `SIDDUR_TEXT_IDS` (a retired text) renders nothing.
- The "next reminder" preview is `nextReminderAt()` from the scheduler facade: the first reminder the scheduler would fire, across windows. Once every reminder of the open window has fired, or the window is marked done or skipped, it names the next window's first one, up to ten days ahead and past a Shabbat / Yom Tov block, never inside it. It reads the reminders on screen and the completions and skipped maps, so a mark moves it at once; the screen keeps no filter of its own.
- The window shown and the "פתח נוסח" button come from `currentOrNextWindow()`, so a night window still open after midnight wins over tonight's; the button shows only when `hasSiddurText()` is true for it and passes the window's day, `dateKey(window.date)`, as `date`: a location date, which after midnight is yesterday's for a night window, not the device's civil date.
- The header subtitle is the cycle and the window as `clockRange()` from [clock.ts](../../utils/clock.ts): an end on a later device calendar day than the start reads `detail.timeRangeNextDay` ("05:27 עד 05:28 למחרת" for Chok LeYisrael, the Omer, a summer maariv). It says "the next day", not "tomorrow", because after midnight the window shown can be yesterday's. The two clocks beside the time ribbon stay bare.

## Work Guidance

- Keep detail-screen behavior state-driven through stores and services.
- When reminder behavior changes, update notification tests as well as screen behavior if applicable.

## Verification

- Run `pnpm test -- src/services/__tests__/NotificationScheduler.test.ts` after reminder scheduling behavior changes.
- Run `pnpm test -- src/data/__tests__/mitzvot.test.ts` after static mitzvah detail fields change.
- Run `pnpm typecheck` after route param, content block, or reminder type changes.

## Child DOX Index

- No child AGENTS.md files.

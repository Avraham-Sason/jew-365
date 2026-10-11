# AGENTS.md

## Purpose

- Own mitzvah detail routes for static and custom mitzvot.

## Ownership

- [[id].tsx](%5Bid%5D.tsx) renders mitzvah details, reminders, content blocks, and detail-level actions, including the "פתח נוסח" button into [../siddur/AGENTS.md](../siddur/AGENTS.md). Its header is [ScreenHeader](../../components/ScreenHeader.tsx) with the mitzvah's [IconTile](../../components/IconTile.tsx) (`iconFor(mitzvah.icon)`) as `leading` and the next-reminder preview as its child, and the delete-reminder confirmation is a [ConfirmDialog](../../components/ConfirmDialog.tsx).

## Local Contracts

- Use [../../data/customMitzvotAdapter.ts](../../data/customMitzvotAdapter.ts), `getAllMitzvot()`, or `findAnyMitzvah()` when a detail route must include both static and custom mitzvot.
- Reminder edits must stay compatible with [../../services/AGENTS.md](../../services/AGENTS.md) scheduler contracts.
- Reminders are added and edited in [ReminderEditor](../../components/ReminderEditor.tsx), a [BottomSheet](../../components/BottomSheet.tsx) holding a [SegmentedControl](../../components/SegmentedControl.tsx) for the anchor, the label and offset fields and Save; the sheet's own close button is the only way out besides Save. The screen renders no `Modal` and no `useQuietBlock()` of its own: the sheet and the dialog gate themselves on the quiet block.
- Content block rendering must support text, blessing, link and siddur blocks without breaking Hebrew-first layout. `ContentBlockView` draws a siddur block as a link-style row captioned `detail.openSiddur` that pushes the reader at `/siddur/<textId>` with no date, so the reader resolves the text for the day in effect.
- The "next reminder" preview applies `reminderFires()`, the scheduler's own rule, so it never promises a reminder inside a Shabbat / Yom Tov block.
- The window shown and the "פתח נוסח" button come from `currentOrNextWindow()`, so a night window still open after midnight wins over tonight's; the button shows only when `hasSiddurText()` is true for it and passes its civil date as `date`.

## Work Guidance

- Keep detail-screen behavior state-driven through stores and services.
- When reminder behavior changes, update notification tests as well as screen behavior if applicable.

## Verification

- Run `pnpm test -- src/services/__tests__/NotificationScheduler.test.ts` after reminder scheduling behavior changes.
- Run `pnpm test -- src/data/__tests__/mitzvot.test.ts` after static mitzvah detail fields change.
- Run `pnpm typecheck` after route param, content block, or reminder type changes.

## Child DOX Index

- No child AGENTS.md files.

# AGENTS.md

## Purpose

- Own date-specific schedule/history drilldown routes.

## Ownership

- [[date].tsx](%5Bdate%5D.tsx) renders a single ISO-date route from schedule/history navigation: a [ScreenHeader](../../components/ScreenHeader.tsx) titled with the formatted date, subtitled `day.title` only when the date is today, and one [Banner](../../components/Banner.tsx) above the cards. An invalid date shows `day.title` as the title.

## Local Contracts

- Validate route dates before computing day content.
- Past-day views are read-only and must not write completion state. A mitzvah waiting in an open check-in shows as waiting, not missed, with an `accent` Banner into `/checkin`, where past days are marked; any other past or future day shows an `info` Banner saying it is read-only.
- Day content should be built through [../../utils/buildDayTimeline.ts](../../utils/buildDayTimeline.ts), not duplicated in the route.
- A future day's card prints its window through `clockRange()` in [../../utils/clock.ts](../../utils/clock.ts), the mitzvah screen's format, so a window that ends on the next day says so.

## Work Guidance

- Preserve clear distinction between today/future interaction and historical read-only state.
- Reuse [../../components/MitzvahCard.tsx](../../components/MitzvahCard.tsx) behavior instead of creating route-specific completion controls.

## Verification

- Run `pnpm test -- src/app/__tests__/routes.test.ts` after route filename or path changes.
- Run `pnpm test -- src/utils/__tests__/buildDayTimeline.test.ts` after day item logic changes.
- Run `pnpm typecheck` after route param or component prop changes.

## Child DOX Index

- No child AGENTS.md files.

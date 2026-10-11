# AGENTS.md

## Purpose

- Own the notification schedule's pipeline: store state is read once into a `PlanInput`, pure planners turn it into `ScheduleCandidate`s, and one adapter hands them to expo-notifications.

## Ownership

- [ids.ts](ids.ts) owns every constant (task names, categories, actions, notification kinds, MMKV keys, limits, `ANDROID_CHANNELS`, `SCHEDULE_FORMAT`), the `PendingNotificationMeta` payload type, and the pure id and payload helpers: `buildId()`, `parseId()`, `parseDateKey()`, `pendingNotificationMetaFromContent()`, `notificationTargetFromData()` and `notificationMatchesTarget()`.
- [types.ts](types.ts) owns `ScheduleCandidate`, `ChannelKey` and `PlanInput`. None of them mentions expo.
- [snapshot.ts](snapshot.ts) owns `readPlanInput(now, scope?)`, the one place a plan reads the stores, `currentScope()` and the `PlanScope` a caller may override, plus the small store readers the facade shares (`enabledMitzvot()`, `currentSettings()`, `hasNotificationPermission()`).
- [plan.ts](plan.ts) owns `buildPlan(input)`: runs the planners, sorts by trigger and applies the platform cap.
- [planners/horizon.ts](planners/horizon.ts) owns the horizon (`horizonDays()`, `holyBlocksWithin()`, `recentDaysBefore()`, `horizonFor()`) and `formatClock()`.
- [planners/mitzvot.ts](planners/mitzvot.ts) owns mitzvah reminders: `planMitzvot()`, `buildTriggerTime()` and `bodyForReminder()`.
- [planners/holyBlock.ts](planners/holyBlock.ts) owns the pre-block notice with its Omer lines.
- [planners/hilulot.ts](planners/hilulot.ts) owns the hilula notices and `hilulaLines()`, the lines the pre-block notice carries for the notices a block swallows.
- [planners/roshChodesh.ts](planners/roshChodesh.ts) owns the Rosh Chodesh notices (`before`, `evening`, `day`) and `roshChodeshLines()`, the lines the pre-block notice carries for the ones a block swallows. The day arithmetic is [../../data/roshChodesh.ts](../../data/roshChodesh.ts).
- [planners/checkIn.ts](planners/checkIn.ts) owns the check-in nudges and `checkInInputOf()`.
- [planners/report.ts](planners/report.ts) owns the weekly report notice (`planReport()`, `REPORT_DELAY_MIN`): one per block that closes a week, 45 minutes after its exit. Which block closes a week is `weekEndFor()` in [../../utils/weeklyReport.ts](../../utils/weeklyReport.ts).
- [planners/taharah.ts](planners/taharah.ts) owns the taharah reminders, the merged pre-block notification and `bedikotMissingIn()`.
- [os.ts](os.ts) owns every call into expo-notifications: channels, categories, scheduling, cancelling, the tray, permissions, the foreground handler and the action task registration.
- [__tests__/plan.test.ts](__tests__/plan.test.ts) pins `buildPlan()` on fixed inputs.
- [../NotificationScheduler.ts](../NotificationScheduler.ts) stays the public facade; [../AGENTS.md](../AGENTS.md) lists what it keeps.

## Local Contracts

- The flow is one-way: `readPlanInput()` → `buildPlan()` → `os.schedule()`. The facade orchestrates it under the lock; no planner calls the facade or [os.ts](os.ts).
- A planner is a pure function of `(PlanInput, Horizon)`. It never calls a store's `getState()`, never reads the clock (`new Date()`, `Date.now()`; the instant is `input.now`) and never imports expo. Text comes from `t()`, which follows the live locale; `input.language` only chooses between a mitzvah's, a hilula's or a Rosh Chodesh month's Hebrew and English names.
- `PlanInput` holds each fact once. The completion, skip and check-in maps are read by the mitzvah planner directly and assembled into the check-in input by `checkInInputOf()`; there is no second copy of the marks.
- A candidate names its channel by `ChannelKey`. `os.schedule()` builds the request: a date trigger carrying `channelId`, `autoDismiss: true`, `sticky: false`, `sound: 'default'` and the candidate's category when it has one. A notification's channel is chosen where it is planned, as the table in [../AGENTS.md](../AGENTS.md) lists.
- `buildPlan()` plans block notices, check-ins, the weekly report, taharah, hilulot, Rosh Chodesh, then mitzvot, sorts by trigger (stable, so equal instants keep that order) and cuts at `IOS_MAX - IOS_HEADROOM` on iOS and `PENDING_LIMIT` elsewhere, warning about what it drops. Without permission the plan is empty.
- A failure costs only its own candidates, because `cancelAll()` has already run: block notices, check-ins and mitzvot isolate each block or each mitzvah and day inside their planner; `buildPlan()` guards the weekly report, taharah, hilula and Rosh Chodesh planners as a whole.
- [os.ts](os.ts) hands the facade `TrayNotification`s (`identifier` and parsed `data`), never expo objects. It makes no decision: suppression, mark-done, the update notice policy, permission state and the lock stay in the facade.
- [ids.ts](ids.ts) is the only home of the payload type and the kind constants. A new kind of notification adds its kind and payload field there, builds its candidate (id included) in a planner, and follows the checklist in the root [../../../AGENTS.md](../../../AGENTS.md).

## Work Guidance

- A planner takes `(input, horizon)` and returns candidates; register it in `buildPlan()` in the order its ties should resolve.
- Read a new fact in [snapshot.ts](snapshot.ts) and add it to `PlanInput`; do not reach for a store from a planner.
- Test a planner through `buildPlan()` with a hand-built `PlanInput` and `at()` from [../../testing/zmanim.ts](../../testing/zmanim.ts). The clock is in the input, so no timer faking is needed.

## Verification

- Run `pnpm test -- src/services/notifications`, then `pnpm test -- src/services`, `pnpm test:tz -- src/services` and `pnpm typecheck`.
- `pnpm check:dox` after touching this file.

## Child DOX Index

- No child AGENTS.md files.

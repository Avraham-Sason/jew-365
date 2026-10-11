# Failure-Point Audit — Jew in Time (יהודי בזמן)

Audit date: 2026-08-09 · Commit `edf9211` (+ the uncommitted `skipIfDone` work)

**The green baseline is the problem.** `tsc --noEmit` passes, 146/146 Jest tests pass across 22 suites, and they still pass under a different timezone. Every item below is a real defect that green does **not** catch — in several cases *because* a test asserts the bug as correct behaviour.

## Status

All 63 findings below are annotated. **59 are fixed**, verified by `pnpm typecheck` plus the Jest
suite in four timezones (`pnpm test:tz`: UTC, Asia/Jerusalem, America/Los_Angeles,
Pacific/Kiritimati). The four-zone part was only genuine from 2026-10-04 (see §8.7 below). Each fix
carries a note under its finding.

Found after the audit:

- **§8.7** — `pnpm test:tz` never changed zone. The setup file assigned `TZ` inside Jest, whose
  `setupFiles` see a copy of `process.env`, so every run used the machine's own zone. Fixed
  2026-10-04: the zone is set on the spawned Jest process, and a guard fails any run where it did
  not take effect. The real matrix then exposed four places that read the location's day through
  device-local getters: `hebrewDaysAt`, the candle-lighting/havdalah/Omer windows, and the
  history/timeline day mapping. All four are fixed. Erev-Yom-Tov candle lighting also stopped
  depending on the clock time of the rebuild.

- **§3.10** — a killed-state "עשיתי" tap was silently dropped: neither background task was ever
  defined in headless JS, because `defineTask` was reachable only through route modules. Fixed
  2026-08-10 via a root `index.js` entry.

- **§2.9 was only half fixed**, and Shabbat itself was never quiet. Found and fixed 2026-10-06
  with the holy-block quiet window:
  - Only tefillin had `skipOn`. Shacharit, mincha, maariv, ק"ש, tzitzit, birchot hashachar and the
    Omer all rang on Shabbat and Yom Tov, the Omer with its bracha in the body. No trigger inside
    a block is scheduled now, and the app shows only the Shabbat screen until tzeit.
  - Havdalah was still Saturday-only: it fired in the middle of a Yom Tov that starts on motzaei
    Shabbat, and never at the end of a Yom Tov on a weekday. Its text always included the spices
    and the flame, which motzaei Yom Tov, motzaei Yom Kippur and the night after a deferred Tisha
    B'Av do not have.
  - Candle lighting fired on a Friday that is itself Yom Tov (Rosh Hashana 5789).
  - The candle-lighting "עוד 20 דק'" reminder never fired: it falls before its own window and the
    scheduler's backstop drops it. Removed; the pre-block notice carries the lead time.
  - The schedule stopped at tomorrow, so Sunday morning had no reminders whenever background
    fetch did not run over Shabbat. The horizon now runs through any block to the weekday after.
  - Tefillin reminders fired on chol hamoed in Israel. Now skipped there and for every nusach but
    Ashkenaz abroad.
  - The scheduler suite ran on the real clock, so it would have failed every Shabbat once nothing
    fires then. It now pins `Date` to a fixed weekday.
  - The schedule stepped in 24-hour device steps, so with the device in another zone than the
    location a DST change could skip a block's last day (no havdalah) and the reader's liturgical
    day could be the wrong one (no spices on a plain motzaei Shabbat). It now steps by the
    location's dates and keys each reminder by its own day.

Still open, deliberately:

- **§2.11 / the second half of §2.8** — completions and notification identifiers still key off the
  device's civil date rather than a halachic day. Changing that key format rewrites every stored
  completion and invalidates every already-scheduled notification id, so it needs a migration
  rather than an edit. The zmanim half of §2.8 is fixed.
- **§7.6** — names are aligned across app.json, the store metadata and the privacy policy, but the
  support/marketing/privacy URLs are still placeholders. No URL can be invented here.
- **§1.4** — a root `ErrorBoundary` now exists, and since 2026-10-09 the consequential failures
  reach the user through the error channel (`src/services/errors.ts` and the banner on home) and
  Sentry (`src/services/crashReporting.native.ts`). The cosmetic `.catch(() => {})` sites still
  swallow, by design.
- **§8.8** — no screen-render tests. That needs `@testing-library/react-native`, which is not
  installed and would need a network install.

## How to read this

Each finding: what is wrong → the concrete scenario that breaks → suggested fix.

- **[verified]** — reproduced by executing code against the repo's own `kosher-zmanim` / `@hebcal/core` / `zustand`, or by reading the installed dependency's source. Not inferred.
- **[plausible]** — the code says what the finding says, but the consequence depends on OS behaviour (iOS notification limits, App Review, font scaling) that cannot be exercised from here.

Findings went through an adversarial verification pass whose default stance was "refuted". Section 9 lists what did **not** survive it, and what is genuinely fine — read it before acting on anything.

---

## TL;DR — the ten that matter

| # | Finding | Where | Severity |
|---|---------|-------|----------|
| 1 | **Hard crash + total notification blackout** for London / Antwerp / Moscow, 31–81 days each summer. One `null` zman throws; nothing catches it | `ZmanimService.ts:8` | Critical |
| 2 | **`skipOn` is ignored on every display surface** — tefillin is shown as an open mitzvah on Shabbat, then marked "Missed" | `buildDayTimeline.ts:50`, `home.tsx:120` | Critical |
| 3 | **`pnpm android` builds a different app** — the on-disk `android/` project is `com.kosherjew.app`, another EAS project, another scheme, name יהודי כשר | `android/app/build.gradle:92` | Critical |
| 4 | **Sefirat HaOmer is one night off** — nothing on night 1; a "count the Omer" reminder *with the bracha* on Shavuot night | `mitzvot.ts:27,256` | Critical |
| 5 | **Maariv / Omer windows end at next-day noon** — an 18-hour window, and a completion after midnight suppresses the *next* night's reminders | `mitzvot.ts:162,256` | Critical |
| 6 | **Shabbat skip is decided with *now's* clock time** — an evening rebuild schedules tefillin for Shabbat morning, or deletes Friday's | `NotificationScheduler.ts:325` | High |
| 7 | **Nothing reschedules on app open** — if background fetch never runs, reminders stop after ~2 days, forever, silently | `NotificationScheduler.ts:330,466` | High |
| 8 | **Home screen's clock is frozen** — countdowns, urgency and the day itself never advance while mounted | `home.tsx:160` | High |
| 9 | **A failed GPS refresh silently replaces the chosen city with Jerusalem** (and flips `inIsrael`) | `LocationService.ts:90` | High |
| 10 | **Infinite render loop** on `/mitzvah/[id]` for any id missing from `activeMitzvot` | `mitzvah/[id].tsx:60` | High |

---

## 1. Crashes and silent total failures

### 1.1 Zmanim throw for high-latitude cities → crash **and** permanent notification blackout **[verified]** — ✅ FIXED
`src/services/ZmanimService.ts:8`, `:87`

> **Fixed 2026-08-09.** `getZmanim` never throws; it returns `Zmanim | null` (null only when the sun neither rises nor sets), with fixed-minute fallbacks for unsolvable depression angles (alot 72 min, misheyakir 52 min before sunrise, misheyakir clamped inside `(alot, netz)`). Every caller handles null; Home shows a `home.zmanimUnavailable` banner. `scheduleAllImpl` isolates each `scheduleOne` in try/catch. A root `ErrorBoundary` is exported from `_layout.tsx`. Verified: all 20 cities across a sampled year → 0 null-zmanim days, 5480 windows, no throw.

`toDate()` throws `Zmanim computation returned null` when a zman is unavailable. `getAlosHashachar()` (16.1° depression) genuinely has no solution near the summer solstice above ~50°N — and three shipped cities are above it.

Measured against the repo's own `kosher-zmanim`, calendar year 2026:

| City | Days `getAlosHashachar()` is `null` | Range |
|---|---|---|
| Moscow | **81** | 2026-05-11 → 2026-07-30 |
| London | **35** | 2026-06-03 → 2026-07-07 |
| Antwerp | **31** | 2026-06-05 → 2026-07-05 |

At Moscow on 2026-06-21 both `getMisheyakir11Point5Degrees()` **and** `getMisheyakir11Degrees()` are `null`, so the `??` fallback on line 88 doesn't save it either.

**Crash path.** `getZmanim` is called synchronously during render in `home.tsx:66`, `schedule.tsx:69/77/93`, `day/[date].tsx:67`, `mitzvah/[id].tsx:42`, and inside `computeStats` (`historyStats.ts:48`). There is **no error boundary anywhere** — `grep -rn "ErrorBoundary\|componentDidCatch\|getDerivedStateFromError" src` returns zero, and expo-router only installs its `Try` boundary when a route module exports `ErrorBoundary`. Worse, `(tabs)/_layout.tsx` sets `lazy: false`, so home + schedule + history all mount at launch and all throw — **the user cannot even switch tabs to reach Settings and change the city.** Redbox in dev, dead root in production, every launch, for weeks.

**Notification path is worse.** `rebuild()` does `await this.cancelAll()` **first**, then schedules. The throw aborts the entire double loop in `scheduleAllImpl` (no per-mitzvah isolation), so the user is left with *zero* pending notifications. `StorageService.set(LAST_REBUILD_KEY, ...)` on line 392 is never reached, so `shouldRunDailyRebuild()` keeps returning `true` and the background task repeats the identical failure every day. Every caller swallows the rejection with `.catch(() => {})`.

Fix — all four are needed:
1. Make `getZmanim` degrade instead of throw: nullable fields, or fixed-minute fallbacks (`getAlos72()`, sunrise − 50 min) when the degree-based getter returns `null`. `ZmanimService` must never throw for a city in `CITIES`.
2. `computeWindow` returns `null` when an anchor zman is missing — every consumer already handles a null window.
3. `export function ErrorBoundary` in `src/app/_layout.tsx` (expo-router picks it up automatically) with a retry and a link to Settings; a second one in `(tabs)/_layout.tsx`.
4. try/catch around each `scheduleOne`, and schedule-then-prune instead of cancel-then-schedule so a failure can never leave the user with less than they had.

### 1.2 Infinite render loop on the mitzvah detail screen **[verified]** — ✅ FIXED (re-opened and fixed 2026-10-09)
`src/app/mitzvah/[id].tsx:60`

> **Re-opened 2026-10-09.** The frozen constant described below was never committed: the selector still
> read `?? { enabled: false }`. The `merge` in `useMitzvotStore` hides it for static ids, but a deleted
> custom mitzvah reached through a notification still in the tray hit the loop. Fixed with
> `selectActive(id)` / `INACTIVE` in `useMitzvotStore.ts`, pinned by `stores.test.ts`.

```ts
const active = useMitzvotStore((s) => s.activeMitzvot[params.id] ?? { enabled: false });
```

The fallback is a **fresh object literal on every call**. Zustand v5 feeds the selector straight into `useSyncExternalStore` with no shallow comparison, so `getSnapshot()` returns a new reference each time → React's store-instance effect sees a changed snapshot → `forceStoreRerender` → loop. React logs *"The result of getSnapshot should be cached to avoid an infinite loop"* and the screen hangs. This hook runs **before** the `if (!mitzvah)` early return at line 86, so the intended "not found" fallback is never reached — the app locks up first.

Two realistic triggers:
- **You ship a new static mitzvah.** Persisted `activeMitzvot` replaces `DEFAULT_ACTIVE` wholesale (see 4.1), so the new id is absent. It still lists in `library.tsx` (`active[item.id]?.enabled ?? false`); tapping it freezes the app.
- **The user deletes a custom mitzvah** and then taps a notification already delivered for it — `notificationResponseHandler.ts:19` pushes `/mitzvah/<deleted-id>`.

Other screens use frozen module constants (`EMPTY_DAY_STATE`, `home.tsx:48`) precisely to avoid this; this call site was missed.

Fix: `const DISABLED = Object.freeze({ enabled: false })` at module scope and reuse it.

### 1.3 A font-loading failure bricks the app — ✅ FIXED
`src/app/_layout.tsx:117`

`useFonts` returns `[loaded, error]`; the error is destructured away. If any of the seven Heebo weights fails, `loaded` stays `false` **forever**: the early return renders a bare `ActivityIndicator`, `SplashScreen.hideAsync()` is never called (it is inside `if (loaded)`), and `initNotificationHandlers()` never runs — so notifications die too. No timeout, no retry, no error UI, no path out. A partial asset bundle after an OTA update, a corrupted cache, or a device out of storage all produce this.

Fix: `const [loaded, fontError] = useFonts(...)` and treat `loaded || fontError` as ready — degrade to system fonts rather than bricking.

### 1.4 No error boundary, 40 swallowed failures — ✅ FIXED (boundary) / PARTIAL (swallowed catches)
`grep -c "\.catch(() => {})" src` → **40**.

The consequential ones:
- `NotificationScheduler.ts:495/507/513/518` — every store-driven `rebuild()`. If scheduling throws, the user stops receiving reminders forever, with no signal.
- `onboarding/ready.tsx:19` — the initial rebuild at the end of onboarding.
- `home.tsx:167/175/181` — `markDone` / `markSkipped` / `unmark`. A failed write is indistinguishable from a successful one.
- `settings.tsx:77/80` — enabling/disabling notifications.

Update 2026-10-09: the notification subsystem now has a user-visible error path (`src/services/errors.ts`, shown as a banner on home) and a crash reporter (Sentry, `src/services/crashReporting.native.ts`). When this was written it had neither.

Fix: keep the swallow for cosmetics (haptics, `openSettings`); persist a `lastScheduleError` in the user store and render it as a banner on Home/Settings.

---

## 2. Halachic correctness

### 2.1 `skipOn` is honoured by the scheduler and history — and ignored by everything the user looks at **[verified]** — ✅ FIXED
`src/utils/buildDayTimeline.ts:50`, `src/app/(tabs)/home.tsx:120`

> **Fixed 2026-08-09.** The two divergent copies of the predicate were collapsed into `src/utils/skipRules.ts`, now used by the scheduler, `buildDayTimeline`, `home.tsx` and `historyStats`. Home also drops skipped mitzvot from the progress denominator, so Shabbat no longer reads "5/6" when everything applicable is done. New `src/utils/__tests__/skipRules.test.ts` asserts cross-surface agreement; removing the timeline check makes its tests fail. (The instant the predicate is evaluated at was then corrected in §2.6.)

Three consumers decide whether a mitzvah applies to a day. `NotificationScheduler.shouldSkip()` (`:93`) and `historyStats.shouldSkip()` (`:14`) both check `skipOn`. **`buildDayTimeline()` has no skip check at all**, and `home.tsx`'s current/upcoming/missed loop has none either — the only gate is `if (!window) continue`, and tefillin's `misheyakir → shkia` window is perfectly non-null on Saturday.

Default install, Jerusalem, Shabbat morning: Home lists **הנחת תפילין** under "רלוונטי עכשיו" with a live countdown, prompting the user to lay tefillin on Shabbat. After shkia it moves to "פספסתי". Schedule and the day view render it in red as "לא בוצע". Meanwhile the scheduler correctly sent nothing and History correctly excluded it — so three surfaces contradict each other. Same on every Yom Tov, and for any custom mitzvah where the user turned on "דלג בשבת".

Fix: the predicate is already duplicated in two places with different signatures. Collapse to one `shouldSkip(mitzvah, date, location)` helper and apply it in `buildDayTimeline` and in `home.tsx` — so a future skip context can never again be honoured on only some surfaces.

### 2.2 Sefirat HaOmer is one night off **[verified]** — ✅ FIXED
`src/data/mitzvot.ts:27` (`omerDayFor`), `:256` (`computeWindow`)

> **Fixed 2026-08-09.** `omerDayFor` is now anchored to the evening: night 1 on the evening of 15 Nisan, night 49 on the evening of 4 Sivan. The Shavuot-night window disappears on its own — greg(5 Sivan) now falls outside the range, so no separate guard is needed. The window also ends at the next day's alot hashachar instead of next-day noon. Three existing tests encoded the old daytime pairing and were rewritten to the night convention; new test `3.12b` pins both ends of the count, and `3.7b` pins the window end.

`omerDayFor` is a **daytime** value — it maps a Gregorian date to the count that applies during that day. But `computeWindow` pairs it with a **night** window (`tzeit(D) → chatzot(D+1)`), and the night beginning at tzeit of day D belongs to the *next* Hebrew day. The whole 49-night series is shifted one night late.

Measured for 5786 (Asia/Jerusalem):

| Gregorian | Hebrew (daytime) | `omerDayFor` | Reality for that night |
|---|---|---|---|
| Thu 2026-04-02 | 15 Nisan | `null` → **no window** | Omer **night 1** — no reminder, and History doesn't even count it as eligible |
| Fri 2026-04-03 | 16 Nisan | `1` | actually night 2 |
| Wed 2026-05-20 | 4 Sivan | `48` | actually night 49 (last) |
| Thu 2026-05-21 | 5 Sivan | `49` → window exists | **first night of Shavuot — nothing to count** |

The reminder carries `includeContentInBody: true` with the `blessing` content block, so the Shavuot-night notification delivers *"אשר קדשנו במצוותיו וצוונו על ספירת העומר"* — a bracha levatala. `sefirat_haomer` also has `skipOn: []`, so Yom Tov doesn't suppress it.

Fix: gate the *night* window on `HDate(15 Nisan) … HDate(4 Sivan)` (equivalently evaluate `omerDayFor(date + 1 day)`), and add an explicit end-of-Omer guard.

### 2.3 Maariv and Omer windows end at next-day **midday** **[verified]** — ✅ FIXED
`src/data/mitzvot.ts:162`, `:256`

> **Fixed 2026-08-09.** Added `Zmanim.chatzotLayla` from kosher-zmanim's `getSolarMidnight()` (verified at `chatzot + 12.003 h`, already on the next civil date, and DST-safe because it is an instant rather than wall-clock arithmetic). Maariv is now `tzeit → chatzot halayla`; Sefirat HaOmer is `tzeit → next day's alot`. Measured, Jerusalem 2026-01-15: maariv **17:29:36 → 23:48:31 (6.32 h)**, down from 18.31 h ending at 11:48 the next morning. Omer night 11: 19:36 → 04:58 (9.37 h). Test `3.7` asserted only `end > start` — which the 18-hour window satisfied — and now pins the exact end and bounds the length.

```ts
const end = new Date(zmanim.chatzot);
end.setDate(end.getDate() + 1);
```

`zmanim.chatzot` is `getChatzos()` — solar **midday**. Adding a day gives next-day midday, not chatzot halayla.

Measured, Jerusalem 2026-01-15: window = `17:29:36` → `Fri 11:48:20` — **18.3 hours**, ending 6½ hours *after* the next morning's alot. Halachically maariv ends at chatzot halayla (~23:43 that night), b'dieved at alot; never into the following morning.

Consequences:
- At 23:00 Home shows maariv with ~12h49m remaining and a nearly-full ribbon instead of ~48 minutes. `urgent` (≤45 min) can never fire.
- The detail screen prints the window as "20:00 – 12:44".
- Any `anchor: 'end'` reminder the user adds is scheduled for **noon the next day** — telling them to daven maariv during shacharit time.
- **The worst one:** a user who davens maariv at 00:30 and taps done writes to *Monday's* key (`markDone` defaults to `new Date()`). Monday evening `scheduleOne` sees `isDone(maariv, Monday) === true` and schedules **no maariv reminders for Monday night** — silently skipping a mitzvah they haven't done.

Fix: `chatzot + 12h` (or `getSolarMidnight()`), lenient bound = next day's `alotHaShachar`. Same for `sefirat_haomer`, where the correct outer bound is alot. Also stop using `Date.setDate` here — it preserves wall-clock across the Israeli DST switch and silently yields a 23h/25h span.

### 2.4 Hebrew date is one day behind after shkia **[verified]** — ✅ FIXED
`src/services/HebcalService.ts:14`

> **Fixed 2026-08-09.** Split into two functions for two different questions: `getHebrewDateAt(instant, loc)` advances at shkia and is used for "today" (home header, `HebrewDate`), while `getHebrewDate(date)` keeps the civil day's daytime date for calendar grids. Verified: 2026-04-09 21:30 now renders `כ״ג נִיסָן` (was `כ״ב נִיסָן`).

`new HDate(date)` maps a Gregorian day and ignores nightfall. Measured Thu 2026-04-09 21:30 → app renders `כ״ב נִיסָן`; correct after tzeit is `כ״ג נִיסָן`. This string is the **main title of the home screen** (`home.tsx:93`), and appears in `HebrewDate.tsx` and the month grid.

Fix: advance the Hebrew date once the instant is past tzeit for the selected location.

### 2.5 `isYomTov` has no nightfall boundary — ✅ FIXED
`src/services/HebcalService.ts:73`

> **Fixed 2026-08-09.** Both `isShabbat` and `isYomTov` now derive from one `hebrewDaysAt(instant, loc)` primitive instead of each hand-rolling its own boundary: the Hebrew day turns over at shkia, and during bein hashmashot both candidate days are returned so an observance counts if either carries it — exactly the shkia-in / tzeit-out stringency `isShabbat` had encoded by hand. Verified on erev Pesach (shkia 18:58): `isYomTov` flips false → true across shkia, and a mitzvah window starting after it is now skipped. Every existing `isShabbat` test still passes against the rewritten implementation.
>
> Two tautological tests guarding this code were replaced: `2.5` (`expect(typeof result).toBe('boolean')`) now asserts real Yom Tov / chol hamoed values, and `mitzvotExtras` `16.2` now pins the `il` flag — 16 Nisan is chol hamoed in Israel and second-day Yom Tov in chu"l. Part of §8.3.

`isShabbat` correctly checks shkia (Friday) and tzeit (Saturday); `isYomTov` is pure Gregorian-day. So on erev Yom Tov after nightfall the app still schedules `tefillin` (`skipOn: ['yomtov']`), and on motzaei Yom Tov after tzeit it still suppresses it. The same asymmetry is baked into `historyStats.shouldSkip`.

Fix: give both the same treatment, ideally via one `halachicDayFor(instant, location)` helper.

### 2.6 Shabbat / Yom Tov skip is decided using *now's* clock time **[verified]** — ✅ FIXED
`src/services/NotificationScheduler.ts:325`

> **Fixed 2026-08-09.** The skip is now judged at the mitzvah window's own `start` instant (`isSkippedAt`), after `computeWindow`, on every surface — so the answer no longer depends on when the caller asks. This also fixes two cases civil-day granularity would have missed: a Friday-*evening* window (already Shabbat) is now correctly skipped, and a Shabbat mitzvah no longer reappears as "missed" after tzeit on motzaei Shabbat. Regression tests `6.13` / `6.13b` cover both directions from this finding and both fail on the old code.
>
> Note the tests had to use *future* weekdays computed from `Date.now()`: `scheduleOne` compares triggers against the real clock, so fixed past dates would have made them pass for the wrong reason — the same trap as `6.7` in §8.8.

```ts
const today = new Date(fromDate);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);   // still carries the CURRENT wall-clock time
```

`shouldSkip` feeds that instant to `HebcalService.isShabbat`, which is deliberately instant-sensitive. So whether tomorrow "is Shabbat" depends on **what o'clock the rebuild happened to run** — and rebuilds fire from five store subscriptions, `unmark`, onboarding, and a background task whose only gate is "after 00:15".

Measured, Jerusalem winter (Fri 2026-01-16 shkia 16:58:39; Sat 2026-01-17 tzeit 17:31:17):
- **Reminder fires on Shabbat.** Rebuild Friday 20:00 → `tomorrow` = Sat 20:00, past tzeit → `isShabbat = false` → all three tefillin reminders are scheduled for Shabbat, the first at misheyakir. The phone alerts on Shabbat — exactly what `skipOn` exists to prevent.
- **Reminder silently lost.** Rebuild Thursday 20:00 → `tomorrow` = Fri 20:00, past Friday's shkia → `isShabbat = true` → Friday morning's tefillin reminders are never scheduled.

The 00:15 daily rebuild lands on the safe side of both boundaries, which is precisely why the existing test (Saturday 03:00Z) passes and hides this.

Fix: normalise each scheduled day to local noon before the skip check, or add a day-granular `isShabbatDay`. Keep the instant-sensitive `isShabbat` for "is it Shabbat right now" UI only.

### 2.7 GPS inherits the nearest city's `tz` and `inIsrael` **[verified]** — ✅ FIXED
`src/services/LocationService.ts:81`

```ts
const city = nearestCity(lat, lng);
return { location: { ...city, lat: coords.latitude, lng: coords.longitude }, ... };
```

Only lat/lng are replaced. `tz`, `inIsrael`, `elevation` and `name` come from the nearest of 20 hardcoded cities.

- **Wrong timezone:** Chicago → New York (1h error on every zman). Denver → Los Angeles. Buenos Aires → Miami.
- **Wrong `inIsrael`, which is worse:** Johannesburg — a large community, not in `CITIES` — resolves to **Eilat** → `inIsrael: true`. That flag is what reaches hebcal as `il`. **Second-day Yom Tov disappears**: for 2026-04-03 (2nd day Pesach in chu"l) `isYomTov` returns `false`, `shouldSkip` lets tefillin through, and "הגיע זמן הנחת תפילין" fires on Yom Tov. Same for 2nd day Shavuot (2026-05-23) and Sukkot (2026-10-04). Parasha follows the Israeli schedule; candle lighting uses 18 min instead of 20. Cairo and Amman resolve the same way.
- There is **no user override**: `settings.tsx` never calls `setInIsrael`, and `setLocation`/`setLocationState` force `inIsrael: l.inIsrael`.

Fix: take the device zone for `tz`, derive `inIsrael` from the coordinates, drop the inherited elevation when the nearest city is >~25 km away, label it "מיקום נוכחי" rather than a wrong city name, and expose an explicit "אני בארץ ישראל" switch wired to `location.inIsrael`.

### 2.8 The calendar day is resolved in the **device** zone, never the location's **[verified]** — ✅ FIXED (zmanim) / PARTIAL (completion keys)
`src/services/ZmanimService.ts:31`

`cal.setDate(date)` hands kosher-zmanim a JS `Date`; its `setDate` materialises it via `DateTime.fromJSDate(date)` — the **system** zone — and `setGeoLocation` is never called afterwards to re-zone it. So the Y/M/D given to the solar calculator is the device's date while `loc.tz` describes somewhere else. `dateKey()` (used for completions and notification identifiers) has the same device-local basis.

> Verification note: the cache is **not** corrupted by this. `cacheKey` uses the same device-local getters, so key and computation always agree — an earlier claim that the cache serves the wrong day was tested and **refuted**. The defect is the day resolution itself.

Failure scenario: a user in New York with ירושלים selected (a first-class flow — `settings.tsx:202`, `onboarding/location.tsx:54`), at 20:00 NY on 9 Aug = 03:00 Jerusalem on 10 Aug. The app computes **9 Aug** Jerusalem zmanim — all already past. `home.tsx:137` pushes every enabled mitzvah into `missedItems`: the whole day reads as missed and "relevant now" is empty. `scheduleOne`'s `if (trigger <= now) continue` drops every reminder for that day. The bad window is `|deviceOffset − locOffset|` hours wide every evening.

Fix: `const zoned = DateTime.fromJSDate(date).setZone(loc.tz); cal.setDate(zoned)` (kosher-zmanim's `setDate` accepts a Luxon `DateTime` and keeps its zone); key the cache on `zoned.toISODate()`; give `dateKey()` the same treatment so completions bucket by the same day the zmanim do.

### 2.9 Candle lighting: Friday only; havdalah: Saturday only — ✅ FIXED (candle lighting 2026-10-04, havdalah 2026-10-06; see Status)
`src/data/mitzvot.ts:203`, `:226`

`candle_lighting.computeWindow` returns `null` unless `date.getDay() === 5`. So there is **no Erev Yom Tov candle lighting at all**, no second-night lighting in chu"l, and no havdalah at the end of a Yom Tov that isn't Saturday.

- Sukkot 5787 begins the evening of **Sunday** 2026-09-27 → no reminder.
- Pesach 5786 begins the evening of **Wednesday** 2026-04-01 → no reminder.
- Rosh Hashana 5787 happens to fall on a Friday and works by accident.

`havdalah` additionally hardcodes an arbitrary 90-minute window.

`ZmanimService.getCandleLighting` accepts `isErevYomTov` and `minutesBefore` and `getHavdalah` exists — **neither is called anywhere in app code**. The Yom Tov branch was designed and never wired up.

Also: all of Israel uses 18 minutes. Jerusalem's near-universal minhag is **40 minutes** — and Jerusalem is `CITIES[0]`, the default location.

Fix: gate on the calendar (`isYomTov(nextDay) || isFriday`), route through the already-written service methods so `isErevYomTov`/`minutesBefore` stop being dead parameters, and add a per-city / user-configurable minutes-before value.

### 2.10 A reminder's text contradicts when it fires — ✅ FIXED
`src/data/mitzvot.ts:66`

`{ anchor: 'end', offsetMin: -45, label: 'נותרה שעה להנחת תפילין' }` — fires at `end − 45 min` but promises an hour. Every sibling is consistent (shacharit `-45`/"נותרו 45 דק'", mincha `-60`/"נותרה שעה", krias shma `-30`/"נותרו 30 דק'"), so this is a transcription slip. No `bodyVariants`, so the label is delivered verbatim: Jerusalem mid-December the notification arrives 15:54 saying an hour remains; shkia is 16:39. The user misses the zman by 15 minutes, in every city, all year.

Fix: `-60`, or reword. A registry test asserting duration-mentioning `end` labels match `|offsetMin|` would keep this honest.

### 2.11 Sunset-crossing windows are filed on the wrong day — ⚠️ OPEN (deliberate)
`src/stores/useCompletionsStore.ts:28`

`dateKey()` is the device-local Gregorian date, but maariv and Sefirat HaOmer deliberately cross midnight. `buildId` and the payload `dateKey` come from the day the window was *computed for*, while `buildTriggerTime` can land on the next civil day. The reminder fires next morning, "עשיתי" writes yesterday's key, every screen reads today's. Maariv still shows outstanding, the day count is wrong, and `cancelForMitzvah` cancels the wrong day. See also 2.3 for the inverse (a completion suppressing the *next* night).

Fix: a `halachicDateKey(instant, location)` for completions, with `dateKey` kept only for UI grouping; or clamp reminder triggers to the mitzvah's own civil day.

---

## 3. Notification engine

### 3.1 Nothing reschedules on app open **[verified]** — ✅ FIXED
`src/services/NotificationScheduler.ts:330`, `:466`, `src/app/(tabs)/home.tsx:213`

The horizon is today + tomorrow. The **only** time-driven refresh is the `expo-background-fetch` daily task. Every other rebuild is state-change driven. `initNotificationHandlers()` never calls `scheduleAll`/`rebuild`, and the single `AppState 'active'` handler only syncs permission and dismisses tray items.

On iOS, `expo-background-fetch` uses the legacy opportunistic `setMinimumBackgroundFetchInterval`: iOS runs **no** background refresh for an app the user force-quit, nor with Background App Refresh off, nor under Low Power Mode. Android Doze and OEM battery managers do the same after a force-stop.

Failure scenario: user finishes onboarding Monday (Mon + Tue scheduled), swipe-kills the app as many people habitually do. Tuesday's reminders fire. **From Wednesday onward: silence, forever.** The user opens the app daily and Home renders correct windows, so the app looks perfectly healthy. Recovery requires them to notice the silence and go poke a setting.

Fix: call `rebuild()` from `initNotificationHandlers` when onboarded, and from the `AppState 'active'` handler when `shouldRunDailyRebuild()`. Treat background fetch as an optimization, never as the only path. Optionally surface `BackgroundFetch.getStatusAsync() !== Available` in Settings.

### 3.2 Concurrent rebuilds are dropped, not queued **[verified]** — ✅ FIXED
`src/services/NotificationScheduler.ts:342`

```ts
async withLock(task) { if (this.inFlight) return this.inFlight; ... }
```

The second caller gets the **already-running** promise; its task body never executes. `rebuild()` reads its inputs (`enabledMitzvot()`, location, settings) *inside* the locked task, so a change landing after that read is never observed. A rebuild is 20–40 sequential native round-trips — hundreds of milliseconds of exposure.

And it cannot self-heal that day: the in-flight rebuild writes `LAST_REBUILD_KEY = today` (`:392`), so `shouldRunDailyRebuild()` returns `false` and the 00:15 task also skips.

Concrete: toggle three mitzvot in the Library in about a second. Only the first is scheduled. B and C are enabled and persisted in the UI with **zero reminders until the next calendar day**. Same for a location change made while a completion-triggered rebuild runs — reminders stay on the previous city's zmanim while Settings shows the new one.

> Test `6.11` (`NotificationScheduler.test.ts:370`) asserts this coalescing **as correct behaviour**. That is why the suite is blind to it.

Fix: trailing-edge coalescing — set a `dirty` flag when entering while busy and re-run once after the current run settles. Also stop writing `LAST_REBUILD_KEY` from state-driven rebuilds.

### 3.3 Granting permission after an initial denial never schedules anything **[verified]** — ✅ FIXED
`src/services/NotificationScheduler.ts:492`

`hasNotificationPermission()` gates scheduling on `notificationPermission !== 'denied'`. The `useUserStore.subscribe` handler reacts to `notificationsEnabled`, `location`, `nusach`, `halachicOpinions`, `inIsrael` — **`notificationPermission` is not in the list**.

User denies at onboarding. Home shows the red banner which, when tapped, opens OS settings (`home.tsx:246`) — the app explicitly invites this recovery. They enable notifications and return. `AppState 'active'` → `syncNotificationPermissionStatus()` sets `'granted'`, the banner disappears, **the UI says everything is fine and nothing is scheduled**. `notificationsEnabled` already defaults to `true`, so the Settings toggle can't trigger a rebuild without an OFF→ON cycle. Combined with 3.1, on iOS this can mean never.

Fix: rebuild on the `unknown|denied → granted` transition.

### 3.4 Android notifications never use the configured channel **[verified]** — ✅ FIXED
`src/services/NotificationScheduler.ts:209`

`ensureAndroidChannel()` creates a `'default'` channel (name מצוות, HIGH importance, custom vibration, gold LED, `lockscreenVisibility: PUBLIC`) — but `scheduleOne` never passes `channelId`, and the **trigger** is where expo-notifications reads it (`expo-notifications/build/scheduleNotificationAsync.js:147`). With no channel resolved, everything lands on expo's auto-created fallback channel.

On every Android device: the user sees a channel named **"Miscellaneous"** in app notification settings instead of מצוות; the vibration pattern, LED colour and `PUBLIC` lockscreen visibility never apply (so on a lock screen set to hide sensitive content the reminder body is hidden); and any per-channel customisation they make has no effect.

Fix: `trigger: { type: SchedulableTriggerInputTypes.DATE, date: trigger, channelId: 'default' }`, plus a test asserting the field is present.

### 3.5 `IOS_MAX` is declared, exported, and never enforced — and the fallback guard is dead code **[verified code, plausible consequence]** — ✅ FIXED
`src/services/NotificationScheduler.ts:21`, `:330`

`grep -rn IOS_MAX src` → only the declaration, the re-export, and two identical dead lines in the web shim.

The only nominal guard is `pending.length > PENDING_LIMIT ? [today] : [today, tomorrow]` — and **in production it can never fire**: `scheduleAll()` has no app caller (only tests), and `rebuild()` runs `await this.cancelAll()` immediately before, so `getAllScheduledNotificationsAsync()` always returns `[]` and `days` is always both days.

Overflow arithmetic: 10 static mitzvot ≈ 18 reminders/day, plus ~5 custom mitzvot × 3 reminders (`custom-mitzvah.tsx` caps neither) = 33/day = **66 requests over the 2-day horizon**. iOS keeps the 64 soonest and discards the rest. Because the loop is day-major, the discarded ones are **tomorrow's** — and nothing ever re-schedules them (3.1).

*Plausible, not verified:* the exact iOS discard behaviour can't be exercised from here.

Fix: count as you schedule, stop at `IOS_MAX − headroom`, order chronologically rather than day-major.

### 3.6 Reminders can be scheduled outside their own window — ✅ FIXED
`src/services/NotificationScheduler.ts:186`, `src/components/ReminderEditor.tsx:39`

`scheduleOne` only checks `trigger > now`; it never checks the trigger falls inside `[window.start, window.end]`. `ReminderEditor.save()` does `offsetMin: Number(offsetMin) || 0` with **no bounds check and no error state** — the ±5 steppers are unbounded and the field is free-form.

A user taps "+5" a dozen times too many (or types 5000). The list shows "הוסף תזכורת · +5000 דק׳", looking valid. Since the scheduler only ever covers today+tomorrow and `rebuild()` cancels everything at each 00:15 rebuild, that reminder is re-derived and re-cancelled every night and **can never be delivered, forever, with no feedback**.

The blank-label path is its own bug: `label: label.trim() || t('detail.addReminder')` persists the literal call-to-action string, so the notification body reads "הוסף תזכורת".

Fix: clamp to a deliverable range and block Save with an inline error outside it; default a blank label to the mitzvah name. The detail screen already computes `nextTrigger` — surface "this reminder will never fire".

### 3.7 Notifications are Hebrew-only **[verified]** — ✅ FIXED
`src/services/NotificationScheduler.ts:193`, `:119`, `:136`

`grep -n "language|name.en|from '@/i18n'" src/services/NotificationScheduler.ts` → **zero matches**. The scheduler has no language plumbing at all:
- title uses `mitzvah.name.he` even though every static mitzvah has a populated `name.en`
- the mark-done button is the literal `'עשיתי'`
- the Android channel name is the literal `'מצוות'` — visible forever in Android system settings
- `pickBodyForReminder` builds the body from Hebrew-only `label`/`bodyVariants`, then appends `block.he` while ignoring `block.en`

These are the **only three hardcoded Hebrew strings left in the codebase** (verified by a full Hebrew-character scan of `src/` outside `i18n/` and `data/`). An English user gets an unreadable notification and an unreadable action button.

### 3.8 Skipped mitzvot are not dismissed, only completed ones — ✅ FIXED
`src/services/NotificationScheduler.ts:290` vs `:274`

`shouldSuppressForCompletion` and `scheduleOne` both treat done and skipped identically. `dismissCompletedPresentedNotifications` checks only `isDone`. A 07:00 tefillin reminder fires while the phone is locked; at 08:00 the user picks "דלג להיום". Future reminders are cancelled, but the presented notification stays in the tray forever, and every subsequent foreground re-runs the dismissal and skips it.

Fix: one shared `isResolved(mitzvahId, date)` predicate for all three call sites.

### 3.9 Cold-start navigation from a notification tap may be swallowed — ✅ FIXED
`src/services/notificationResponseHandler.ts:19`

`router.push` is called from the response listener. When the app is launched *by* the tap, the listener can fire before the router tree is mounted and expo-router drops the navigation. There is no pending-deep-link buffer.

### 3.10 A killed-app "עשיתי" tap is silently dropped — the background tasks are never defined in headless JS **[verified]** — ✅ FIXED
`package.json` (`"main": "expo-router/entry"`), `src/services/NotificationScheduler.ts:516`, `:528`

> **Fixed 2026-08-10.** The bundle entry is now a root `index.js` that imports `expo-router/entry` and then `src/services/NotificationScheduler`, so both `defineTask` calls run on every bundle load, headless included. Pinned by `src/services/__tests__/backgroundTaskEntry.test.ts`. Ships over OTA — the entry is part of the JS bundle.

Both `TaskManager.defineTask` calls sit at the module scope of `NotificationScheduler.ts`, which is imported only by route modules (`_layout.tsx`, home, settings, onboarding) and by lazy `require()`s inside store actions. expo-router loads route modules at render time. A headless launch evaluates only the entry graph and renders nothing — so neither task was ever defined there, and expo-task-manager logs *"Task "jew-in-time-notification-actions" has been executed but looks like it is not defined"* and drops the event.

Headless is exactly how Android delivers a MARK_DONE tap when the app process is dead: `ExpoHandlingDelegate.handleNotificationResponse` → `runTaskManagerTasks` → JobScheduler → TaskService boots headless JS (verified in the installed expo-notifications 0.32 source). The trap is invisible because the config-plugin receiver (`MitzvahNotificationService`) dismisses the tray notification *before* delegating — the tap looks successful, but `markDone` and `cancelForMitzvah` never run: the mitzvah stays unmarked and the rest of that day's reminders for it keep firing. With the app alive the JS listener path handles the tap correctly, which made the failure look random. Android's pending-response replay (delivered when a listener attaches in the same process) sometimes rescued a tap if the app was opened moments later — more randomness. The same gap killed `jew-in-time-daily-rebuild` in the killed state, leaving `refreshSchedulingOnForeground` as the only working day-rollover path.

---

## 4. State and persistence

### 4.1 No `version` / `migrate` on any persisted store **[verified]** — ✅ FIXED (migrate added 2026-10-09)

> **Re-opened 2026-10-09.** `version` and `merge` existed, `migrate` did not: zustand drops the whole
> persisted state when the stored version differs and no `migrate` is given, so the first bump would
> have erased completions and re-run onboarding. Every store now passes the identity `migrate` from
> `persistOptions.ts`, pinned per store by `stores.test.ts` and `taharahStore.test.ts`.
`useUserStore.ts:90`, `useMitzvotStore.ts:75`, `useCompletionsStore.ts:117`, `useCustomMitzvotStore.ts:36`

All four pass only `{ name, storage }`. Zustand's default merge is a **single-level spread** (`{...currentState, ...persistedState}`, `middleware.js:335`).

> Verified nuance: a brand-new **top-level** field *is* handled fine — `currentState` supplies keys the persisted blob lacks. The real gaps are nested.

- **Shipping a new mitzvah will not reach existing users.** `DEFAULT_ACTIVE` is only the initial value of the single top-level `activeMitzvot` key; a persisted map replaces it wholesale, so the new id is simply absent. `active[m.id]?.enabled` is `undefined`, and tapping it in the Library triggers the infinite loop of 1.2.
- **City data is frozen per user.** `useUserStore.location` is a deep snapshot of a `CITIES[i]` entry with no stable id (`types/zmanim.ts` has only `name`). `findCityByName` exists in `cities.ts:26` with **zero callers**. Correct a latitude, timezone or elevation in a future release and it never reaches anyone who already picked that city — with no in-app way to notice or repair short of a full reset. Six of the twenty entries carry `elevation` and fourteen do not.
- Any future nested shape change (e.g. expanding `halachicOpinions`) hydrates old objects into new code paths unchecked.

Fix: add `version` + `migrate` to every store **now**, even as an identity migration, so a future change has somewhere to live. Union persisted `activeMitzvot` with `DEFAULT_ACTIVE`. Give `Location` a stable `id` and persist `{ locationId, overrides }`, re-resolving from `CITIES` at read time.

### 4.2 A corrupt persisted value looks exactly like a fresh install **[verified]** — ✅ FIXED
`src/services/StorageService.ts:28`

`createZustandStorage().getItem` returns the raw string; `JSON.parse` happens inside zustand's `createJSONStorage` (`middleware.js:286`), and `persistImpl` wraps hydration in `toThenable` (`:305`), whose catch branch short-circuits every downstream `.then` (`:389`). Only the terminal `.catch` runs, and it does nothing because no store passes `onRehydrateStorage`. So a truncated blob produces **no error, no warning, and no state change** — the store keeps its defaults, `hasHydrated()` stays `false`, and the corrupt bytes stay on disk to fail identically next launch. Nothing in the repo reads `hasHydrated` / `onRehydrateStorage`. (`StorageService.get` *does* guard with try/catch — the asymmetry is real.)

If `user-store` is the corrupt one, `isOnboarded` is `false` and `_layout.tsx:77` throws the user back into **onboarding as if freshly installed**, with location reset to Jerusalem and language to Hebrew. If `completions-store` is corrupt, the entire history and streak silently read as empty.

Fix: `onRehydrateStorage: () => (_state, error) => { if (error) storage.delete(name); }` on each `persist()`; optionally gate the onboarding redirect on `hasHydrated()`.

### 4.3 `AppResetService` re-arms the notifications it just cancelled — with Jerusalem defaults **[verified]** — ✅ FIXED
`src/services/AppResetService.ts:12`

`reset()` awaits `cancelAll()` **first**, then resets the stores. The `useUserStore` subscription from `initNotificationHandlers` is still live (never unsubscribed — 5.6), and `useUserStore.reset()` allocates a **fresh** `halachicOpinions: { ksSofZman: 'GRA' }` literal every call, so `state.halachicOpinions !== prev.halachicOpinions` is **always** true → `rebuild()` fires unconditionally. It passes `hasNotificationPermission()` because reset sets `notificationPermission: 'unknown'` and `notificationsEnabled: true`. `reset()` doesn't await it.

A New York user taps "Reset app", is routed to `/onboarding`, abandons it. OS notification permission is of course still granted. Within a second the device has two days of reminders scheduled for the six default mitzvot at **Jerusalem** zmanim, for a profile that was just deleted. Nastier variant: reset while an earlier rebuild is in flight — reset's own rebuild is dropped by `withLock` while the pre-reset rebuild keeps scheduling from its captured pre-reset list, so the "reset" leaves the **old** profile's notifications armed.

Secondary: the rebuild's `LAST_REBUILD_KEY` write lands **after** `storage.clearAll()`, leaving a key behind the supposed full wipe.

Fix: reset the stores first, then `await cancelAll()`, then `clearAll()`. Add a `resetting` guard the subscriptions check, and explicitly delete `LAST_REBUILD_KEY`.

### 4.4 Completions grow forever, including empty days **[verified]** — ✅ FIXED
`src/stores/useCompletionsStore.ts:21`, `:47`, `:78`

`markDone` unconditionally writes `skipped[key] = removeDailyMark(s.skipped[key], id)`; when nothing was ever skipped that day, `removeDailyMark(undefined, id)` returns `{}` — so a `"YYYY-MM-DD": {}` entry is created in `skipped` for **every day the user marks anything done**. `markSkipped` does the mirror. `unmark` writes both maps unconditionally. There is no pruning, retention window, or migration; `reset()` is the only thing that ever shrinks them. Zustand persist re-serialises the whole store on every `set`.

Measured for a user completing the six defaults daily: ~67 KB after 1 year, ~202 KB after 3, ~337 KB after 5, ~674 KB after 10 — of which ~57 KB at 10 years is pure `"2031-04-07":{}` noise. Every "mark done" tap in year 5+ synchronously stringifies ~340 KB on the JS thread (≈1.75 ms on desktop V8, a multiple of that on Hermes) — right inside the completion animation. Cold start pays the matching parse before the first frame.

Fix: only write the sibling map when it actually changes, drop empty day buckets, and prune beyond the window the UI can show (`computeStats` only ever reads `daysBack = 30`).

### 4.5 Double work on every completion — ✅ FIXED (second half 2026-10-09)

> **Re-opened 2026-10-09.** `CompletionService.markDone` / `markSkipped` still awaited their own
> `cancelForMitzvah` after the store action had queued the same call. Removed; `services.test.ts` 5.2
> now pins one call, not only the arguments.
`src/services/CompletionService.ts:5` and `src/stores/useCompletionsStore.ts:52`

`CompletionService.markDone` calls `cancelForMitzvah`, and the store action *also* queues it via `queueMicrotask` + `require()`. Both run. `unmark` triggers two `rebuild()` calls, the second of which is silently dropped by `withLock` — correct only by accident.

---

## 5. Screens and UX

### 5.1 The home screen's clock is frozen **[verified]** — ✅ FIXED
`src/app/(tabs)/home.tsx:160`

`const now = new Date()` lives inside a `useMemo` whose deps contain no time value. `grep -rn "setInterval|useFocusEffect|useIsFocused|requestAnimationFrame" src` returns **zero matches across the entire source tree**. The `AppState 'active'` handler only calls two async services, neither of which touches a memo dependency, so it produces no re-render. `(tabs)/_layout.tsx` sets `lazy: false` + `freezeOnBlur: true`, so Home mounts at launch and stays mounted.

Everything time-derived is pinned to the last dependency change: `timeLeft`, `pct`, `urgent` (the 45-minute red state), the current/upcoming/missed partition, and `todayKey`.

- Open at 07:10, see "שחרית — 1:45 שעות נותרו". Return at 14:00: still "1:45 שעות", still under "רלוונטי עכשיו", still a nearly-full green ribbon, hours after sof zman tfila. "פספסתי" stays empty. Nothing recovers until an unrelated store write, at which point the whole list snaps forward.
- **Across midnight it is worse.** `todayKey` stays on yesterday, so yesterday's completions render as today's. Tapping ✓ then writes to the *real* today's key while the list was rendered from the old one — so the tapped item does not disappear.

Same staleness in `day/[date].tsx:96` (`Date.now()` in render) and `schedule.tsx:105` (`highlightIndex`).

Fix: a `tick` state on a 30–60 s interval, bumped also from the `AppState 'active'` handler, included in the memo deps and used to derive `todayKey`. Align the interval to the minute boundary so midnight rollover lands on time.

### 5.2 Completions are dropped and lost **[verified]** — ✅ FIXED
`src/app/(tabs)/home.tsx:162`, `:203`

Two separate bugs in one handler:
- `if (stampingId) return;` drops every tap during the 1300 ms stamp animation — **with no haptic, no visual feedback, and no queue**. Working down the morning list tapping tefillin, tzitzit and krias shma in about a second records only tefillin. The user believes all three registered; the other two stay in "רלוונטי עכשיו" and their remaining notifications are never cancelled.
- The actual persist is deferred behind that 1300 ms `setTimeout`, and the unmount cleanup **clears it**. Navigate away or switch tab during the animation and a completion the user watched get stamped is silently discarded.

Fix: call `markDone` immediately and let the stamp be purely cosmetic; track stamping per-id so concurrent completions each animate.

### 5.3 A failed GPS refresh silently overwrites the chosen city **[verified]** — ✅ FIXED
`src/services/LocationService.ts:90`, `src/app/(tabs)/settings.tsx:59`, `src/app/onboarding/location.tsx:20`

`getCurrentLocation()` returns `CITIES[0]` (Jerusalem, `inIsrael: true`) as the resolution object on **every** failure path — denied, missing, and timeout. Both callers write it straight into the store without checking `resolved.status`, and `setLocationState` also sets `inIsrael: l.inIsrael`. A failed refresh is indistinguishable from a successful relocation to Jerusalem, with no confirmation and no undo.

A Lakewood user who picked לייקווד taps "use current location" indoors; the 10 s timeout fires. Their location silently becomes Jerusalem: every zman shifts ~7 hours, candle lighting switches from the 20-minute to the 18-minute rule, second-day Yom Tov disappears, and `useUserStore.subscribe` fires a full `rebuild()` so every reminder is now on Jerusalem times. The only feedback is a one-line toast. For `status: 'denied'` Home shows **no banner at all** — it only checks `'missing'` and `'timeout'`.

Fix: only commit on `status === 'ready'`; better, return `location: null` on failure so a caller physically cannot write a bogus city. Add a `'denied'` banner.

### 5.4 The location refresh can dead-end onboarding **[plausible]** — ✅ FIXED
`src/app/onboarding/location.tsx:20`, `src/app/(tabs)/settings.tsx:58`

`refreshLocation` sets `busy = true` and awaits with no try/finally, and the button is not disabled while busy. `LocationService` only wraps `getCurrentPositionAsync` in try/catch — the permission calls at `:47` and `:54` are unguarded. Tap "refresh location" twice (entirely normal when nothing visibly happens for 10 seconds) and if the second call rejects, `setBusy(false)` is never reached: the button reads "..." permanently and the onboarding step is a dead end for the rest of the session. The Settings copy has no catch at all — unhandled rejection, no feedback.

*Plausible:* whether expo-location actually rejects on a concurrent permission request in this SDK version wasn't exercised here.

Fix: try/catch/finally in both callers, disable while busy, and make `LocationService` always resolve to a `LocationResolution` rather than rejecting.

### 5.5 Most cities are unreachable — ✅ FIXED
`src/app/onboarding/location.tsx:49` (`CITIES.slice(0, 8)`), `src/app/(tabs)/settings.tsx:56` (`CITIES.slice(0, 12)`)

`CITIES` has 20 entries. Onboarding shows the first **8 — all in Israel**, so a diaspora user whose GPS is denied or times out cannot pick their city during onboarding and is silently given Jerusalem. Settings shows 12, permanently hiding Los Angeles, Miami, London, Paris, Antwerp, Melbourne, Toronto and Moscow.

### 5.6 Store subscriptions are never released — ✅ FIXED
`src/services/NotificationScheduler.ts:492`, `:510`, `:516`

`initNotificationHandlers()` registers three `subscribe` callbacks and discards the unsubscribe functions. It is called from `_layout.tsx:130` inside a `useEffect` keyed on `[loaded]` with **no cleanup**. A fast-refresh cycle or remount registers a second set, so one store change triggers N rebuilds.

### 5.7 Nusach is a decorative setting **[verified]** — ✅ FIXED
`grep -rn "nuschaotSupported" src` → definitions only, **zero reads**.

Onboarding dedicates a whole step to choosing a nusach; Settings offers four options; the detail screen displays it. Nothing filters or computes on it — it only triggers a notification rebuild. Same for `timeType`, set on every mitzvah and read nowhere, and for `SkipContext` values `'cholHamoed'` / `'fastDay'`, typed but never handled.

### 5.8 `urgent` stays true for windows that already closed — ✅ FIXED
`src/utils/buildDayTimeline.ts:59`

`urgent: window.end - Date.now() <= 45 * 60 * 1000` has no lower bound, so it stays true once the difference goes negative — forever, for every expired window on today. `MitzvahCard`'s "missed" path only triggers for *past dates*, so on today there is no competing `statusText` and the urgent chip renders.

Jerusalem, Wednesday 18:00: shacharit closed at ~09:30, mincha at shkia. Schedule → day view renders **"⚠ פג בקרוב"** on mitzvot that ended hours ago, with the complete button outlined in the urgent colour. The same unbounded comparison also fires *before* short windows open: `candle_lighting`'s window is 18–20 minutes, so it reads urgent ~27 minutes early.

Fix: bound both sides and expose `expired` separately — `home.tsx:137` already makes exactly this distinction, so the two surfaces would finally agree.

### 5.9 History streak resets to zero every morning, and breaks every Shabbat **[verified]** — ✅ FIXED
`src/utils/historyStats.ts:78`

The streak walk starts at the newest entry, which is **today**. Before the first completion of the day `hasAny` is false, `totalCount > 0`, so it `break`s immediately and returns **0**. A user with a genuine 30-day streak opens History at 08:00 before davening and is shown a 54-px gold **0** with "רצף 0". It jumps to 31 the moment they mark anything.

Worse: a day is only forgiven when `totalCount === 0` — every enabled mitzvah skipOn-excluded. On Shabbat `totalCount` is still 5 (only tefillin has `skipOn: ['shabbat']`), so an observant user who doesn't touch the phone on Shabbat always hits `break`. **The streak is capped at 6, forever**, and cannot be repaired because past days are read-only by design (`day/[date].tsx:110`).

Every existing test seeds a completion for today, so the suite never exercises the morning state.

Fix: carry the per-day `isShabbat`/`isYomTov` the loop already computes into `daily` and treat those days as streak-preserving; start the walk at yesterday when today has no completions yet. Also exclude today from `perMitzvah.eligible` until the day is over.

> Superseded 2026-10-06 by the post-block check-in. Shabbat and Yom Tov are no longer neutral: they are marked after the block, and an unmarked one breaks the streak once its check-in closes. Every item counts toward a percentage only once it can no longer be marked, which also removed the morning dip the first fix left in `perMitzvah`. The streak is no longer capped by the 30-day window, and an archive of kept days carries it past the 400-day retention.

### 5.10 Month view does heavy synchronous work in render — ✅ FIXED
`src/app/schedule.tsx`

42 cells × (`getHolidays` + `getHebrewDate` + `buildDayTimeline`, which itself calls `getZmanim` and every enabled mitzvah's `computeWindow`) — 42 full `HebrewCalendar.calendar()` computations plus 42 zmanim computations inside a `useMemo` on the render thread. History at least defers via `InteractionManager` (`history.tsx:58`); Schedule does not.

### 5.11 Week view starts Monday, everything else starts Sunday **[verified]** — ✅ FIXED
`src/app/schedule.tsx`

`cursor.startOf('week')` is Luxon's ISO default — Monday. The month grid computes `monthStart.minus({ days: monthStart.weekday % 7 })` (Sunday-first) and the header renders `weekday.short.0..6` = א׳…ש׳.

Verified on Sunday 2026-08-09: `startOf('week')` returns Monday 2026-08-03, so the strip is Mon 3 → Sun 9 — six days of the week that already ended, today pinned to the far end, **Shabbat sitting in the middle of the row instead of closing it**. The month view one tap away disagrees.

Fix: `cursor.startOf('day').minus({ days: cursor.weekday % 7 })`.

### 5.12 A custom mitzvah can be saved with zero reminders **[verified]** — ✅ FIXED
`src/app/custom-mitzvah.tsx:111`

The form seeds one reminder with `label: ''`; the label input has only a placeholder and no required marker; `onSave` filters out every blank-label reminder and never validates that any survived. The mitzvah is persisted, enabled, shows everywhere with a live window, triggers a scheduler rebuild — **and schedules nothing, ever**. Reopening the edit form shows an empty reminder list, which looks like the app lost the input.

Fix: block the save with a `custom.errors.*` message, or default a blank label to the mitzvah name (smaller change, matches intent).

### 5.13 A custom window can silently vanish on the DST spring-forward day — ✅ FIXED
`src/data/customMitzvotAdapter.ts:37`

Luxon's `.set({hour, minute})` on a non-existent local time shifts forward to the post-transition offset. When both endpoints fall in the gap they collapse onto the same instant, `buildWindow` sees `end <= start` and returns `null` — and every consumer reads a null window as "this mitzvah does not exist today". No timeline row, no Home entry, no notifications, and it is dropped from History eligibility.

Asia/Jerusalem, 2026-03-27 (02:00 → 03:00): a custom mitzvah defined 02:00–03:00 silently never existed that day. The create-screen validation compares wall-clock minutes and cannot catch it.

Fix: on a zone-transition collapse, fall back to `start.plus({ minutes: nominalDuration })`.

### 5.14 A custom mitzvah's day differs between Home and Schedule — ✅ FIXED
`src/data/customMitzvotAdapter.ts:36`

`computeWindow` does `DateTime.fromJSDate(date).setZone(location.tz).set({hour, minute})`, but callers pass differently-anchored instants: Schedule passes device-local midnight, Home passes `new Date()`, historyStats passes device-local midnight, the scheduler passes now / +1 day. When `location.tz` differs from the device zone these resolve to **different calendar days**.

Device in Asia/Jerusalem, location "ניו יורק", custom mitzvah 08:00–12:00. At 10:00 Jerusalem on 2026-08-09: Schedule renders the *Aug 8* NY window (already over) while Home renders the *Aug 9* NY window (upcoming). The two tabs contradict each other all day, and between 00:00–07:00 Jerusalem the scheduler resolves to the already-past NY day and schedules zero reminders.

Fix: pass the target day as a canonical `YYYY-MM-DD` (or normalise with `setZone(tz, { keepLocalTime: true })`) so the window always lands on the day the caller means — the same day `dateKey()` will use.

### 5.15 `settings.tsx` writes MMKV on every keystroke — ✅ FIXED
`src/app/(tabs)/settings.tsx:40`, `:103`

`const user = useUserStore();` subscribes with no selector, and the profile inputs bind directly to store setters. Typing a 20-character name = 20 full JSON serialisations + 20 MMKV writes + 20 full-screen re-renders (all sections, 12 city pills, 4 chip rows) + 20 passes through the `useUserStore.subscribe` diff in the scheduler. Visible input lag on low-end Android, and flash write cycles for data that only matters on blur. The onboarding screen does this correctly with local state.

---

## 6. Components, i18n, RTL, accessibility

### 6.1 First launch renders the Hebrew UI left-to-right **[verified]** — ✅ FIXED
`src/app/_layout.tsx:54`, `:63`

`I18nManager.isRTL` is a constant snapshotted once at module load, and `forceRTL()` only writes the native preference **for the next process start**. The module-scope call at line 63 passes `allowReload` as its default `false`, so on a fresh install the app calls `forceRTL(true)` and then keeps rendering with `isRTL === false`. The compensating root style `direction: 'rtl'` at line 98 is **iOS-only** per RN's own type docs — Android gets nothing.

Fresh install on an Android phone with an English/Russian/French system locale (default app language is `he`): the entire first session renders LTR — NavBar logo and counter swapped, MitzvahCard icon left and checkbox right, TimeRibbon label row reversed, BottomTabs in reverse order, ScrollViews anchored to the wrong edge, and the schedule nav arrows pointing the wrong way. Only a full kill-and-relaunch fixes it.

Fix: on native, when `isRTL !== wantRTL` at module scope, persist a one-shot `rtl-bootstrap-done` flag in MMKV and reload immediately (guarded by the flag so it can never loop).

### 6.2 The library toggle has two competing sources of direction — ✅ FIXED
`src/app/(tabs)/library.tsx:128`

The track is rotated 180° when `language === 'he'`, while the thumb is positioned with physical `right: 2` / `right: 22`, which RN auto-swaps only when `I18nManager.isRTL` is true. When the two agree, the flips cancel and the control behaves like the LTR one (already wrong for RTL); when they disagree — exactly the first-launch state of 6.1 — only the rotation applies, so an **enabled** mitzvah's thumb renders at the left edge and a **disabled** one at the right. Every Library row reads inverted while the underlying state is correct.

Fix: drop the rotate hack and use direction-relative `end: 2` / `end: 22`.

### 6.3 i18n lags one render, and memos on `t` never refresh **[verified]** — ✅ FIXED
`src/i18n/index.ts:17`, `:36`

`t` reads a module-level `currentLocale`; `useI18n` updates it in a `useEffect` — **after** the render the language change triggered. No state changes afterwards, so no second render is scheduled and the committed UI keeps the previous language. Native masks this because he↔en always flips `wantRTL` and triggers `reloadApp()`; **web is explicitly excluded** from that reload (`allowReload && Platform.OS !== 'web'`), so nothing recovers.

Compounding it, `useI18n` returns the module function itself, so `t` is referentially stable forever and any `useMemo(..., [..., t])` is frozen at whatever locale was active when it first ran (e.g. `custom-mitzvah.tsx`'s screen title).

Components that import `t` directly (`home.tsx:37`, `day/[date].tsx:16`) don't subscribe to `language` at all.

Fix: derive the translator from the current render's language — `const t = useCallback((k, o) => translate(k, o, language), [language])` — so `t` changes identity with the language. Keep the module-level `setLocale` only for non-React callers (the scheduler).

### 6.4 `HebrewDate` is hardcoded to Hebrew — ✅ FIXED
`src/components/HebrewDate.tsx:19`

`.setLocale('he')` with no language prop, unlike `home.tsx:93` which correctly uses `language`. `HebcalService.getParasha`/`getHolidays` likewise hardcode `.render('he')`.

The component renders on Home directly under a NavBar subtitle that *is* language-aware, so an English user sees the same date twice: "Sun · Aug 9 · Jerusalem" and immediately below "כ״ה באב תשפ״ו · יום ראשון · 9 אוגוסט · פרשת עקב".

### 6.5 Contrast falls far below WCAG AA **[verified]** — ✅ FIXED
`src/theme/colors.ts:57`

Computed ratios:

| Pair | Ratio | Required |
|---|---|---|
| dark `textMuted #445566` on `surface #18293C` | **1.93:1** | 4.5:1 |
| dark `textMuted` on `surface2 #1F3347` | **1.69:1** | 4.5:1 |
| light `textMuted #A8B0B8` on `#FFFFFF` | **2.19:1** | 4.5:1 |
| `#fff` on `colors.gold` (light) | **2.75:1** | 4.5:1 |
| `#fff` on `colors.gold` (dark) | **2.37:1** | 4.5:1 |

`textMuted` is the colour of the 10–11 px `typography.micro`/`small` text: the TimeRibbon percentage, CompletedRow timestamp, MitzvahCard read-only badge, library category subtitle. Every primary CTA paints `#fff` on gold.

Fix: light `textMuted` → ~`#6E7781` (4.5:1 on white), dark → ~`#8C9AA8` (4.6:1 on `#18293C`). For gold-filled buttons use `colors.headerBg` (`#1C2B4A` on `#C9922A` ≈ 5.1:1); add an `onGold` token so the literal `'#fff'` stops being scattered across ReminderEditor, library and custom-mitzvah.

### 6.6 The quick-actions sheet is unreachable with a screen reader — ✅ FIXED
`src/components/MitzvahCard.tsx:92`

The outer `Pressable` — which navigates on press and opens the quick-actions sheet on long press — sets no `accessibilityRole`, `accessibilityLabel` or `accessible`. Only the inner check button is annotated. RN infers nothing from `onPress`, so a card is announced as loose fragments ("תפילת מנחה", "נותר: 45 דקות", "30%") with no indication it is actionable. **"דלג להיום" — the only way to stop a day's reminders without falsely marking done — is impossible to reach**, since long-press exposes no `accessibilityActions`.

### 6.7 Bottom tabs clip at large font sizes **[plausible]** — ✅ FIXED
`src/components/BottomTabs.tsx:121`

`height: 58` is hard-pinned while the label scales with the system font. `grep -rn "allowFontScaling|maxFontSizeMultiplier" src/` → zero matches. At an iOS accessibility text size (~2.5–3.1×) the 13 px line height grows to ~33–40 px; with the 19 px icon, 3 px gap and 3 px indicator the content needs ~62–65 px in a 58 px bar.

*Plausible:* the exact overflow behaviour depends on how Yoga resolves it on a given OS and font scale.

Fix: `minHeight: 58`, plus `maxFontSizeMultiplier={1.4}` and `numberOfLines={1}` on the label.

---

## 7. Build, config, release

### 7.1 `pnpm android` builds a completely different app **[verified]** — ✅ FIXED
`android/app/build.gradle:92`, `android/app/src/main/res/values/strings.xml`, `AndroidManifest.xml:29,49`

> **Fixed 2026-08-09.** Ran `expo prebuild --clean`; the native project now matches `app.json` on every identity field (`com.jewintime.app`, app name יהודי בזמן, runtime 1.0.10, update URL `…/8cc2a377-…`, schemes `jewintime` / `exp+jew-in-time`), the config plugin's `MitzvahNotificationService` is wired under the correct package, and `POST_NOTIFICATIONS` / `RECEIVE_BOOT_COMPLETED` / `WAKE_LOCK` are all present. Added `pnpm prebuild:clean` plus an AGENTS.md rule that an existing native folder is disposable cache, never state.

The on-disk `android/` folder (gitignored, left over from an old prebuild) disagrees with `app.json` on **every identity field**:

| Field | `android/` on disk | `app.json` |
|---|---|---|
| applicationId / namespace | `com.kosherjew.app` | `com.jewintime.app` |
| EAS update project | `86c60d8d-9f64-4f85-831e-31ffce5883fe` | `8cc2a377-fcc9-4c78-bdde-ec0fc8f2a84e` |
| deep-link schemes | `kosherjew`, `exp+kosher-jew` | `jewintime` |
| app_name | `יהודי כשר` | `יהודי בזמן` |
| runtime version | `1.0.2` | `1.0.10` |

Expo CLI **does not re-run prebuild when the platform folder already exists**, so none of this is ever reconciled.

Failure scenario: a developer runs `pnpm android` — the AGENTS.md-documented dev command — to do the one open task, manual mobile end-to-end verification. Gradle builds `com.kosherjew.app` with runtime 1.0.2, launcher label יהודי כשר, scheme `kosherjew`, and an update URL pointing at a **different EAS project**. They validate notification and mitzvah behaviour against an app that is not the shipping app: `jewintime://` links don't resolve, an OTA published with `pnpm update` is never delivered, and every app.json change since that prebuild — including the `POST_NOTIFICATIONS` / `SCHEDULE_EXACT_ALARM` permission set and the notification icon/colour — is absent from the APK. EAS builds prebuild fresh, so **local testing and CI silently diverge with no error message anywhere**.

Fix: delete the local `android/` (and any `ios/`), or make the documented dev commands run `npx expo prebuild --platform android --clean` first. Native folders are gitignored — treat any existing one as disposable cache, not state.

### 7.2 `SCHEDULE_EXACT_ALARM` is declared, never requested, and is the wrong permission **[verified code, plausible OS outcome]** — ✅ FIXED
`app.json:38`

`SCHEDULE_EXACT_ALARM` is a special app-access grant, not a runtime dialog: on Android 14+ it is **denied by default** and obtainable only by sending the user to `ACTION_REQUEST_SCHEDULE_EXACT_ALARM`. Expo SDK 54 targets API 36. Nowhere is `canScheduleExactAlarms` checked, the intent launched, or the user told.

expo-notifications degrades silently — `ExpoSchedulingDelegate.kt:105` is verbatim:
```kotlin
if (SDK_INT < S || alarmManager.canScheduleExactAlarms()) setExactAndAllowWhileIdle(...)
else setAndAllowWhileIdle(...)
```
`setAndAllowWhileIdle` is batched and deferred under Doze. So on a Pixel running Android 14/15, the "light candles, 18 minutes before sunset" reminder can arrive **after** sunset and the "mincha window closing" reminder **after** shkia — the app's entire value proposition, hitting a halachic window, broken with no signal.

Separately, a Play Console submission declaring `SCHEDULE_EXACT_ALARM` without the exact-alarm declaration form is rejected at review.

Fix: use `USE_EXACT_ALARM` — this *is* a reminder/alarm app, which is the sanctioned use case; it is granted at install with no user step and no Play declaration form. Keep `SCHEDULE_EXACT_ALARM` alongside it only for Android 12/13. Surface the state in Settings either way.

### 7.3 `expo-background-fetch` is deprecated, and its config plugin isn't registered — ✅ FIXED
`package.json`, `app.json` plugins

The installed build prints `expo-background-fetch: This library is deprecated. Use expo-background-task instead.` on every call, in production. Expo will remove it — and the daily rebuild is the app's only unattended refresh path, so this is a scheduled outage.

Neither `expo-background-fetch` nor `expo-task-manager` is listed in `plugins`, although both ship `app.plugin.js`. Their plugins add `UIBackgroundModes: ['fetch']` (already set manually) **and Android `WAKE_LOCK` + `RECEIVE_BOOT_COMPLETED`**. `RECEIVE_BOOT_COMPLETED` is declared manually; **`WAKE_LOCK` is not**. *(Update 2026-08-09: after the clean prebuild of §7.1, `WAKE_LOCK` does appear in the generated manifest via autolinked module plugins, so this half is moot. The deprecation of `expo-background-fetch` stands.)*

> **Fixed 2026-10-09 (1.0.18).** The daily rebuild moved to `expo-background-task`: task `jew-in-time-daily-rebuild-v2`, `minimumInterval: 60` minutes, the package's config plugin (which adds the `processing` background mode and the `BGTaskSchedulerPermittedIdentifiers` entry), `app.json` no longer declaring `fetch` itself (`expo-task-manager`'s own auto-applied plugin still adds it to the Info.plist), and `registerDailyRebuildTask()` unregisters the legacy `jew-in-time-daily-rebuild` registration on an updated install. It is a native change, so it reaches users with the build.

### 7.4 AGENTS.md documents four scripts that don't exist **[verified]** — ✅ FIXED
`AGENTS.md:27` vs `package.json`

| Documented | Reality |
|---|---|
| `pnpm build:android:development` | missing |
| `pnpm build:android:preview` | missing (only `build:android`, hardwired to `--profile preview`) |
| `pnpm update:development` | missing |
| `pnpm update:preview` | missing (only `update`, hardwired to `--channel preview`) |

There is **no scripted path at all** to the `development` or `production` EAS profiles/channels that `eas.json` defines. An agent following the canonical doc to build the dev client needed for notification/MMKV verification gets `Missing script`. Worse, someone who thinks `pnpm update` ships an OTA to development silently pushes to **preview testers**.

`AGENTS.md` also names `tasks.md` twice as authoritative; it does not exist in the repo.

### 7.5 Jest `transformIgnorePatterns` cannot match scoped packages under pnpm **[verified]** — ✅ FIXED
`package.json:71`

The pattern allows an optional `(?:.pnpm/)?` segment, but pnpm encodes scoped packages in its virtual store as `@scope+name@version`, not `@scope/name`. Every scoped alternative (`@expo/.*`, `@expo-google-fonts/.*`, `@react-navigation/.*`, `@hebcal/.*`, `@unimodules/.*`) requires a literal slash, so **none of them match inside `.pnpm/`** — the negative lookahead succeeds and the file is excluded from Babel transform. Unscoped names work because they are prefix matches. The suite is green today only because `@hebcal/core` resolves through its `require` export to CJS.

Add or bump any scoped ESM-only dependency and `pnpm test` dies with `Cannot use import statement outside a module` for a package that is *visibly in the allowlist* — sending whoever debugs it down entirely the wrong path.

Fix: `@hebcal[/+].*` (and likewise for the others), or drop the trailing `/.*` so they behave as prefix matches.

### 7.6 Release identity is inconsistent and store URLs are placeholders — ✅ FIXED

> **Fixed 2026-09-01.** `release/APP_STORE_METADATA_HE.md` still carried the old name `יהודי כשר`, which `src/i18n/__tests__/i18n.test.ts` explicitly forbids; all three listings now read `יהודי בזמן` / `Jewish Time`, matching [app.json](app.json). The privacy policy moved out of `release/` and is published as real pages under [docs/](docs) — Hebrew and English — with a real contact address. Support, Marketing and Privacy Policy URLs in all three metadata files now hold live GitHub Pages URLs instead of "Add before submission". The generated Android project is disposable cache and regenerates from [app.json](app.json). GitHub Pages serves the folder from `main`, and all three URLs return 200.

### 7.7 Smaller release blockers — ✅ FIXED
- **`ITSAppUsesNonExemptEncryption` is not declared** (`app.json:19`). Every TestFlight/App Store upload stalls on "Missing Compliance" until answered by hand, for every build. The app only uses HTTPS — add `"ITSAppUsesNonExemptEncryption": false`.
- **`processing` background mode is declared but unused** (`app.json:22`) — expo-background-fetch uses only the legacy `setMinimumBackgroundFetchInterval`, never `BGTaskScheduler`, and no `BGTaskSchedulerPermittedIdentifiers` exists. Apple 2.5.4 rejects background modes with no corresponding functionality. *[plausible — a human review outcome]*
- **`pnpm web` is Windows-only** (`package.json:11`) — it shells to `powershell` before `expo start --web`, joined with `&&`. On macOS/Linux/CI it exits 127 and Metro never starts, even though nothing was on port 8081.
- **Dead dependencies**: `i18n-js` (zero imports — the i18n layer is hand-rolled) and `ts-jest` (Jest uses the babel-based `jest-expo` preset). Both are decoys: a contributor adding pluralization may reasonably wire against `i18n-js` and ship two competing translation runtimes with divergent locale state.

### 7.8 Unused PII, unencrypted and undeclared — ✅ FIXED
`src/stores/useUserStore.ts:22`, `src/app/onboarding/index.tsx:40`

`profileName` (**required**, marked with `*`) and `profilePhone` are collected in onboarding and Settings, persisted to MMKV, and read by **nothing else** — no notification body, no export, no display. The MMKV instance is created with no `encryptionKey`, so both sit in plaintext in the app sandbox (readable via adb backup, unencrypted iOS local backup, or any rooted device). `release/PRIVACY_POLICY.md` enumerates location, permission status, local preferences and completion history — and never mentions name or phone.

That under-declares collection in the Play Data Safety and App Store privacy questionnaires derived from it.

Fix: delete both (nothing reads them). If they are wanted later: make them optional, pass an `encryptionKey`, and declare them.

---

## 8. Where the 146 green tests are lying

### 8.1 The polar test passes *precisely because* the code crashes **[verified]** — ✅ FIXED
`src/services/__tests__/ZmanimService.extra.test.ts:36`

> **Fixed 2026-08-09.** Replaced with `not.toThrow()` + an explicit null assertion, plus a new suite that sweeps every shipped city across the year asserting a complete, correctly-ordered zmanim set. That sweep fails on the old code.

Test 1.4 is named *"Polar June 21 — does not crash; returns Date or fallback"*. Its assertion:

```ts
expect(threw || !!result).toBe(true);
```

This is true when the call throws **and** true when it returns. It can never fail. The real behaviour is a throw — and not only in Tromsø, but in London, Antwerp and Moscow (§1.1). `ZmanimService.test.ts` only ever uses Jerusalem / Tel Aviv / New York, so its 2026-06-21 date never reaches a high-latitude location. **The single most severe bug in the app has a green test named after it.**

Fix: `expect(() => ZmanimService.getZmanim(d, POLAR)).not.toThrow()`, and parameterise the suite over `CITIES` × both solstices.

### 8.2 The Shabbat-skip test pins one instant and misses the real path **[verified]** — ✅ FIXED
`src/services/__tests__/NotificationScheduler.test.ts:158`

Test 6.6 calls `scheduleAll(new Date('2026-04-25T03:00:00Z'))` — Saturday 06:00 Jerusalem — and only checks nothing is scheduled for that same day. It never covers a Friday-evening rebuild, which is the path that schedules tefillin **for** Shabbat (§2.6). The 00:15 daily rebuild happens to land on the safe side of both boundaries, which is exactly why this passes.

Fix: add a test calling `scheduleAll(<Friday after shkia>)` asserting zero `tefillin__<saturday>__*` identifiers.

### 8.3 Four tests assert only the return *type* **[verified]** — ✅ FIXED
`src/services/__tests__/HebcalService.test.ts:42`

- 2.5, named *"isYomTov true for 1st day Pesach"*, asserts `expect(typeof result).toBe('boolean')` — passes for `true` **and** `false`.
- 2.6, *"16 Nisan = day 1"*, asserts `typeof omer1 === 'number' || omer1 === undefined` — true for every possible return.
- 2.2 asserts `typeof p === 'string' || p === undefined`.
- `mitzvotExtras` 16.2 repeats the pattern.
- 2.3 checks `holidays.length > 0` without checking it contains Pesach.

Nothing in the suite ever asserts an actual halachic value. If `isYomTov` regressed to always-`false` (a wrong flag mask, a bad `il` flag, an `@hebcal/core` major bump), all 146 tests stay green while tefillin reminders fire on Pesach, Shavuot, Rosh Hashana and Yom Kippur.

### 8.4 Tests that test a copy of the code, not the code **[verified]** — ✅ FIXED
`src/components/__tests__/TimeRibbon.test.ts:4`, `src/services/__tests__/reminderLogic.test.ts`

`TimeRibbon.test.ts` **never imports `TimeRibbon.tsx`** — it re-declares `colorOf()` with the same ternary and tests the copy. It also re-declares `sortByEnd()` "extracted from home.tsx:123". `reminderLogic.test.ts` does the same for the scheduler's `buildTriggerTime`, which isn't exported and therefore *cannot* be imported. These are mirror tests: they verify the test file agrees with itself. `reminderLogic.test.ts:46` is a pure tautology — it builds an object literal with `skipIfDone: true` and asserts the literal has `skipIfDone === true`, touching no production code at all.

Flip the ribbon thresholds, reverse the home sort, or invert the sign in `buildTriggerTime` so `end/-45` fires 45 minutes *after* the window closes — all ship with 146/146 green.

### 8.5 The scheduler mock discards the trigger **[verified]** — ✅ FIXED
`src/services/__tests__/NotificationScheduler.test.ts:13`

`mockSchedule` records `{identifier, content:{data, categoryIdentifier, autoDismiss, sticky}}` and throws away **`trigger`**, `title`, `body` and `sound`. Every scheduler assertion is about identifiers and counts. In a reminder app, *when the notification fires* is the one thing that must be right, and no test inspects it.

The mock also diverges from the real API: it accepts a past trigger without complaint, accepts a duplicate identifier by pushing a second entry (the real API replaces), and never models the iOS 64-pending ceiling that `IOS_MAX` exists for.

Fix: capture and assert `trigger` — that `trigger.type === 'date'`, that `anchor:'end', offsetMin:-45` lands exactly 45 min before `window.end`, and that no scheduled trigger is `<= Date.now()`.

### 8.6 `initNotificationHandlers()` is never called by any test **[verified]** — ✅ FIXED
`src/services/__tests__/NotificationScheduler.test.ts:150`

Tests 6.4 (*"subscriber wired in initNotificationHandlers"*) and 6.5 (*"covers nusach trigger"*) are **byte-identical** `typeof rebuild === 'function'` assertions. The function name appears in the test suite only inside a test's name string. So the foreground suppression handler, permission sync, tray dismissal, `registerDailyRebuildTask`, the `DAILY_REBUILD_TASK` body with its 00:15 gate and `LAST_REBUILD_KEY`, and **all four store subscriptions** have zero coverage.

`mitzvotConfigChanged` compares `customReminders` by reference and the user subscription compares `halachicOpinions` by reference. If a store action ever mutates those in place, no rebuild fires and the user's edited reminder times silently never take effect — with a green suite.

### 8.7 Date fixtures are device-local, not what they claim **[verified]** — ✅ FIXED
`src/data/__tests__/mitzvot.windows.test.ts:11`

Fixtures are written as noon-UTC ISO strings (`new Date('2026-04-24T12:00:00Z')` labelled FRIDAY) while the code under test reads device-local fields — `isFriday()` uses `getDay()`, havdalah uses `getDay() !== 6`, `dateKey()` uses the local getters, `omerDayFor` falls back to the system zone, and kosher-zmanim's `setDate` resolves in the system zone. Noon UTC lands on the same calendar day for Asia/Jerusalem and America/New_York, so the suite is green on the author's machine and in US CI — and 7 tests in 3 suites go red at UTC+12/+13. Nothing pins `TZ`.

> I confirmed the suite passes under `TZ=America/New_York`; that is **not** evidence of timezone-independence, for exactly this reason.

The greater cost is what the green run never exercises: that candle-lighting/havdalah day detection and Omer day should resolve in the *selected location's* timezone rather than the device's (§2.8).

Fix: pin `TZ=UTC` in a `globalSetup`, build fixtures from explicit local components (`new Date(2026, 3, 24, 12)`), and add a UTC+13 CI run.

### 8.8 Smaller test gaps — ✅ MOSTLY FIXED
- **6.7 (PENDING_LIMIT) is vacuous one run in seven** (`:166`) — it uses `tefillin`, which has `skipOn: ['shabbat']`, and `Date.now()+1000`. On a Friday the assertion is satisfied by the Shabbat skip, not the guard. Remove the guard entirely and land the PR on a Friday: green.
- **11.4 accepts an empty array** (`mitzvotExtras.test.ts:24`) — *"every mitzvah has at least one defaultReminder"* only asserts `Array.isArray`. A mitzvah with `defaultReminders: []` passes and never notifies.
- **The response-handler suite tests its own parser** (`notificationResponseHandler.test.ts:16`) — it mocks `@/services/NotificationScheduler` *and* supplies its own `pendingNotificationMetaFromContent`, which differs from the real one (no `isRecord` guard, no try/catch around `JSON.parse`). The shipped parser is never exercised on the tap path. On Android, where the payload arrives as `dataString`, a regression there would break both navigation and mark-done with a green suite.
- **Zero rendering coverage** (`routes.test.ts:6`) — it walks the filesystem with `readdirSync` and asserts filenames; `@testing-library/react-native` is not a devDependency, so no screen is ever mounted. One smoke render per screen would have caught §1.1 outright.
- **The web shim is unreachable by Jest** — `jest-expo` inherits `defaultPlatform: 'ios'`, so `NotificationScheduler.web.ts` is never resolved. It is **already out of parity**: it lacks `pickBodyForReminder` and `shouldSuppressForCompletion`, and its `PendingNotificationMeta` omits `skipIfDone`. Adding a scheduler export consumed by a shared screen produces a runtime `undefined is not a function` on web with a fully green `pnpm test`.
- **`customMitzvotAdapter` has zero tests** — no test file references `customToMitzvah`, `getAllMitzvot`, `findAnyMitzvah` or `useCustomMitzvotStore`, the code path behind the entire user-created-mitzvah feature.
- **`--passWithNoTests`** (`package.json:16`) — a typo'd CI path filter exits 0 with `Tests: 0 total`. The repo has 22 suites; there is no empty-project case to accommodate.
- **A leaked handle** — every run prints *"A worker process has failed to exit gracefully."* `LocationService.withTimeout` (`:36`) never clears its `setTimeout` when the promise resolves first, which is a strong candidate.

---

## 9. Refuted, corrected, and genuinely fine

An adversarial pass re-read every finding against the source with a default stance of "refuted". Recording what did not survive matters as much as what did.

**Refuted:**

- **"The zmanim cache serves the wrong day when device tz ≠ location tz."** Tested directly: with the process zone forced to `America/New_York` and a Jerusalem `GeoLocation`, both candidate instants returned the **same** Jerusalem sunrise. `cacheKey` and kosher-zmanim's `setDate` both resolve in the system zone, so key and computation can never disagree. The real, smaller issue is §2.8 — the location's own calendar day is never used.
- **"`inIsrael` has two copies that can diverge."** The observation is accurate (the top-level field is inert; `settings.inIsrael` is read by nothing), but divergence is **unreachable today**: `setInIsrael` has zero callers, and `setLocation`/`setLocationState`/`reset` always write both consistently. It is dead weight and a trap for whoever wires up the "I'm in Israel" toggle — not a current defect.
- **"An overnight custom mitzvah is silently dropped."** `custom-mitzvah.tsx:104` validates `end <= start` and shows a visible `custom.errors.endBeforeStart`. The record is never persisted. Overnight windows are an **unsupported product limitation**, not a silent bug. (The adapter still has zero tests, and the DST-gap collapse of §5.13 *is* silent.)

**Downgraded to latent risk:**

- **No persist `version`/`migrate`** — every code fact holds, but the failure is conditional on a future release changing city data or a nested shape. Newly added *top-level* fields are handled fine by the default merge. Still worth doing before the next release, because after that it becomes a migration you can't write.
- **`IOS_MAX` never enforced** — the code facts are certain; the iOS 64-request discard behaviour could not be exercised from here.

**Verified good — don't "fix" these:**

- **i18n coverage is complete.** All 157 statically-used keys and every dynamically-composed family (`zman.*`, `weekday.short.0-6`, `month.0-11`, `library.category.*`, `settings.locationStatus.*`, `nusach.*`, `reminder.anchor.*`, `custom.contentType.*`) exist in both dictionaries — 254 keys each, no empty values, no missing keys in either direction. 23 unused keys, harmless.
- **Only three hardcoded Hebrew strings** remain in code, all in `NotificationScheduler.ts` (§3.7).
- **Persist hydration is synchronous.** `react-native-mmkv` v3 `getString` is sync and zustand 5.0.12's `persist` runs the whole hydrate path synchronously via `toThenable` when `getItem` returns a non-Promise (proven by running the real middleware against a sync storage stub). The module-scope `useUserStore.getState().language` read in `_layout.tsx:62` is safe; there is no onboarding flash and no hydration race.
- **`ZmanimService` clones every `Zmanim` field** in and out of the cache, so callers cannot mutate cached dates.
- **`cancelForMitzvah` falls back** from identifier → `data.customId` → `data.mitzvahId`, so it survives identifier-format drift.
- **Deleting a custom mitzvah does clean up its pending notifications**, via the `useCustomMitzvotStore` subscription → `rebuild()`.

---

## 10. Suggested order of work

1. **§1.1** — nullable zmanim + an `ErrorBoundary` + per-mitzvah try/catch in the scheduler. Nothing else matters while the app is white for a month and silently un-scheduling everyone.
2. **§7.1** — delete the stale `android/`. Until then no local verification of anything below is trustworthy.
3. **§2.1, §2.2, §2.3, §2.6** — the halachic cluster: mitzvot shown on Shabbat, the Omer off-by-one, the 18-hour maariv window, tefillin reminders on Shabbat. This is the product.
4. **§3.1, §3.2, §3.3** — make reminders actually keep arriving.
5. **§5.1, §5.2, §5.3** — the three "the app is lying / lost my tap / moved my city" bugs.
6. **§1.2, §4.1** — the render loop and store versioning together; they are the same latent problem (a persisted map that no longer matches the code).
7. **§8.1, §8.2, §8.4, §8.5** — fix the tests that actively certify the bugs above as correct, before fixing anything else, so the fixes stay fixed.
8. Everything else.

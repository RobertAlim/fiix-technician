# Fiix Technician (Expo / React Native)

A Technician-only companion app to the Fiix web app, built so background
GPS pings keep flowing while the screen is off or the app is backgrounded —
something a browser tab fundamentally can't do.

## ⚠️ "A signature is required" even after signing — real capture bug, not a validation bug

Reported with a screenshot showing a clearly drawn signature still
triggering this exact error. Root cause: `react-native-signature-canvas`
does **not** convert drawn strokes into usable data on its own — nothing
happens until `readSignature()` is explicitly called on the ref, which
this screen was never doing. A technician could draw a perfectly valid
signature and `signatureUri` (the state `validate()` actually checks)
would simply never be set, no matter how much was drawn.

Fixed by calling `sigRef.current?.readSignature()` from the canvas's own
`onEnd` callback — every time a stroke ends, not just once at some
separate "confirm" step the UI never actually had. By the time a
technician taps Save Maintenance, whatever they last drew is already
captured, with nothing extra to remember.

Found and fixed a second, related bug while in here: **Clear Signature**
only ever wiped the visual canvas — it never reset `signatureUri` itself.
Combined with the new auto-capture-on-stroke-end above, a technician who
drew a signature, then cleared and reconsidered, would have submitted
with the OLD signature still silently attached despite the canvas looking
empty. `setSignatureUri(null)` now runs alongside `clearSignature()`.

## ⚠️ Real root cause of "Request failed: 500" found — `signPath` NOT NULL violation

Traced from actual Vercel logs this time, not guessed: every mobile
report submitted **without a signature** was crashing the insert —
`NeonDbError: null value in column "signPath" of relation "maintain"
violates not-null constraint`.

`sync-engine.ts` sent `signPath: undefined` when no signature was
captured — `JSON.stringify` drops `undefined` properties entirely, so
the field never reached the server at all. Checked
`features/offline-sync/save-maintenance-report.ts` (web's own equivalent
offline-save path) and found it already handles this exact case:
`signPath: signKey ?? "Unsigned"`. `"Unsigned"` turns out to be a real,
established sentinel checked in at least eight places across the web
app (PDF report rendering, dashboards, the purge tool) — not something
invented for this fix. Mobile now sends the same fallback.

**Also fixed on the web side** (separate patch,
`fiix-web-updates.zip` — supersedes every earlier web patch from this
conversation, now includes all three combined deltas): `db/schema.ts`
previously declared `signPath` as plain nullable, which didn't match the
real NOT NULL constraint already enforced in production — pure
documentation drift, not a live change. Added a DB-level
`DEFAULT 'Unsigned'` on top of the existing constraint as defense-in-depth,
so any future client that forgets this fallback gets the correct
sentinel automatically instead of a 500.

Your currently-stuck reports should recover on their own — no manual
discard needed, same as the concurrency-bug fix earlier: they'll retry
successfully once this update (mobile) and the migration (web) are both
live.

## ⚠️ Reports stuck permanently "Uploading" — real bug I introduced, three-part fix

Traced directly from the screenshot showing two items "Uploading" at
once. Root cause: `useOfflineSync()` is now called independently from
**both** `DashboardScreen` (added recently, for the itinerary's "Queued"
badges) **and** `MaintenanceListScreen`. With a tab navigator keeping both
screens mounted at once, that's two fully separate sync loops, each with
its own mount-time drain — `drainQueue`'s only protection
(`if (status === "syncing") continue`) is checked once per *call*, not
shared across calls, so two overlapping calls can each grab a *different*
pending item and upload both at the same time. That's exactly what two
simultaneous "Uploading" rows looks like.

Three fixes, addressing this at every layer it could recur:

1. **The actual concurrency bug** (`sync-engine.ts`) — `drainQueue` now
   has a module-level in-flight guard: any call while a pass is already
   running returns that same pass instead of starting a second one. Fixes
   it regardless of how many components ever call the hook, rather than
   requiring every future caller to coordinate manually.
2. **No request ever had a timeout** — `fetch()` has none by default.
   Combined with the bug above, a stalled request (weak connection,
   unresponsive server) could leave a report showing "Uploading" forever
   with zero automatic recovery. Both `api.ts`'s shared request function
   (30s) and the raw R2 upload `fetch` in `sync-engine.ts` (60s, since
   it's moving an actual file, not a small JSON body) now abort and fail
   cleanly via `AbortController` instead of hanging indefinitely.
3. **Recovery for what's stuck right now** — `offline-db.ts` resets any
   report still showing `syncing` back to `pending` once, at every app
   startup. Nothing can legitimately still be "in flight" at a fresh
   start (the in-memory promise that would have resolved it died with the
   previous session) — without this, an orphaned `syncing` row stays
   stuck forever, since `drainQueue`'s own skip-if-syncing check means
   nothing would ever retry it again. **This one fixes your two
   currently-stuck reports automatically** — no manual discard needed,
   just get this update running and they'll pick back up on the next
   sync.

## Sync panel: stale error display fixed, discard added for stuck reports

Two small but real fixes, prompted directly by a screenshot showing an
"Uploading" item still displaying "Bucket not allowed" text — that text
was leftover from the attempt *before* the R2 fix, not a sign the
current (post-fix) attempt was failing too.

- **Stale error hidden while actively retrying.** `lastError` is only
  ever from a report's most recent *completed* attempt — the panel now
  only shows it while `status === "failed"`, not during `"syncing"`,
  so a fresh retry in progress doesn't display an old failure as if it
  were happening right now. The text isn't cleared from storage, just
  hidden — it reappears immediately if this attempt fails too.
- **Discard button** on any failed report — for exactly the case in that
  screenshot (two items at 47 and 33 attempts respectively, almost
  certainly stale payloads from testing before several schema fixes
  landed, not worth continuing to auto-retry forever). Confirms before
  deleting, explains plainly that it's permanent and the report will
  never reach the server.

**On the two `Request failed: 500` items specifically** — I don't have
visibility into the actual server-side exception without real logs
(Vercel's, not anything client-visible), so I won't guess at a specific
cause. Given the attempt counts, the more useful path is: discard those
two, then create a **fresh** test report end-to-end. If a brand new
report also comes back 500, that's a real, current bug worth pulling
server logs for — if it succeeds, the old ones were just stale data from
earlier in this project's testing.

## ⚠️ "Bucket not allowed" — real bug, wrong bucket name since the very first version

Checked `lib/r2.ts` and `features/offline-sync/config.ts` on web directly
rather than guess again. The actual allowlist
(`ALLOWED_BUCKETS = new Set([env.bucketName, "fiixdrive", "fiixnozzle"])`)
never included `"fiix-uploads"` — the name `sync-engine.ts` had hardcoded
since it was first written, flagged at the time with a comment
("keep in sync with... if that ever changes") that assumed the name was
merely subject to *future* drift, when it was actually wrong from the
start and never verified against the real source.

Worse than just being wrong: it was also a single bucket for both upload
kinds, when web genuinely uses two different ones —
`nozzle: "fiixnozzle"`, `signature: "fiixdrive"`. Fixed to match exactly:
`R2_BUCKETS.nozzle` / `R2_BUCKETS.signature`, selected per upload call
rather than one shared constant.

**Your existing failed queue items (the ones in your screenshot) don't
need to be manually cleared or recreated** — `drainQueue` retries every
non-`syncing` item on every sync attempt regardless of prior failures,
and the `clientUuid` idempotency key means a retry-after-partial-failure
is always safe. They should just succeed automatically once this build
is running.

## Offline itinerary: prevent duplicate Maintenance entries for the same printer

Real gap: the server's `isMaintained` flag only flips once a sync
actually *completes* — between "saved to the offline queue" and "synced,"
a schedule detail still looked completely untouched and tappable, so a
technician offline (or just faster than the sync) could queue a second,
duplicate report for the same printer.

- **`useOfflineSync`** now tracks which `schedDetailsId`s have a report
  sitting in the local queue (pending, actively uploading, **or**
  failed-but-retryable — all three still mean "a report already exists,"
  not just a clean pending state), and immediately invalidates the
  schedule + attendance-status queries the moment a sync actually
  completes — closing the gap where a just-synced printer would keep
  showing as available until whatever periodic/focus refetch happened to
  run next.
- **Dashboard's itinerary** now has three states per printer, not two:
  tappable (normal) → **Queued** (locally saved, not yet confirmed by the
  server — dimmed, blocked, clock icon, amber badge) → **Saved**
  (server-confirmed via `isMaintained` — dimmed, blocked, check icon,
  green badge, same as before). Tapping a Queued row shows a clear
  explanation instead of silently doing nothing or letting a duplicate
  through.

## Five-part feature batch: signatories, signature canvas, nav bar, offline queue

**Case B** overall — `expo-navigation-bar` is a real native module, so
this whole batch needs a rebuild even though most of the individual
changes are pure JS.

### Signature canvas: strokes rendering as dots (fixed)

Real, well-known class of bug: the signature canvas sits inside a
`ScrollView`, and the ScrollView's own pan/scroll gesture responder was
intercepting touch-move events mid-stroke — only touchstart and touchend
ever reached the canvas, which is visually indistinguishable from a
series of disconnected dots. Fixed by locking `scrollEnabled={false}` for
the exact duration of a stroke, driven by the canvas's own `onBegin`/
`onEnd` callbacks (confirmed these are real supported props by checking
the installed package's own type definitions, not assumed).

### Android nav bar hidden on Maintenance Report (fixed)

New `expo-navigation-bar` dependency (`~5.0.10`, the real SDK 54
version). Hidden via `useFocusEffect` only while `MaintenanceFormScreen`
is focused — restored automatically the moment the technician navigates
away, via the effect's own cleanup running on blur, not a manual toggle
that could be forgotten. Uses `overlay-swipe` behavior specifically
(swipe from the bottom edge briefly reveals the bar) rather than full
immersive mode, so a technician isn't ever completely locked out of the
system nav if they genuinely need it — only kept out of the way by
default.

### Signatory "Add" — required a real web-app schema change

Checked `app/api/signatories/route.ts` and `db/schema.ts` before building
anything, and found a real gap: **the `signatories` table had no
`locationId` column at all** — duplicate-checking was scoped to client
only, contradicting "prevent duplicates only when both Client AND
Location match." Web-side changes (separate patch,
`signatories-location-web-patch.zip`, same deploy pattern as the GPS
history patch — copy into place, `npm run db:migrate`, deploy):
- `signatories.locationId` (nullable — existing rows predate this column
  and stay valid as client-only signatories)
- `GET /api/signatories` now takes an optional `locationId` and scopes
  results to that exact client+location pair (falling back to include
  client-only legacy rows regardless of location)
- `POST /api/signatories`'s duplicate check now compares
  `(firstName, lastName, clientId, locationId)` instead of just the first
  three, and returns the new signatory's `id` in the response — needed so
  the mobile app can auto-select it immediately rather than fragile
  name-matching against a refetched list

Mobile side: a "+" button next to the signatory picker opens an inline
first/last-name form, POSTs scoped to the exact printer's client+location,
and surfaces the server's real duplicate message on a 409 rather than a
generic failure.

### Offline queue — rebuilt to match web, and this is what actually fixes your reported "Save Maintenance Error"

New `SyncStatusPanel` component mirrors `components/SyncStatusIndicator.tsx`
field-for-field: status chip (dot + icon + label + pending-count badge),
a panel with Connection / Pending reports · Queued uploads / Last
successful sync, a manual "Sync now", and — the actual missing piece —
**every queued report now shows its real `lastError` text**, not just
"failed (3 attempts)" with nothing explaining why.

**Important honesty note:** I have not seen what that specific failed
report's actual error message says — the screenshot only showed the
generic "failed (3 attempts)" the old UI was limited to. This change
makes that error visible; it doesn't itself diagnose or fix whatever
that specific failure was. **Please check the panel again and send me
the `lastError` text it shows for that report** — that's the concrete
next step to actually resolve it, rather than guessing blindly at a
cause I can't currently see.

Mobile's status model (`pending` / `syncing` / `failed`) is coarser than
web's richer enum (which also tracks `uploading-images` vs
`uploading-signature` vs `uploading-report` as distinct phases) — matching
that finer breakdown would mean instrumenting `sync-engine.ts` to report
progress mid-attempt, not done here. The three states mobile does track
are the ones that actually change what a technician needs to do about a
report.

`useOfflineSync` also gained a real `lastSyncAt` (persisted via
AsyncStorage, survives app restarts) and a lightweight 3s poll of the
local SQLite queue purely to keep the panel's counts/list visually live
while open — separate from the actual sync-trigger logic (connectivity
transitions + app foreground), which is unchanged.

## ⚠️ Black screen on every device — found and fixed a real startup bug

Reported as: successful EAS build, installs fine, opens to a black
screen — reproducible on a real phone, a second real phone, AND the
emulator. That consistency across every device (not just one) was the
key clue: this pointed at the build itself, not a device quirk.

**The actual bug**, found in `App.tsx`:
```ts
if (!CLERK_PUBLISHABLE_KEY) {
  console.error(...);   // only logs
}
return <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} ...>  // mounts anyway, even if empty
```
If `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` isn't actually available to the
**cloud** build — a very common EAS gotcha, since a local `.env` file is
**not** automatically uploaded to EAS's build servers — this mounts
`ClerkProvider` with an empty string. Clerk's SDK validates the key
immediately and throws/hangs on an empty one. In a release/preview build
(unlike dev-client testing) there's no red-box error screen to show that
— an uncaught startup error just renders nothing, which is exactly what
"black screen, every device" looks like from the outside.

**Two fixes, both needed:**
1. **`src/components/RootErrorBoundary.tsx`** (new) — wraps the whole app.
   Any future startup crash now shows the actual error message and stack
   on-screen (hardcoded colors, deliberately not using the app's theme
   system, since it has to render even if the crash happened inside
   `ThemeProvider` itself) instead of silently going black. This is the
   permanent fix — the next time something like this happens, it'll be
   immediately diagnosable instead of another round of "which of five
   things could this be."
2. **`App.tsx`** — the missing-key check now actually stops before
   mounting `ClerkProvider`, showing a clear "Configuration Missing"
   screen naming the exact env var and pointing at the real fix
   (`eas env:create`) instead of proceeding anyway.

**This doesn't fix the root cause by itself** — only makes it visible.
**You still need to actually register the env vars for EAS cloud builds:**
```powershell
npx eas-cli@latest env:create
```
(prompts for name/value/environment — do this for both
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_FIIX_API_BASE_URL`,
for whichever environment matches your `preview` build profile), **then
rebuild.**

**This one specific fix needs a full rebuild, not `eas update`** — even
though the change itself is pure JS (normally Case A), the crash this
fixes happens early enough in startup that it's plausible `expo-updates`
never gets a chance to check for/apply an OTA update before hitting it.
Ship this one as a real build to be certain it actually lands, then go
back to `eas update` for the next genuinely JS-only change after this.

## EAS Update infrastructure — fully configured

Both `projectId` and `updates.url` in `app.json` now hold real values
(`b30fc50c-5fb1-4612-9aa6-a20c68819cf5`, and the deterministic
`https://u.expo.dev/<that-id>` URL Expo always uses — no `eas
update:configure` needed once the ID itself is known, since that URL
pattern is fixed, not project-specific lookup data).

- `expo-updates` (`~29.0.19`, the real SDK 54 version).
- `runtimeVersion: { policy: "fingerprint" }` — ties every OTA update to
  the exact native build it's safe to apply to, computed automatically
  from the actual compiled native code/config rather than a
  manually-bumped version number. Matters specifically here given how
  much native surface this project has already been through (the NDK
  swap, `expo-font`, `react-native-get-random-values`, the Solana
  autolinking exclusion) — "fingerprint" detects all of that
  automatically rather than needing hand-maintenance that would quietly
  go stale.

**This round of changes (adding `expo-updates` itself) is Case B** — the
currently-installed APK predates `expo-updates` entirely and has no
update-checking mechanism at all, so it needs one more manual rebuild +
install before OTA updates can start working. After that:

```powershell
npx eas-cli@latest update --branch preview --message "describe the change"
```
ships any future Case A (JS-only) change instantly, no rebuild, no
reinstall — picked up automatically the next time the app cold-starts on
a device whose native fingerprint matches. A build with a different
native fingerprint (i.e. after any future Case B change) won't apply a
mismatched update — that's the fingerprint policy doing its job, not a
bug if you see it skip.

## ⚠️ `expo-doctor` finding: missing `expo-font` peer dependency (fixed)

`expo-doctor` correctly flagged this — `@expo/vector-icons` (used for
every `Feather` icon throughout the app: Dashboard, Maintenance forms,
tab bar, etc.) has a native peer dependency on `expo-font` that was never
explicitly installed. It likely "worked" in testing so far because
something else in the dependency tree pulled it in transitively, but
Expo's own guidance is correct that native module peer deps need to be
direct, explicit dependencies — a transitive copy isn't guaranteed to
stay present or be the right version. Added at the real SDK 54 version
(`~14.0.12`, verified the same way every other Expo package in this
project was — against Expo's own `bundledNativeModules.json` for the
`sdk-54` branch, not guessed). **This is a native module — needs
`npx expo prebuild --clean` + a real rebuild**, not just a JS reload.

Worth re-running `npx expo-doctor` after any future dependency changes —
it's a good cheap sanity check and would have caught this one immediately
if run earlier.

## Location Access disclosure + explicit background-permission gate on Time In

Minimal, targeted change to `DashboardScreen.tsx` — the geofence distance
logic, the 10s/15m GPS config (`src/config.ts`, unchanged), and the
existing "background GPS starts only once `onDuty` flips true" effect are
all untouched.

What changed:
- Tapping **Time In** now opens a disclosure modal first (explains on-duty
  background tracking, the four purposes it's used for, and that it stops
  at Time Out) — the actual `timeInMutation` only fires after the
  technician taps **Continue** in that modal, not on the original button
  press.
- Foreground-then-background permission requesting is unchanged
  (`requestLocationPermissions()` in `src/lib/background-location.ts`
  already requested in that order).
- **Background permission denied now stops Time In entirely** instead of
  the old behavior (an `Alert.alert` warning that let Time In proceed
  anyway). The new dialog offers **Open Settings** (`Linking.openSettings()`,
  a real React Native API — no new dependency) and **Cancel**; either
  choice rejects the mutation before it ever reaches the GPS fix or the
  `/api/attendance/time-in` POST.
- A `BackgroundLocationRequiredError` marker class distinguishes that
  specific rejection from every other Time In failure, so the generic
  `onError` handler doesn't also pop a second, redundant "Time In failed"
  alert on top of the dialog that already explained the issue.

## SMS notifications (Time In / Time Out / GPS off) — already working, verified not built

Traced all three trigger points against the real server code
(`app/api/attendance/time-in/route.ts`, `app/api/attendance/time-out/
route.ts`, `app/api/gps/ping/route.ts`, `lib/sms.ts`) before writing
anything, because the mobile app might already satisfy this entirely —
and it does:

- **Time In** → `POST /api/attendance/time-in` already sends the SMS
  server-side on success. The mobile app already calls this exact route
  with the exact body it expects (`{latitude, longitude}`) — nothing to
  add.
- **Time Out** → `POST /api/attendance/time-out` already sends the SMS
  server-side, using the technician's last GPS ping (from
  `technicianGpsStatus`) for the location phrase — it doesn't even read a
  request body. The mobile app's Time Out mutation was sending
  `{latitude, longitude}` anyway, a leftover that route silently ignored;
  removed as a small real cleanup (one less GPS fetch on the Time Out
  path, no functional change).
- **GPS turned off** → `POST /api/gps/ping` with `{enabled: false}`
  already implements the ON→OFF transition detection (compares against
  the *previous* stored state, alerts once per off-episode, gated on the
  technician still being on duty) and sends the SMS. `background-
  location.ts` already sends exactly this payload, from two places: the
  deliberate stop path (`stopBackgroundGpsReporting()`) and the
  TaskManager task's own `error` branch (covers the OS revoking location
  permission/services mid-shift, not just an app-initiated stop).

**One thing worth being confident about, not just assuming**: a normal
Time Out doesn't also fire a false "GPS turned off" alert, even though
`stopBackgroundGpsReporting()` does run right after. Checked the actual
ordering: it only runs once `onDuty` flips to `false` in the component,
which only happens after `timeOutMutation`'s `queryClient.invalidateQueries`
round-trip confirms the server already recorded `timeOut` — so by the
time the stop-ping reaches `/api/gps/ping`, that route's own `onDuty`
check is already `false` server-side, and it correctly skips the alert.
Two separate client actions, correctly sequenced against server state,
not a race.

`smsRecipients` (joined against `users.contactNo`, filtered to
Admin/Scheduler, `isActive = true`) and the Semaphore API call are both
entirely server-side, shared by every trigger point via
`lib/sms.ts`'s `getActiveSmsRecipientNumbers()` / `sendSmsToRecipients()`
— exactly the "reuse existing database structure, don't build a parallel
system" requirement, satisfied by construction since this is the same
code the web app already runs.

**To verify this is actually working for you:** confirm at least one row
in `smsRecipients` has `isActive = true` and points at a user with role
Admin/Scheduler and a valid `contactNo`, then Time In/Time Out on the
phone (or toggle airplane mode on/off mid-shift for the GPS case) and
watch for the text.

## ⚠️ Android build: unwanted Solana wallet-adapter module in autolinking (fixed)

If a native build fails with something like:
```
CMake Error ... add_subdirectory given source
".../@solana-mobile/mobile-wallet-adapter-protocol/android/build/generated/source/codegen/jni/"
which is not an existing directory.
```
this app doesn't use Solana wallet sign-in anywhere — `@clerk/expo` bundles
it as one of several *optional* auth strategies, which pulls in
`@solana-mobile/mobile-wallet-adapter-protocol` as a real transitive
dependency purely because it's reachable in `node_modules`:
```
@clerk/expo -> @clerk/clerk-js -> @solana/wallet-adapter-react ->
@solana-mobile/wallet-adapter-mobile -> @solana-mobile/mobile-wallet-adapter-protocol
```
That package declares a full native Android module with `codegenConfig`
in its `package.json`, so React Native's autolinking tries to build it
regardless of whether it's actually used — and its own codegen setup
doesn't produce the expected output under this project's RN/CMake
version. Fixed with `react-native.config.js` at the project root, which
tells autolinking to skip that specific package entirely (confirmed it's
the *only* package in that dependency chain with `codegenConfig` — the
other three Solana packages pulled in alongside it are pure JS and were
never actually the problem). Takes effect on the next
`npx expo prebuild --clean`, no other changes needed.

## ⚠️ Save Maintenance crash + full field/validation parity pass

Two real bugs plus a full field-parity rebuild, all checked directly
against `components/pages/Maintenance.tsx`, `validation/maintainSchema.ts`,
and `app/api/maintain/route.ts` — not assumed:

1. **`crypto.getRandomValues() not supported` crash on Save.** `uuid`
   calls Web Crypto under the hood, which Hermes doesn't provide
   natively. Fixed with `react-native-get-random-values`, imported as the
   very first line of `App.tsx` (has to install itself before `uuid` — or
   anything else — gets a chance to run). **This one has real native code
   — needs `npx expo prebuild --clean` + a full rebuild, not just a JS
   reload.**
2. **The `gps` object was missing required fields entirely.**
   `gpsFixSchema` requires `accuracy` and an ISO `capturedAt` timestamp
   with no server-side defaults for either — the previous version only
   sent `{latitude, longitude}`, which `maintainSubmitSchema.safeParse()`
   would have silently 400-rejected the moment the crash above was fixed.
   Now sends the full shape: `accuracy`, `altitude`, `heading`, `speed`
   (the latter two normalized to `null` when expo-location reports `-1`
   for "unknown," since the schema's `min(0)` would otherwise reject
   them), `capturedAt`, `gpsProvider`, `isMockLocation`.
3. **Full Work Done / Services field parity**, matching the web form
   field-for-field: Head Clean, Ink Flushing, Refill Ink (parent +
   individual C/M/Y/K), Reset (parent + Box/Program), Cleaning of
   Printer, Cleaning of Waste Tank, Replacement (+ multi-select parts
   picker), Repair (+ parts picker), Replace Service Unit (+ QR-scanned
   serial, reusing the same scan-bridge pattern `MaintenanceListScreen`
   already uses for the printer's own serial). Client-side validation
   mirrors `maintainFormSchema`'s `.refine()` chain rule-for-rule (same
   five conditional-requirement rules, same order) as plain checks rather
   than pulling in zod/react-hook-form for one screen.

**Not replicated:** the web form's "Prepared By" display (shows the
signed-in technician's name read-only) — purely cosmetic, `userId` is
already captured and sent correctly, this would just be a label with no
effect on what's saved.

## Google Maps navigation: real origin + real route (not just a pin)

Enhanced per the explicit follow-up request — the icon now:

- Resolves the technician's **actual current position** at tap time
  (`expo-location`, foreground permission + a fresh fix) and passes it as
  an explicit `origin` in the Maps URL, rather than omitting it and
  hoping the Maps app infers current location on its own.
- Uses `https://www.google.com/maps/dir/?api=1&origin=...&destination=...&travelmode=driving`
  — Google's real directions endpoint, which renders an actual
  turn-by-turn route between the two points, not just two dropped pins.
- Shows a small spinner on the specific tapped card's icon while
  resolving location (usually under a second, but real feedback matters
  for anything GPS-dependent given how much of this project's debugging
  has been exactly that).
- Degrades gracefully, not silently: if location permission is denied or
  a fix can't be obtained, it still opens Maps with just the destination
  (Maps' own device-location inference takes over) rather than blocking
  navigation entirely over a permission issue.
- "Selecting" a client/location IS tapping that card's own icon — there's
  no separate select-then-navigate step, since each card already
  represents exactly one client/location and its icon already scopes the
  action to that one stop.

## ⚠️ Second real bug: status dropdown value type also wrong

Same root cause class as the printer-lookup crash above, caught while
double-checking every remaining `.value` access after that fix rather
than assuming they were fine: `GET /api/dropdown/status`'s `value` field
is `CAST(status.id AS TEXT)` (see `lib/fetchDropDownData.ts`'s
`getStatus()`) — a **string**, not a number. `StatusOption` was typed as
`{value: number}` without ever checking the live route, which TypeScript
can't catch on its own (it only checks code against the annotation it's
given, not the actual API). Fixed: `statusId` state, the `StatusOption`
type, and the submit payload (`Number(statusId)`, matching the same
parse-at-the-boundary pattern already used for `signatoryId`) all
corrected to treat it as a string end-to-end.

**If you're still seeing the exact same crash after pulling this update**,
the most likely explanation is a stale Metro bundle rather than a new
bug — the specific `.value`-of-undefined error only existed in the code
*before* the previous fix, and a plain reload doesn't always pick up
every change. Do a full stop (Ctrl+C, not just backgrounding the
terminal) and restart with the cache explicitly cleared:
```powershell
npx expo start --dev-client -c
```

## ⚠️ Real crash fixed: printer lookup response shape was wrong

`MaintenanceFormScreen` and `MaintenanceListScreen` both assumed
`GET /api/maintain?serialNo=` returned a flat object with `{value,
label}` sub-objects for `client`/`location`/`department`/`model` — that
assumption was never actually checked against the route source, and it's
wrong. Confirmed against `app/api/maintain/route.ts` directly after a
crash report (`Cannot read property 'value' of undefined`): the real
shape is
```
{ maintenanceData: { id, deploymentId, serialNo, modelId, model,
                      clientId, client, locationId, location,
                      departmentId, department },
  signatories: [{value, label}] }
```
— `client`/`location`/`department`/`model` are plain **string** names,
`client.value` doesn't exist because `client` isn't an object at all.
Both screens rewritten against the real shape. Two side benefits fell
out of fixing this properly rather than patching around it: the
`{value,label}` pairs `maintainFormSchema` actually requires on *submit*
are now built explicitly from the separate id+name fields (clearer than
hoping a passthrough happened to match), and **signatories turned out to
already be included in this same response** — the previous version's
separate `GET /api/signatories?clientId=` call was redundant and has
been removed.

## ⚠️ Pre-Time-In itinerary preview + Google Maps navigation (REQUIRES a web deploy)

This is the one feature in this project that isn't mobile-only — it needs
a small, deliberate backend change to the actual deployed web app, because
**no existing API exposes per-client GPS coordinates for the Technician
role.** Checked carefully before touching anything:

- `GET /api/location-coordinates` exists and does exactly this (built for
  the web Schedule module's map links), but is **Admin/Scheduler-only** —
  widening it to Technician wasn't the right move since it's scoped to a
  different module's needs (schedulers planning routes, not a technician's
  own day).
- `GET /api/attendance/status` — the route this app already depends on for
  the Time In gate — only fetched geofence coordinates for the **first**
  itinerary stop, needed for the distance check. Every other stop had no
  coordinates in the response at all.

**The fix:** `app/api/attendance/status/route.ts` now does one additional
batched query (all of today's + tomorrow's stop locations in a single
`inArray` lookup, not N+1) and attaches `latitude`/`longitude` directly to
every itinerary stop, not just the first. Both the modified route file and
a clean diff are included alongside this zip
(`attendance-status-route.ts` / `attendance-status-route.patch`) —
**apply this to the actual web repo and deploy it, or the new map icons
below will just not appear** (the field will be `null` and the icon hides
itself, rather than erroring — see the mobile-side handling — but the
feature won't work until this ships).

**What the mobile app now does**, once that backend change is live:

- The Dashboard's pre-Time-In view shows **every** scheduled stop for
  today as its own card — not just the first one the Time In gate itself
  cares about — matching the explicit requirement that this preview work
  before Time In, with no session required.
- Each card is per **client** (one row per stop), not per printer — the
  per-printer breakdown from the previous feature only appears once
  actually on duty, which is a deliberate, different level of detail for
  a different moment (planning the day vs. doing the work).
- Each card has a GPS/navigation icon, shown only when that location has
  coordinates on file. Tapping it opens
  `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}` —
  Google's turn-by-turn **directions** URL (not the plain pin-drop
  `?q=` form used elsewhere in the web app, e.g.
  `components/columns/maintenance-history/columns.tsx`) since "navigate
  to" was explicit in the request. This is a universal `google.com` URL,
  so it opens the Google Maps app if installed or falls back to a browser
  automatically on both platforms — no platform-specific deep-link
  handling needed.

## Itinerary → Maintenance: tap a printer, auto-populated, schedule-linked

This required tracing the real web behavior first (`components/pages/Dashboard.tsx`
→ `onCardClick` → `app/(root)/dashboard/page.tsx`'s `handleCardClick`) rather
than guessing, and it turned up two things worth knowing:

- **One itinerary "stop" (client+location) can hold multiple printers.**
  Each is its own `scheduleDetails[]` row with its own `serialNo` — not one
  flat itinerary item. Today's itinerary is now fetched from
  `GET /api/schedule?technicianId=&scheduledAt=` (the *Dashboard-consumer*
  branch of that route — no `pageSource` param, which is what makes it
  open to the Technician role; the other branch is Admin/Scheduler-only)
  instead of the flatter `attendance/status` itinerary, and renders one
  tappable row per printer. An already-maintained printer is shown
  checked-off and tapping it just confirms rather than reopening the form.
- **A hard-required field was missing entirely: `signatoryId`.** Checked
  directly against `validation/maintainSchema.ts` — `signatoryId:
  z.number().min(1, ...)` has no `.optional()`. Every report the mobile
  app queued before this fix would have synced the photo/signature
  successfully and then had the actual `/api/maintain` POST **silently
  rejected** with no user-visible symptom until someone checked the web
  app and found nothing arrived. Fixed with a required signatory picker
  (`GET /api/signatories?clientId=`), auto-selected when a client has
  exactly one.
- **Schedule linking was entirely missing.** Web's sync pipeline
  (`features/offline-sync/sync-engine.ts`) does a *second* call after a
  successful `/api/maintain` POST — `POST /api/sched-details
  {schedDetailsId, mtId}` — which is what actually marks the itinerary
  row "done" server-side. Without it, a Technician could submit a
  complete, correct report and the web dashboard would still show that
  stop as pending forever. `offline-db.ts` gained a `schedDetailsId`
  column (nullable — only itinerary-originated reports have one; scanned/
  manually-entered serials don't, matching web) and `sync-engine.ts` now
  performs this second call, retrying it safely on failure since the
  `/api/maintain` POST is idempotent via `clientUuid`.

Navigation params for `MaintenanceForm` simplified to just `serialNo` (+
optional `schedDetailsId`/`originMTId`) — the form always resolves
printerId/deploymentId/client/location/department/model itself from that
one identifier via the existing `/api/maintain?serialNo=` lookup, so
there's a single source of truth regardless of whether the form was
opened by tapping an itinerary row, scanning a QR code, or typing a
serial number manually.

**Still not wired up** (unchanged from earlier scope notes): replace/
repair part pickers, CMYK checkboxes, reset sub-options — all
schema-*optional*, so their absence doesn't block a submission, only
reduces how much detail it carries. Also not implemented: adding a new
signatory from the mobile app (web's "+ Add Signatory," `POST
/api/signatories`) — this screen only lets a Technician pick from a
client's existing list.

## Theme system (light/dark) + location/GPS robustness fixes

Two changes in this round, both cross-cutting:

- **Light/dark theme toggle** (`src/theme/`) — both palettes converted
  directly from the web app's actual OKLCH tokens (`app/globals.css`,
  `:root` for light and `.dark` for dark), not approximated. Every screen
  moved from a static `theme` import to `useAppTheme()` + a
  `createStyles(theme)` factory function (the standard RN pattern for
  StyleSheets that need to react to runtime state), so switching modes
  re-renders every screen live. Preference is persisted via AsyncStorage;
  if the user has never explicitly chosen, it follows the OS light/dark
  setting and updates live if that changes — same "no explicit toggle"
  default behavior the web app has. Toggle UI lives on the Profile screen
  (Light / Dark / System).
- **Location fetching was hanging silently** — the original Dashboard
  only had a single source of truth (`watchPositionAsync`'s first
  callback) for the live distance reading, with no timeout and no
  distinction between "still waiting," "permission denied," or "no GPS
  provider at all," so a fix that never arrived just showed "Checking
  your location…" forever. This is **exactly** what happens on an Android
  emulator with no mock location set — emulators have no real GPS
  hardware. Fixed on the app side with an explicit timeout (12s) and
  distinct error states (permission denied vs. timeout), but the
  underlying fix for testing on an emulator is external to the app: open
  Android Studio's **Extended Controls → Location**, set a lat/long, and
  hit **Send** (or `adb emu geo fix <lon> <lat>` from a terminal) — or
  just test on the physical phone used earlier in this project, which
  doesn't have this problem at all.
- **GPS ping interval set to 10s** (`GPS_PING_INTERVAL_MS` in
  `src/config.ts`) per explicit request. Worth knowing: the web app's own
  `GpsReporter` pings every **5s**, not 10 — the two intervals don't need
  to match (the server just stores whichever ping arrived most recently,
  from either client independently), but if Admin/Scheduler dashboards
  expect sub-10s freshness specifically from mobile technicians, that's a
  one-line change back in `config.ts`.

## ⚠️ Sign-in strategy confirmed: Google + Facebook SSO (not password)

Checked against the Clerk Dashboard for this instance — **SSO Connections:
Google and Facebook**, no password or email-code strategy enabled.
`SignInScreen.tsx` was rewritten around this using `useSSO()` from
`@clerk/expo/experimental` (Clerk's own source doc-comments specifically
recommend the experimental hook over the base one for Core 3 apps — it
drives the whole OAuth round trip, including finalize/setActive, so
there's nothing left to call manually after `startSSOFlow` resolves).

**One Clerk Dashboard setting to double check before this works in a real
build:** the native redirect URI. `useSSO()` builds
`fiixtechnician://sso-callback` from this app's `scheme` in `app.json`.
Clerk Dashboard → **Configure → SSO Connections → (Google/Facebook) →
Redirect URIs** (or **Paths** depending on dashboard version) needs that
exact URI allow-listed, or the OAuth callback will fail after the user
approves in the browser. If you get redirected to Google/Facebook
successfully but land back in a broken state afterward, this is the first
thing to check.

## ⚠️ Auth bug found and fixed this round (background ping token)

The first draft of `background-location.ts` read a token from SecureStore
under the key `__clerk_client_jwt` and forwarded it as the API bearer
token. Checking `@clerk/expo`'s actual source
(`node_modules/@clerk/expo/dist/provider/nativeClientSync.js`) showed that
key is Clerk's internal **device/client sync** token — used to restore
which Clerk `Client` a device belongs to across app restarts — **not** a
session JWT valid for calling our own API routes. Left as-is, this would
have meant every background ping came back `401` while everything else in
the app (which goes through `useAuth().getToken()`) worked fine — exactly
the kind of bug that's invisible until you're testing on a real device.

Fixed by switching to `getClerkInstance()` (a top-level `@clerk/expo`
export, the same singleton `ClerkProvider` uses internally) and
`clerkInstance.session?.getToken()` — confirmed against the doc comment in
Clerk's own source, which shows this exact `getClerkInstance() →
session.getToken() → fetch(...)` pattern as the intended way to get a
valid token outside React. Also swapped the hand-rolled SecureStore token
cache for `@clerk/expo/token-cache`'s built-in one (a real exported
subpath, uses `AFTER_FIRST_UNLOCK` keychain accessibility) instead of
reimplementing it.

## ⚠️ SDK version note (read if you pulled an earlier copy of this project)

The project was originally scaffolded on **Expo SDK 51**. That build fails
during Android's Gradle step with:
```
Could not resolve all dependencies for configuration ':clerk-expo:kotlin-extension'.
> Could not find org.jetbrains.kotlin:kotlin-compose-compiler-plugin-embeddable:1.9.22.
```
Root cause: `@clerk/expo` 4.x's native Android module requires **Kotlin
2.0+ / Jetpack Compose**, which only ships with **Expo SDK 54+**. This
wasn't visible at typecheck time — it only surfaces once Gradle tries to
resolve native dependencies. The whole dependency set (`expo`, `react`,
`react-native`, every `expo-*` package, React Navigation, gesture-handler,
etc.) has since been bumped to their real SDK 54–compatible versions,
checked directly against Expo's own SDK 54 release templates on GitHub
rather than guessed. If you have an older copy: delete `node_modules`,
`package-lock.json`, and the generated `android/` folder, then
`npm install --legacy-peer-deps` and `npx expo prebuild` again.

Two other things changed by this same upgrade, both already fixed here:
- **`expo-file-system` v19** replaced the old
  `writeAsStringAsync`/`cacheDirectory` API with a class-based
  `File`/`Directory`/`Paths` API — `MaintenanceFormScreen.tsx`'s signature
  save now decodes the signature's base64 PNG with `base64-js` and writes
  it via `new File(Paths.cache, ...).write(bytes)`.
- **`@clerk/expo` 4.x** replaced the old `useSignIn()` shape
  (`isLoaded`/`create()`/`attemptFirstFactor()`) with a new signals-based
  "Future" API (`signIn.password()` → `signIn.finalize()`) —
  `SignInScreen.tsx` was rewritten against it, verified against the
  installed type definitions directly, not assumed.

## ⚠️ Metro bundling: "Unable to resolve react-native-webview" (fixed)

If bundling fails with:
```
Unable to resolve "react-native-webview" from ".../react-native-signature-canvas/index.js"
```
`react-native-signature-canvas` renders the actual signing pad inside a
WebView under the hood — `react-native-webview` is a real (if undeclared
as a hard dependency by that package) requirement, and it was missed when
this project was first scaffolded. Fixed by adding it as an explicit
dependency at the SDK 54–correct version. **Unlike the `react-dom` fix
above, this one has real native Android/iOS code — it needs a full**
`npx expo prebuild --clean` **and native rebuild, not just a JS reinstall.**

## ⚠️ Metro bundling: "Unable to resolve react-dom" (fixed)

If bundling fails with:
```
Unable to resolve "react-dom" from ".../@clerk/react/dist/hooks-....cjs"
```
this is Metro (RN's bundler) being stricter than Node about static
`require()` calls — `@clerk/react`'s shared internal module (used by
`@clerk/expo` under the hood) has a plain `require("react-dom")` that's
never actually executed on native, but Metro still needs to *resolve* it
at bundle time regardless of whether it runs. Clerk marks `react-dom` as
an **optional** peer dependency specifically because of this — optional
peers aren't auto-installed by `npm install`, so it was simply missing.
Fixed by adding `react-dom` as a real (non-optional) dependency, pinned to
the same version as `react`. This is JS-only — no native rebuild needed,
just `npm install` and re-bundle.

## ⚠️ Android build: Windows path length & duplicate META-INF resource

Two unrelated build-tooling issues you may hit on a first Windows build,
neither a sign anything is actually wrong with the app code:

- **`Filename longer than 260 characters`** during the native CMake/ninja
  step (usually from `react-native-gesture-handler`'s codegen output) —
  Windows' default 260-character path limit, made worse by a long or
  nested project path. Fix: move the project to a short path near the
  drive root (e.g. `C:\rn\fiix`, not nested inside itself), **and**
  enable Windows long-path support (`gpedit.msc` → Computer Configuration
  → Administrative Templates → System → Filesystem → "Enable Win32 long
  paths", or the `LongPathsEnabled` registry key), then restart and
  `npx expo prebuild --clean`.
- **`2 files found with path 'META-INF/...'`** during
  `mergeDebugJavaResource` — two JAR dependencies shipping a file at the
  identical path inside the APK (here, `okhttp3:logging-interceptor` and
  `jspecify`, both transitive). Fixed via `expo-build-properties`'s
  `android.packagingOptions.pickFirst` in `app.json`, which tells Gradle
  to take the first match instead of failing. If a *different* conflicting
  path shows up in a later build, add that path string to the same
  `pickFirst` array and `npx expo prebuild --clean` again — same fix,
  different filename, and routine as native dependencies accumulate.

## Architecture

- **No direct database connection.** This app talks to the *same*
  Next.js API routes the web app already uses
  (`https://www.fruitbeanink.com/fiix/api/*`), authenticated with the same
  Clerk instance. A Neon connection string was deliberately **not** put in
  this app — a mobile bundle can be decompiled, and an embedded DB password
  would give anyone full read/write access to production, bypassing every
  `requireRole()` check, geofence validation, and idempotent-migration
  safeguard the API layer already enforces. See the conversation history
  for the fuller rationale; this was a explicit decision, not an oversight.
- **Auth:** `@clerk/expo` (the current package — `@clerk/clerk-expo` is
  deprecated and was swapped out during setup). Session token is sent as
  `Authorization: Bearer <token>` on every API call; `@clerk/nextjs`'s
  `auth()` on the server accepts that exactly like the web app's session
  cookie, so **no server-side changes were needed** to support this client.
- **Technician-only gate:** `RootNavigator` mirrors `middleware.ts`'s
  active/role checks, then adds one more: any role other than `Technician`
  sees `UnsupportedRoleScreen` and is asked to use the web app instead.
- **Background GPS:** `src/lib/background-location.ts` — `expo-location` +
  `expo-task-manager`, pinging `POST /api/gps/ping` on the same 15s cadence
  and payload shape as web's `GpsReporter`, so the server can't tell (and
  doesn't need to) which client sent a given ping.
- **Offline queue:** `src/lib/offline-db.ts` (SQLite) +
  `src/lib/sync-engine.ts`, full parity with the web app's Dexie-based
  offline-sync pipeline — same presign→PUT-to-R2→`POST /api/maintain` flow,
  same `clientUuid` idempotency key matching `maintain.clientUuid`'s
  `onConflictDoNothing` constraint.

## Setup

1. `npm install --legacy-peer-deps` (a few transitive deps still pin older
   peer ranges; `--legacy-peer-deps` is safe here and was used throughout
   development). Uses **Expo SDK 54** — see the version note above if
   anything looks older than that.
2. Copy `.env.example` to `.env` and fill in:
   - `EXPO_PUBLIC_FIIX_API_BASE_URL` — defaults to production
     (`https://www.fruitbeanink.com/fiix`); point at a local/staging Next.js
     server during development.
   - `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` — **must be the same Clerk
     instance's publishable key** the web app uses, or sessions won't be
     recognized by the API routes.
3. `npx expo prebuild` then `npx expo run:android` / `run:ios` — this app
   uses native modules (background location, camera) that require a
   development build; **Expo Go will not work** for the background-location
   feature.
4. On first run, grant location "Allow all the time" (Android) / "Always"
   (iOS) when timing in — foreground-only permission still lets you time in
   but defeats the entire point of this app.

## Verified against the real backend during this build

Every API contract below was checked against the actual route source, not
assumed — several didn't match my first guess and were corrected in place:

- `/api/gps/ping`, `/api/attendance/status`, `/api/attendance/time-in`,
  `/api/attendance/time-out` — request/response shapes match exactly.
- `/api/maintain` (not `/api/maintain-report`, which is Admin/Scheduler-only
  reporting) is the real submission endpoint; body uses `nozzlePath` /
  `signPath` (R2 object **keys**, not URLs) and `clientUuid` for
  idempotency.
- File uploads are presign-then-PUT-to-R2 via `/api/get-upload-url`
  (`{key, contentType, bucketName}` → signed PUT URL), not a multipart POST.
- `/api/user-status` returns the full `users` row (no purpose-built DTO) —
  screens read `contactNo`/`birthday`/`isActive`/`role` directly off it.
- Registration is a **two-call** flow: `/api/verify-otp` (phone + otp only)
  then a separate `/api/save-profile` call — saving a profile does **not**
  activate the account.
- `/api/profile` is `PUT`, not `PATCH`, and only updates
  `firstName/lastName/middleName/contactNo/email` (not `birthday`).

## Known gaps / next steps

- **Maintenance form field parity.** The real form
  (`validation/maintainSchema.ts`) has replace/repair part pickers, CMYK
  checkboxes, and reset sub-options that aren't wired up yet — what's here
  (status, notes, required nozzle photo, signature, GPS) is enough to
  submit a valid minimal report, and extending it is the same
  dropdown-fetch + checkbox pattern already used, not new architecture.
- **QR scan hand-off** uses a small pub/sub bridge (`scan-bridge.ts`) since
  React Navigation doesn't have a built-in "return a value up the stack"
  pattern for a stack navigator — works, but worth knowing it's there if
  you add more scan call sites.
- **iOS background reliability is a hard OS ceiling, not a code gap.**
  `background-location.ts` has the full explanation; the short version is
  Android can run a genuinely continuous foreground-service ping, iOS
  cannot guarantee the same interval even with every entitlement set
  correctly. Set expectations with dispatch accordingly for iOS
  technicians, and consider asking Android users to disable
  battery-optimization for this app (a device Settings action this app
  can't force).
- **Typechecked but not runtime-tested.** `npx tsc --noEmit` passes clean
  and `npm install` resolves, but this hasn't been run on a simulator/
  device or against the real API — do that before rolling it out.

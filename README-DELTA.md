# delta-004 — Full offline capability

Copy `App.tsx`, `package.json`, and `src/` over the same paths in the
project root. Run `npm install` after applying — three new packages.

## New files
| Path | Purpose |
| --- | --- |
| `src/components/OfflineBanner.tsx` | Global "You're offline — showing saved data" banner, mounted above the navigator so it's visible on every screen |
| `src/hooks/useIsOnline.ts` | Minimal NetInfo hook for screens that just need the boolean |
| `src/lib/prefetch.ts` | Warms the cache for every printer/support-service form on today's itinerary while still online |

## Modified files
| Path | Change |
| --- | --- |
| `package.json` | Added `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister` (both pinned to `^5.79.0`, matching the existing `@tanstack/react-query` pin) |
| `App.tsx` | `QueryClientProvider` → `PersistQueryClientProvider` (AsyncStorage-backed, 7-day retention); `networkMode: "offlineFirst"`; wired `onlineManager`/`focusManager` to NetInfo/AppState (see below); mounted `<OfflineBanner />` |
| `src/navigation/RootNavigator.tsx` | Passes `onRetry` to `AccountPendingScreen`'s network-error state |
| `src/screens/AccountPendingScreen.tsx` | Added a Retry button and offline-aware messaging for the network-error case — previously this screen only offered Sign Out, which doesn't help when the actual problem is no connectivity |
| `src/screens/DashboardScreen.tsx` | Calls `prefetchTodaysWork` once schedule + support services load while online; offline-aware error messages on `statusQuery`/`scheduleQuery`/`supportQuery` |
| `src/screens/MaintenanceFormScreen.tsx`, `SupportServiceFormScreen.tsx`, `PrinterHistoryScreen.tsx` | Distinguish "offline, never downloaded" from "genuine server error" in their error states |

## What this actually closes

The offline **write** path (queued maintenance reports and support
services, R2 uploads, idempotent sync via `clientUuid`) already existed
and needed no changes — that part of "offline-capable" was solid before
this delta.

The gap was **reads**: every `GET` hit the network live, with an
in-memory-only cache. The app stayed usable through a signal drop within
one running session, but any app restart while offline wiped everything,
including the login/role gate itself.

Three things close that:

1. **Persistence** (`App.tsx`) — the query cache now survives app
   restarts via AsyncStorage, 7-day retention.
2. **Prefetch** (`prefetch.ts`) — the itinerary list alone doesn't
   contain what's needed to actually OPEN a maintenance or support-
   service form (signatories, print-count baseline, etc. — separate
   endpoints). Once online with today's schedule loaded, every printer
   and support-service detail on it is proactively warmed, so a
   technician who then loses signal can still open any of today's forms,
   not just ones already tapped.
3. **RN network/focus wiring** (`App.tsx`) — react-query's
   `onlineManager`/`focusManager` default to browser-only APIs
   (`navigator.onLine`, `visibilitychange`) that don't exist in React
   Native, so without this, `refetchOnReconnect`/`refetchOnWindowFocus`
   (both on by default) silently never fired. This is TanStack Query's
   own documented React Native integration pattern, now bound to the
   same NetInfo/AppState sources `useOfflineSync` and `OfflineBanner`
   already use — one shared definition of "online" across the app,
   instead of the write-queue and the read cache each guessing
   independently.

## Two things worth knowing, not fully verified this session

**Clerk's own offline cold start isn't verified.** `useAuth().isSignedIn`
has to resolve before any of this even engages — if Clerk's SDK requires
a live token refresh before considering a session valid, a technician
whose phone has zero connectivity from the moment it's turned on would
never get past that gate regardless of what's cached below it. I don't
have a way to test that in this sandbox. Worth an explicit test on a
real device in airplane mode before relying on this for a technician's
actual first action of the day.

**The interim query-key coupling.** `prefetchTodaysWork` and each
screen's own `useQuery` have to use the *exact same* `queryKey` for a
prefetch to actually land in the cache entry the screen later reads —
I matched them against the current source (`["printer-lookup", serialNo]`,
`["support-service", id]`, etc.), but this is now a real coupling: if
either side's key ever changes without the other being updated, the
prefetch silently stops doing anything useful (no error, it just warms
a cache entry nobody reads). Worth a comment where each screen defines
its key pointing back here, or a shared key-builder function, as a
small follow-up.

// src/config.ts
//
// Points at the SAME backend the web app uses — the Next.js API routes
// under fruitbeanink.com/fiix/api/* — and the SAME Clerk instance, so a
// Technician's account, DB row, and session work identically on both
// surfaces. There is no separate mobile backend and no direct DB
// connection: every request goes through the existing `requireRole()`
// checks, geofence validation, and idempotent-migration-safe DB layer
// that already exist server-side. See README.md for why.

// Set these in a real `.env` file (via `expo-constants` / `app.config.ts`
// with `EXPO_PUBLIC_` prefixes, or EAS secrets for builds) — never commit
// real values.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_FIIX_API_BASE_URL ?? "https://www.fruitbeanink.com/fiix";

export const CLERK_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

// Ping cadence while on duty. The web app's own GpsReporter pings every
// 5s (components/GpsReporter.tsx PING_INTERVAL_MS) — this is
// intentionally set to 10s per explicit request rather than matched to
// that, since mobile's background-task wake cadence has real battery/OS
// throttling costs a foreground browser tab doesn't. Both clients ping
// independently; the server just stores whichever arrives most recently,
// so a different interval between the two is not a correctness issue,
// only a freshness-vs-battery tradeoff.
export const GPS_PING_INTERVAL_MS = 10_000;

// Foreground-service / background-task distance filter — a floor on how
// far the device must move before iOS/Android wake the app for a new fix,
// independent of the time-based interval above. 0 lets the time interval
// govern entirely; keep small since a stationary technician still needs a
// heartbeat to prove they're still ON.
export const GPS_DISTANCE_FILTER_METERS = 15;

export const BACKGROUND_LOCATION_TASK = "fiix-background-location-task";

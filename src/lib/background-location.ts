// src/lib/background-location.ts
//
// The actual point of this whole app: a GPS heartbeat that keeps sending
// while the screen is off, the app is backgrounded, or (Android) killed
// outright — none of which the web app's `navigator.geolocation.watchPosition`
// can survive. Mirrors components/GpsReporter.tsx's behavior and payload
// shape exactly, so /api/gps/ping treats a mobile ping identically to a web
// one (same ON/OFF-transition SMS alert, same technicianGpsStatus upsert).
//
// AUTH — CORRECTED FROM AN EARLIER VERSION OF THIS FILE:
// The first draft of this file read a token straight out of SecureStore
// under the key "__clerk_client_jwt" and forwarded it as the API bearer
// token. Checking @clerk/expo's actual source (node_modules/@clerk/expo/
// dist/provider/nativeClientSync.js) showed that key is Clerk's internal
// *device/client sync* token — used to restore which Clerk `Client` this
// device belongs to across app restarts — NOT a session JWT valid for
// `Authorization: Bearer` on our own API routes. Even if it were the right
// token type, session JWTs are short-lived (~60s) and meant to be re-minted
// on demand, not read once from a static cache key.
//
// The correct source is `getClerkInstance()` (exported from @clerk/expo) —
// the same singleton `ClerkProvider` uses internally — and its
// `session.getToken()`, which does the real thing: returns a valid token,
// transparently refreshing it over the network if the cached one has
// expired. This works outside the React tree (no hooks needed) as long as
// the JS engine that already ran `ClerkProvider` is still alive, which it
// is here because `expo-location`'s Android foreground service (see
// startBackgroundGpsReporting below) exists specifically to keep this
// app's process — and therefore this singleton — alive while backgrounded.
//
// Platform edge case worth knowing about, not glossed over: if Android
// ever cold-starts a *headless* JS instance purely to service this task
// without going through the app's normal bootstrap (rare with a
// foreground service active, since that's the mechanism that prevents the
// OS from killing the process in the first place, but not provably
// impossible on every OEM), `getClerkInstance()` would return an
// uninitialized instance with no session, and that ping is silently
// dropped rather than sent unauthenticated — same "never surface an error
// mid-shift" principle as the rest of this file, just worth knowing if
// pings ever show gaps specifically after the OS reclaims memory.
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getClerkInstance } from "@clerk/expo";
import {
  API_BASE_URL,
  BACKGROUND_LOCATION_TASK,
  GPS_DISTANCE_FILTER_METERS,
  GPS_PING_INTERVAL_MS,
} from "@/config";

async function getBackendToken(): Promise<string | null> {
  try {
    const clerk = getClerkInstance();
    return (await clerk.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

async function sendPing(body: Record<string, unknown>) {
  try {
    const token = await getBackendToken();
    if (!token) {
      console.log("[gps] ping skipped: no auth token available", body);
      return; // no active session to authenticate with — skip silently
    }
    const res = await fetch(`${API_BASE_URL}/api/gps/ping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    console.log(`[gps] ping sent: ${res.status}`, body);
  } catch (err) {
    // Silent to the technician by design, same rationale as the web
    // GpsReporter: a dropped ping isn't worth retrying, another one is on
    // the way shortly, and this must never surface an error mid-shift.
    // Still logged (console output isn't user-visible) — this exact spot
    // was completely silent before, with no way to tell "the request
    // never went out" apart from "it went out and nothing came back."
    console.log("[gps] ping failed", err instanceof Error ? err.message : String(err), body);
  }
}

let lastSentAt = 0;

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  console.log("[gps] task fired", { hasError: !!error, hasData: !!data });
  if (error) {
    console.log("[gps] task error", error.message);
    await sendPing({ enabled: false });
    return;
  }
  const { locations } = (data as { locations: Location.LocationObject[] }) ?? {
    locations: [],
  };
  const fix = locations?.[locations.length - 1];
  if (!fix) {
    console.log("[gps] task fired with no location in payload");
    return;
  }

  const now = Date.now();
  if (now - lastSentAt < GPS_PING_INTERVAL_MS) {
    console.log(`[gps] fix received but throttled (${now - lastSentAt}ms since last send)`);
    return;
  }
  lastSentAt = now;

  await sendPing({
    latitude: fix.coords.latitude,
    longitude: fix.coords.longitude,
    accuracy: fix.coords.accuracy ?? undefined,
  });
});

export async function requestLocationPermissions(): Promise<{
  granted: boolean;
  backgroundGranted: boolean;
}> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return { granted: false, backgroundGranted: false };

  const bg = await Location.requestBackgroundPermissionsAsync();
  return { granted: true, backgroundGranted: bg.status === "granted" };
}

export async function startBackgroundGpsReporting(): Promise<void> {
  const already = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK
  ).catch(() => false);
  if (already) {
    console.log("[gps] startBackgroundGpsReporting: already running, no-op");
    return;
  }

  lastSentAt = 0;
  try {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: GPS_PING_INTERVAL_MS,
      distanceInterval: GPS_DISTANCE_FILTER_METERS,
      // Android foreground-service notification — required by Android 8+ to
      // run a location service while backgrounded; also the honest signal
      // to the technician that tracking is active while on duty, AND the
      // reason the JS engine (and therefore the Clerk singleton above)
      // stays alive instead of being reclaimed by the OS.
      foregroundService: {
        notificationTitle: "Fiix — On duty",
        notificationBody: "Sharing your location with dispatch while you're clocked in.",
        notificationColor: "#0f172a",
        // Android's default is to tear the foreground service down when
        // the app's task is swiped away from Recents, same as any other
        // backgrounded app getting killed — false tells it this service
        // is meant to keep running past that specific event. Confirmed
        // against the installed expo-location's own type declarations
        // (LocationTaskServiceOptions in Location.types.d.ts) — this is
        // a real, currently-supported option, not deprecated/renamed.
        // Doesn't need any app.json/manifest change on top of this:
        // isAndroidForegroundServiceEnabled is already true there, which
        // is what's actually responsible for the
        // foregroundServiceType="location" manifest entry Android
        // 10+/12+/14+ require for a location foreground service to run
        // at all — this flag only changes what happens to that
        // already-correctly-declared service on task removal.
        killServiceOnDestroy: false,
      },
      // iOS: keeps delivering updates (not just significant-change) while
      // backgrounded, per the platform caveat above.
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
    });
    console.log("[gps] startBackgroundGpsReporting: started successfully");
  } catch (err) {
    console.log(
      "[gps] startBackgroundGpsReporting FAILED to start",
      err instanceof Error ? err.message : String(err)
    );
    throw err;
  }
}

export async function stopBackgroundGpsReporting(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK
  ).catch(() => false);
  if (started) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
  // Tell the server GPS is deliberately off (End Shift), same as the web
  // app's watchPosition cleanup — otherwise the last-known ON status would
  // sit stale until the next off-duty timeout logic (if any) catches it.
  await sendPing({ enabled: false });
}

// src/hooks/useGeofenceCheck.ts
//
// Extracted verbatim (behaviour-identical) from DashboardScreen's
// original Time-In-only geofence-watching effect, now that Time Out
// needs the exact same live-distance check against a DIFFERENT target
// (the last itinerary stop instead of the first). Duplicating that
// effect inline a second time would mean two copies of the timeout
// guard, the one-shot-then-watch fallback, and the cleanup logic to
// keep in sync forever — this hook is the single implementation both
// call sites use.
//
// Nothing about the STRATEGY changes from the original: try an
// immediate one-shot fix, then fall back to a continuous watch, with a
// timeout guard so "Checking…" never hangs forever if neither lands.
import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { distanceMeters } from "@/lib/geo";

export interface Geofence {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export type GeofenceCheckState =
  | { kind: "checking" }
  | { kind: "ok"; distance: number }
  | { kind: "permission-denied" }
  | { kind: "timeout" };

const LOCATION_FIX_TIMEOUT_MS = 12_000;

/**
 * Watches the device's live position against `geofence` while `enabled`
 * is true, and reports both the raw state (for rendering a status pill)
 * and a plain `withinRange` boolean (for gating a button).
 *
 * `enabled` toggling to false tears down the watch immediately (e.g. the
 * technician goes on duty, or times out) — this mirrors the original
 * effect's own dependency-driven cleanup exactly, just generalized to a
 * caller-supplied condition instead of the two hardcoded ones it used to
 * check inline.
 */
export function useGeofenceCheck(geofence: Geofence | null, enabled: boolean) {
  const [state, setState] = useState<GeofenceCheckState>({ kind: "checking" });
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    async function start() {
      if (!enabled || !geofence) return;
      setState({ kind: "checking" });

      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (perm.status !== "granted") {
        setState({ kind: "permission-denied" });
        return;
      }

      timeoutHandle = setTimeout(() => {
        if (!cancelled) setState((prev) => (prev.kind === "checking" ? { kind: "timeout" } : prev));
      }, LOCATION_FIX_TIMEOUT_MS);

      const applyFix = (lat: number, lon: number) => {
        if (cancelled) return;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        setState({ kind: "ok", distance: distanceMeters(lat, lon, geofence.latitude, geofence.longitude) });
      };

      try {
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        applyFix(fix.coords.latitude, fix.coords.longitude);
      } catch {
        // Fall through to the watch below — a failed one-shot isn't
        // fatal on its own.
      }

      watchSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 5 },
        (fix) => applyFix(fix.coords.latitude, fix.coords.longitude)
      );
    }

    start();
    return () => {
      cancelled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      watchSubRef.current?.remove();
      watchSubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, geofence?.latitude, geofence?.longitude]);

  const withinRange = geofence != null && state.kind === "ok" && state.distance <= geofence.radiusMeters;

  return { state, withinRange };
}

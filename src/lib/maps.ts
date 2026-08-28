// src/lib/maps.ts
//
// Extracted from DashboardScreen's inline openInGoogleMaps() now that
// THREE places need it (printer itinerary rows, support-service rows,
// and the pre-Time-In preview) rather than one.
//
// Mirrors the web app's lib/maps.ts: the keyless Google Maps URLs API
// (`google.com/maps/dir/?api=1&origin=&destination=&travelmode=`) — no
// API key, no billing, and a universal google.com URL rather than an
// app-specific deep-link scheme, so it opens the Google Maps app when
// installed and falls back to a browser automatically on both platforms.
//
// travelmode is `two-wheeler`, matching the web app rather than the
// `driving` this screen previously sent. Fiix technicians ride
// motorcycles, and two-wheeler is Google's real mode for exactly that —
// distinct from `bicycling`, which is human-powered and routes very
// differently. Worth knowing: two-wheeler routing coverage is regional;
// where it's unavailable Google itself falls back to driving directions,
// so this is never worse than what was sent before.
import * as Location from "expo-location";
import { Linking } from "react-native";

/**
 * Open turn-by-turn directions to a destination, with the technician's
 * CURRENT position as the explicit origin.
 *
 * The origin is resolved fresh at call time rather than reused from any
 * position state elsewhere in the app — this can be called for any stop
 * in the itinerary, not just the geofenced first one, so it needs its
 * own fix regardless of which stop is being navigated to.
 *
 * Falls back to an origin-less link (Google Maps infers current location
 * itself in that case) when permission is denied or no fix can be
 * obtained — degraded, not blocked entirely, since the destination is
 * still the genuinely useful half of the link.
 */
export async function openDirections(
  destLatitude: number,
  destLongitude: number
): Promise<void> {
  let originParam = "";
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status === "granted") {
    try {
      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      originParam = `&origin=${fix.coords.latitude},${fix.coords.longitude}`;
    } catch {
      // No fix available (GPS off, emulator with no mock location, etc.)
      // — proceed without an explicit origin.
    }
  }
  const url =
    `https://www.google.com/maps/dir/?api=1${originParam}` +
    `&destination=${destLatitude},${destLongitude}&travelmode=two-wheeler`;
  await Linking.openURL(url);
}

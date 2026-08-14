// src/lib/geo.ts
//
// Standard haversine formula — same math any geofence check needs,
// client-side here purely for the live "X meters away" display. The
// actual Time In authorization is still re-verified server-side in
// /api/attendance/time-in (this client-side number is a UX convenience,
// never trusted as the real gate — a technician could fake GPS on a
// rooted/emulated device, but the server computes its own distance from
// the coordinates it receives and rejects accordingly).
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

# delta-007 — Time Out unblocked: lastGeofence client-side fallback

Copy `src/` over the same path in the project root. One file.

## Modified files
| Path | Change |
| --- | --- |
| `src/screens/DashboardScreen.tsx` | `lastGeofence` now falls back to a value derived from `itinerary` (real, pre-existing data) when `statusQuery.data.lastGeofence` is missing, instead of going straight to null |

## Root cause

`lastGeofence` was a field I speced as a NEW backend addition in
`BACKEND-SPEC-delta-003.md` — I never got confirmation it was actually
implemented server-side. If the backend hasn't shipped it, the real API
response simply doesn't have that key, and `statusQuery.data?.lastGeofence
?? null` can't tell "field genuinely absent from the response" apart
from "field present and correctly null" — both produce the same "No
location is on file" block, even while standing on a real, correctly
configured pin.

## The fix, and its real limit

The fallback derives a last-stop geofence from `itinerary` — data that,
unlike `lastGeofence`, was already real and working before this session
touched the project (it's what powers the pre-Time-In preview's own
navigate icons). Sorted defensively by `sequence`, takes the actual last
entry (not the last one that happens to have a pin — falling back to an
earlier stop would validate Time Out against the wrong location, which
is worse than accurately reporting no pin). Radius reuses the Time-In
geofence's own `radiusMeters` as a stand-in, since a stop-level radius
isn't part of itinerary data.

**This does not fully solve the problem `BACKEND-SPEC-delta-003.md`
raised: whether `itinerary` includes Support Services stops isn't
something I can confirm without the web repo.** If a technician's actual
last stop today is a Support Service scheduled after their last printer
stop, and `itinerary` only reflects printer schedules, this fallback
would validate against the wrong (earlier) location. That's the same
underlying gap the backend spec already describes — a real `sequence`
column spanning both `schedules` and `supportServices` is still the
correct fix. This delta unblocks Time Out for the common case (last stop
has a printer, or `itinerary` already includes everything) without
waiting on that backend work.

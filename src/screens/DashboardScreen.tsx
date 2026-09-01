// src/screens/DashboardScreen.tsx
//
// Mirrors components/TimeInScreen.tsx (AttendanceGate) + the dashboard's
// itinerary display. Fails CLOSED on a network error — this gate exists
// specifically for a server-verified geofence check.
//
// LOCATION FIX ROBUSTNESS: the first version of this screen relied only
// on watchPositionAsync's first callback to populate the distance
// reading, with no timeout and no distinction between "still waiting for
// a fix" and "permission denied" / "no GPS provider available" — so it
// could show "Checking your location…" forever with no feedback if a fix
// never arrived. This is exactly what happens on an Android EMULATOR with
// no mock location configured: emulators have no real GPS hardware, and
// Location APIs simply never resolve without one manually set via
// Android Studio's Extended Controls -> Location (or `adb emu geo fix
// <lon> <lat>`). That's a device/emulator setup issue, not an app bug —
// but the app should surface a clear timeout/error instead of hanging
// silently regardless of the cause, which is what this version does.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, Alert, ScrollView, Linking, Modal, TextInput } from "react-native";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useApi } from "@/hooks/useApi";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { openDirections } from "@/lib/maps";
import { useGeofenceCheck, Geofence } from "@/hooks/useGeofenceCheck";
import { prefetchTodaysWork } from "@/lib/prefetch";
import { SupportServiceRow } from "@/types/support";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";
import { RootStackParamList } from "@/navigation/RootNavigator";
import {
  requestLocationPermissions,
  startBackgroundGpsReporting,
  stopBackgroundGpsReporting,
} from "@/lib/background-location";

interface ItineraryStop {
  id: number;
  client: string;
  location: string;
  sequence: number | null;
  notes: string | null;
  // Added by the corresponding backend change (app/api/attendance/status/
  // route.ts) specifically for the pre-Time-In itinerary preview's Google
  // Maps icon. Null when a location has no geofence configured yet — the
  // client hides the map affordance in that case rather than linking to
  // (0, 0) or guessing.
  latitude: number | null;
  longitude: number | null;
}

interface AttendanceStatus {
  session: { id: number; timeIn: string; timeOut: string | null } | null;
  itinerary: ItineraryStop[];
  firstStop: ItineraryStop | null;
  geofence: { latitude: number; longitude: number; radiusMeters: number } | null;
  // NEW — analogous to firstStop/geofence above, but for the LAST
  // scheduled printer stop instead of the first. Backend-provided rather
  // than derived client-side from `itinerary`'s ordering: the server is
  // the one source of truth for "which stop is actually last today"
  // (sequence gaps, reschedules, and same-location duplicate stops all
  // make that non-trivial to re-derive correctly on the client), and
  // Time Out's geofence gate needs to agree with whatever the server
  // itself checks when it independently validates the same thing on
  // POST /api/attendance/time-out — see the backend spec.
  lastStop: ItineraryStop | null;
  lastGeofence: { latitude: number; longitude: number; radiusMeters: number } | null;
  tomorrowItinerary: ItineraryStop[];
}

interface UserStatus {
  id: number;
}

// GET /api/schedule?technicianId=&scheduledAt= (no pageSource -> the
// Dashboard-consumer branch, open to Technician) — matches the actual
// server response shape checked directly against app/api/schedule/
// route.ts, not the differently-shaped `pageSource` (Schedule page)
// branch. This is the real per-PRINTER breakdown: one schedule (one
// client+location stop) can contain several scheduleDetails, each a
// separate printer needing its own maintenance report — a flat
// itinerary list can't represent that, which is why this replaces
// AttendanceStatus.itinerary for the on-duty view specifically (the
// tappable one). tomorrowItinerary's simple preview is left as-is since
// it's not actionable.
interface SchedulePrinter {
  id: number;
  serialNo: string;
  model: { name: string | null };
  department: { name: string | null };
}
interface ScheduleDetailRow {
  id: number;
  scheduleId: number;
  printerId: number;
  originMTId: number | null;
  isMaintained: boolean;
  maintainedDate: string | null;
  printer: SchedulePrinter;
  maintainRecord: { id: number; notes: string | null; signPath: string | null; status: { name: string | null } } | null;
}
interface ScheduleRow {
  id: number;
  clientId: number;
  locationId: number;
  notes: string | null;
  client: { name: string };
  location: { name: string };
  scheduleDetails: ScheduleDetailRow[];
  // NEW — see the backend spec accompanying this delta. Read directly
  // off THIS row rather than cross-referenced from a different endpoint
  // (which is what the old `itineraryCoords`/`coordsForSchedule` join
  // against `/api/attendance/status`'s itinerary did, matching only by
  // schedule id or, failing that, a fragile location-NAME string
  // compare). That join had no guaranteed shared identifier between the
  // two responses and is the suspected cause of the location icon going
  // missing for some itineraries — a same-row field can't silently
  // mismatch the way a cross-endpoint join can.
  latitude: number | null;
  longitude: number | null;
}

/** "yyyy-MM-dd" in Asia/Manila regardless of the device's own timezone —
 *  the server compares scheduledAt by exact string equality, so this has
 *  to match how the backend anchors "today" (Asia/Manila), not whatever
 *  timezone the phone happens to be set to. */
function todayInManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/** "12:34 AM" in Asia/Manila, for the Shift Complete card's timed-out-at
 *  line — same reasoning as todayInManila(): anchor to Manila regardless
 *  of the device's own timezone, since that's what the rest of this
 *  screen (and the server) treat as canonical "today." */
function formatManilaTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

// Distinguishes a background-permission denial (which shows its own
// Settings/Cancel dialog, handled inline in timeInMutation below) from
// every other Time In failure, so the generic onError alert doesn't fire
// a second, redundant dialog on top of it.
class BackgroundLocationRequiredError extends Error {}

export function DashboardScreen() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const offlineSync = useOfflineSync();
  const { syncing } = offlineSync;

  // schedDetailsId values with a report currently sitting in the local
  // offline queue (pending, actively uploading, OR failed-but-retryable —
  // all three still represent "a report for this printer already
  // exists," just not yet confirmed by the server). This closes the
  // exact gap that let a technician queue a second, duplicate report for
  // the same printer: the server's own isMaintained flag only flips once
  // a sync actually completes, so between "saved offline" and "synced,"
  // detail.isMaintained is still false and the row would otherwise look
  // untouched and tappable.
  const locallyQueuedSchedDetailIds = new Set(
    offlineSync.reports
      .map((r) => r.schedDetailsId)
      .filter((id): id is number => id != null)
  );
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [gpsBackgroundActive, setGpsBackgroundActive] = useState(false);
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);
  // Time Out confirmation — see the dialog itself further down for why
  // this is a typed-word gate rather than a plain Cancel/Confirm: Time
  // Out is destructive-ish (locks the whole Dashboard until the next
  // scheduled day, per hasTimedOutToday above) and sits right below the
  // itinerary list, an easy mis-tap target.
  const [showTimeOutConfirm, setShowTimeOutConfirm] = useState(false);
  const [timeOutConfirmText, setTimeOutConfirmText] = useState("");
  const closeTimeOutConfirm = () => {
    setShowTimeOutConfirm(false);
    setTimeOutConfirmText("");
  };

  const statusQuery = useQuery({
    queryKey: ["attendance-status"],
    queryFn: () => api.get<AttendanceStatus>("/api/attendance/status"),
    refetchInterval: 60_000,
  });

  const userStatusQuery = useQuery({
    queryKey: ["user-status"],
    queryFn: () => api.get<UserStatus>("/api/user-status"),
  });

  const onDuty = !!statusQuery.data?.session && !statusQuery.data.session.timeOut;
  // Today's session exists AND has a timeOut — the technician already
  // completed their shift today. Attendance-status is scoped to "today"
  // server-side (see the Manila-anchored session lookup this route
  // uses), so this is naturally reset the moment a new day's session
  // doesn't exist yet — no separate "next working day" check needed:
  // there simply is no session to have a timeOut on until the technician
  // times in again on a later scheduled day.
  const hasTimedOutToday = !!statusQuery.data?.session && !!statusQuery.data.session.timeOut;

  // Today's itinerary, per-printer — fetched once on duty (for the
  // tappable list) AND after Time Out (for the read-only Shift Complete
  // summary below, which needs the same per-printer Maintained/Missed
  // truth). Before Time In there's nothing to tap into yet; the
  // pre-Time-In view only needs the single firstStop from
  // attendance-status above.
  const technicianId = userStatusQuery.data?.id;
  const scheduleQuery = useQuery({
    queryKey: ["schedule", technicianId, "today"],
    queryFn: () =>
      api.get<ScheduleRow[]>(`/api/schedule?technicianId=${technicianId}&scheduledAt=${todayInManila()}`),
    enabled: (onDuty || hasTimedOutToday) && technicianId != null,
  });

  // Today's support services — the non-maintenance half of the
  // technician's assigned work (BIR forms, collection, billing,
  // contracts). Fetched under the same on-duty/timed-out gate as the
  // printer itinerary, and keyed the same way, so both halves of "today"
  // refresh together.
  const supportQuery = useQuery({
    queryKey: ["support-services", technicianId, "today"],
    queryFn: () =>
      api.get<SupportServiceRow[]>(
        `/api/support-services?technicianId=${technicianId}&scheduledAt=${todayInManila()}`
      ),
    enabled: (onDuty || hasTimedOutToday) && technicianId != null,
  });

  // Warms the cache for every printer/support-service FORM today's
  // itinerary points at — see lib/prefetch.ts for why the itinerary
  // list alone isn't enough for genuine offline usability. Guarded by a
  // signature ref (not just a `[data]` dependency) so this fires once
  // per actual CONTENT change rather than on every background refetch
  // that happens to return the same rows — prefetchQuery is already
  // cheap when data is fresh, but there's no reason to re-run the whole
  // pass (and its console noise) on every 30s staleTime tick.
  const prefetchedSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!offlineSync.online) return;
    if (!scheduleQuery.data || !supportQuery.data) return;
    const signature = JSON.stringify([
      scheduleQuery.data.flatMap((s) => s.scheduleDetails.map((d) => d.printer.serialNo)).sort(),
      supportQuery.data.map((r) => r.id).sort(),
    ]);
    if (prefetchedSignatureRef.current === signature) return;
    prefetchedSignatureRef.current = signature;
    prefetchTodaysWork(queryClient, api, scheduleQuery.data, supportQuery.data).catch(() => {
      // Individual failures are already swallowed inside
      // prefetchTodaysWork/react-query itself — this outer catch only
      // guards against something throwing before that, and deliberately
      // does nothing further: a failed prefetch pass just means the
      // technician falls back to the existing per-screen live fetch
      // when they open that form, which is exactly what happened before
      // this feature existed.
    });
  }, [offlineSync.online, scheduleQuery.data, supportQuery.data, queryClient, api]);

  // Technical vs. Support Services classification — automatic, based
  // purely on whether a schedule actually has any printer assigned to
  // it (scheduleDetails.length), NOT on which endpoint/table it came
  // from. This matters because a `schedules` row with zero
  // scheduleDetails is a real, valid shape (a Scheduler can create an
  // itinerary stop with a client/location/notes and never attach a
  // printer to it) — and until now, EVERY row from GET /api/schedule
  // rendered under "Technical Services" regardless, which is exactly
  // the misclassification reported: a client visit with no printer
  // showing up under the printer-itinerary header, with nothing
  // beneath it once rendered (its scheduleDetails.map produced zero
  // rows), looking like an empty/broken entry rather than what it
  // actually was.
  //
  // This is independent of — and in addition to — the dedicated
  // `supportServices` table (supportQuery below): a schedule with no
  // printer is reclassified for DISPLAY purposes even though it isn't
  // literally a `supportServices` row, because from the technician's
  // point of view "no printer to maintain here" belongs under Support
  // Services either way.
  const printerSchedules = React.useMemo(
    () => (scheduleQuery.data ?? []).filter((s) => s.scheduleDetails.length > 0),
    [scheduleQuery.data]
  );
  const noPrinterSchedules = React.useMemo(
    () => (scheduleQuery.data ?? []).filter((s) => s.scheduleDetails.length === 0),
    [scheduleQuery.data]
  );

  // supportServices ids with a submission already sitting in the local
  // offline queue. Exactly the same "don't let them file it twice"
  // protection locallyQueuedSchedDetailIds gives the printer rows — and
  // needed for the same reason: the server's own status column only
  // fills in once a sync completes, so between "saved offline" and
  // "synced" the activity still looks outstanding and tappable.
  //
  // Read out of the queued payload rather than a dedicated column
  // because supportServiceId is meaningful only to this kind of item;
  // adding a second nullable id column to queued_reports for it would
  // put a support-only concept into the shared queue schema.
  const locallyQueuedSupportIds = React.useMemo(() => {
    const ids = new Set<number>();
    for (const r of offlineSync.reports) {
      if (r.kind !== "support") continue;
      try {
        const id = JSON.parse(r.payload)?.supportServiceId;
        if (typeof id === "number") ids.add(id);
      } catch {
        // A payload that won't parse is already broken in ways the sync
        // panel surfaces properly — it must not take the itinerary down
        // with it.
      }
    }
    return ids;
  }, [offlineSync.reports]);

  const openSupportService = (row: SupportServiceRow) => {
    if (row.status) {
      Alert.alert("Already recorded", `This activity was already filed as "${row.status}".`);
      return;
    }
    if (locallyQueuedSupportIds.has(row.id)) {
      Alert.alert(
        "Already queued",
        "This support service is already saved and waiting to sync — check the Maintenance tab's Synchronization panel for its status."
      );
      return;
    }
    navigation.navigate("SupportServiceForm", { supportServiceId: row.id });
  };

  /** The Support Services half of the itinerary. Rendered as the printer
   *  FlatList's footer while on duty, and again (read-only) in the Shift
   *  Complete summary, so a technician's day is accounted for in both
   *  places rather than support work quietly vanishing from the
   *  end-of-shift picture. */
  const SupportServicesSection = ({ readOnly = false }: { readOnly?: boolean }) => {
    const rows = supportQuery.data ?? [];
    const totalCount = rows.length + noPrinterSchedules.length;
    return (
      <View style={{ marginTop: 8 }}>
        <Text style={styles.sectionTitle}>Support Services</Text>
        {supportQuery.isLoading ? (
          <ActivityIndicator color={theme.primary} />
        ) : supportQuery.isError ? (
          <Text style={styles.error}>
            {offlineSync.online
              ? "Couldn't load today's support services."
              : "You're offline and support services haven't been downloaded to this device yet."}
          </Text>
        ) : totalCount === 0 ? (
          <Text style={styles.subtitle}>No support services scheduled today.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {rows.map((row) => {
              const isQueued = locallyQueuedSupportIds.has(row.id);
              const effectiveStatus = row.status ?? (isQueued ? "Pending Sync" : null);
              const statusColor =
                effectiveStatus === "Achieved"
                  ? theme.success
                  : effectiveStatus === "Not Achieved"
                  ? theme.destructive
                  : effectiveStatus === "Pending Sync"
                  ? theme.warning
                  : theme.mutedForeground;
              const locked = row.status != null || isQueued;
              return (
                <Pressable
                  key={`support-${row.id}`}
                  style={[styles.supportCard, locked && styles.printerRowDone]}
                  onPress={readOnly ? undefined : () => openSupportService(row)}
                  disabled={readOnly}
                >
                  <View style={styles.supportIconWrap}>
                    <Feather name="clipboard" size={16} color={theme.info} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stopClient}>{row.client}</Text>
                    <Text style={styles.stopLocation}>{row.location}</Text>
                    <View style={styles.supportTypeRow}>
                      <Text style={styles.supportTypeTag}>{row.supportServiceType}</Text>
                    </View>
                    {row.notes ? <Text style={styles.notes}>{row.notes}</Text> : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    {effectiveStatus ? (
                      <View style={[styles.statusBadge, { backgroundColor: `${statusColor}26` }]}>
                        <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                          {effectiveStatus}
                        </Text>
                      </View>
                    ) : readOnly ? (
                      <View style={[styles.statusBadge, { backgroundColor: `${theme.destructive}26` }]}>
                        <Text style={[styles.statusBadgeText, { color: theme.destructive }]}>
                          Missed
                        </Text>
                      </View>
                    ) : (
                      <Feather name="chevron-right" size={18} color={theme.mutedForeground} />
                    )}
                    {!readOnly && (
                      <NavButton
                        navKey={`support-${row.id}`}
                        latitude={row.latitude}
                        longitude={row.longitude}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}

            {/* Reclassified schedules — real `schedules` rows with no
                printer attached, automatically routed here instead of
                Technical Services (see printerSchedules/noPrinterSchedules
                above). Deliberately NOT pressable/no chevron: there is no
                existing completion action for a printer-less schedule
                (no supportServiceTypeId, no status column, no
                photo/signature contract the way a real `supportServices`
                row has) — this card is informational plus navigation
                only, not a stand-in for the real thing. If technicians
                need to formally complete these the same way, that's a
                product/backend decision — see this delta's notes. */}
            {noPrinterSchedules.map((schedule) => (
              <View key={`sched-${schedule.id}`} style={styles.supportCard}>
                <View style={styles.supportIconWrap}>
                  <Feather name="map-pin" size={16} color={theme.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopClient}>{schedule.client.name}</Text>
                  <Text style={styles.stopLocation}>{schedule.location.name}</Text>
                  <View style={styles.supportTypeRow}>
                    <Text style={[styles.supportTypeTag, styles.noPrinterTag]}>
                      No printer assigned
                    </Text>
                  </View>
                  {schedule.notes ? <Text style={styles.notes}>{schedule.notes}</Text> : null}
                </View>
                {!readOnly && (
                  <NavButton
                    navKey={`sched-${schedule.id}`}
                    latitude={schedule.latitude}
                    longitude={schedule.longitude}
                  />
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const openMaintenance = (detail: ScheduleDetailRow) => {
    if (detail.isMaintained) {
      Alert.alert("Already completed", "This printer's maintenance for today is already recorded.");
      return;
    }
    if (locallyQueuedSchedDetailIds.has(detail.id)) {
      Alert.alert(
        "Already queued",
        "A maintenance report for this printer is already saved and waiting to sync — check the Maintenance tab's Synchronization panel for its status."
      );
      return;
    }
    navigation.navigate("MaintenanceForm", {
      serialNo: detail.printer.serialNo,
      schedDetailsId: detail.id,
      originMTId: detail.originMTId ?? undefined,
    });
  };

  // Turn-by-turn directions with an explicit origin, not just a dropped
  // pin. The URL construction and current-position lookup now live in
  // lib/maps.ts, since three separate row types on this screen need them
  // (printer stops on duty, the pre-Time-In preview, and support
  // services). Destination coordinates come from locationGeofences —
  // this screen never invents or geocodes them, so a location with no
  // pin configured simply has no navigate affordance rather than a
  // link to the wrong place.
  const [resolvingNavId, setResolvingNavId] = useState<string | null>(null);

  const openInGoogleMaps = async (
    navKey: string,
    destLatitude: number,
    destLongitude: number
  ) => {
    setResolvingNavId(navKey);
    try {
      await openDirections(destLatitude, destLongitude);
    } catch {
      Alert.alert("Couldn't open Maps", "No app was available to handle the navigation link.");
    } finally {
      setResolvingNavId(null);
    }
  };

  /** A small round navigate button, rendered only when the stop actually
   *  has a geofence pin. Extracted because it now appears on three
   *  different row types with identical behaviour. */
  const NavButton = ({
    navKey,
    latitude,
    longitude,
  }: {
    navKey: string;
    latitude: number | null;
    longitude: number | null;
  }) => {
    if (latitude == null || longitude == null) return null;
    return (
      <Pressable
        style={styles.gpsButton}
        onPress={() => openInGoogleMaps(navKey, latitude, longitude)}
        disabled={resolvingNavId === navKey}
        hitSlop={8}
      >
        {resolvingNavId === navKey ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <Feather name="navigation" size={18} color={theme.primary} />
        )}
      </Pressable>
    );
  };

  const geofence: Geofence | null = statusQuery.data?.geofence ?? null;

  // lastGeofence itself (see AttendanceStatus type above) is a field I
  // speced as a NEW backend addition in BACKEND-SPEC-delta-003.md —
  // never confirmed as actually implemented server-side. If the backend
  // hasn't shipped it yet, `statusQuery.data?.lastGeofence` is simply
  // `undefined` in the real response, and `?? null` below makes that
  // indistinguishable from "genuinely no pin configured" — which is
  // exactly the false "No location is on file" block a technician can
  // hit while standing right on a real, correctly-configured pin.
  //
  // Fallback: derive it from `itinerary`, which — unlike lastGeofence —
  // IS pre-existing, real, already-working data (it's what powers the
  // pre-Time-In preview's own navigate icons, confirmed present before
  // any of this session's changes). Sorted by `sequence` defensively
  // (nulls last) rather than trusting raw array order, then take the
  // actual last entry — not the last entry that HAS a pin, since
  // falling back to an earlier stop's coordinates would validate Time
  // Out against the wrong location, which is worse than correctly
  // reporting "the real last stop has no pin."
  //
  // radiusMeters isn't part of an itinerary stop, so this reuses the
  // Time-In geofence's own radius as a stand-in (same on-site policy
  // presumably applies to every stop) rather than inventing an
  // arbitrary constant.
  const derivedLastStop = React.useMemo(() => {
    const itinerary = statusQuery.data?.itinerary ?? [];
    if (itinerary.length === 0) return null;
    const sorted = [...itinerary].sort((a, b) => {
      if (a.sequence == null) return 1;
      if (b.sequence == null) return -1;
      return a.sequence - b.sequence;
    });
    return sorted[sorted.length - 1];
  }, [statusQuery.data?.itinerary]);

  const lastGeofence: Geofence | null =
    statusQuery.data?.lastGeofence ??
    (derivedLastStop?.latitude != null && derivedLastStop.longitude != null
      ? {
          latitude: derivedLastStop.latitude,
          longitude: derivedLastStop.longitude,
          radiusMeters: geofence?.radiusMeters ?? 100,
        }
      : null);

  // Time-In gate — identical behaviour to before, now via the shared
  // hook. Only watches while NOT on duty and NOT already timed out today
  // (there's nothing to gate once the shift has started or ended).
  const timeInCheck = useGeofenceCheck(geofence, !onDuty && !hasTimedOutToday);
  const locationState = timeInCheck.state;
  const withinRange = timeInCheck.withinRange;

  // Time-Out gate — the new counterpart, watching against the LAST
  // itinerary stop's geofence instead of the first, and only while
  // actually on duty (there's nothing to check before Time In or after
  // Time Out has already locked the Dashboard). This is a UX aid, not
  // the actual security boundary: a technician's device reporting "in
  // range" only disables/enables this button locally, so it can be
  // bypassed by a compromised or spoofed client. The real enforcement is
  // POST /api/attendance/time-out independently re-checking the
  // technician's server-recorded position against the same last-stop
  // geofence and rejecting the request outright if it disagrees — see
  // the backend spec. This client-side gate exists so a technician who
  // is genuinely out of range gets a clear, immediate reason rather than
  // an opaque rejection after tapping through the confirm dialog.
  const timeOutCheck = useGeofenceCheck(lastGeofence, onDuty);

  const timeInMutation = useMutation({
    mutationFn: async () => {
      // Foreground first, then background — same requestLocationPermissions()
      // helper as before (src/lib/background-location.ts), unchanged: it
      // already requests in that order and only asks for background once
      // foreground succeeds.
      const perms = await requestLocationPermissions();
      if (!perms.granted) {
        throw new Error("Location permission is required to time in.");
      }
      if (!perms.backgroundGranted) {
        // Stops the Time In process entirely — this await never resolves
        // (only rejects), so neither the GPS fix below nor the
        // /api/attendance/time-in POST ever runs. Settings deep-link uses
        // Linking.openSettings() (no extra dependency: this is a real
        // React Native API, not Expo-specific) so the technician can
        // grant "Allow all the time" without hunting through Settings
        // manually, then retry Time In from scratch.
        await new Promise<void>((_, reject) => {
          Alert.alert(
            "Background Location Required",
            'Fiix needs background location while you are clocked in so dispatch can see your position when the app is minimized or your phone is locked.\n\nPlease enable "Allow all the time" in Settings.',
            [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () =>
                  reject(
                    new BackgroundLocationRequiredError(
                      "Background location permission is required to time in."
                    )
                  ),
              },
              {
                text: "Open Settings",
                onPress: () => {
                  Linking.openSettings();
                  reject(
                    new BackgroundLocationRequiredError(
                      "Background location permission is required to time in."
                    )
                  );
                },
              },
            ],
            { cancelable: false }
          );
        });
      }
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return api.post("/api/attendance/time-in", {
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendance-status"] }),
    onError: (err) => {
      // The background-permission case already showed its own
      // Settings/Cancel dialog above — showing this generic one too would
      // just be a second, redundant popup for the same event.
      if (err instanceof BackgroundLocationRequiredError) return;
      Alert.alert("Time In failed", err instanceof Error ? err.message : String(err));
    },
  });

  const timeOutMutation = useMutation({
    // POST /api/attendance/time-out (app/api/attendance/time-out/route.ts)
    // takes no body at all — it reads location from the technicianGpsStatus
    // table (whatever this technician's most recent background ping left
    // there), not from the Time Out request itself. An earlier version of
    // this mutation fetched a fresh GPS fix and sent it anyway, which the
    // route silently ignored — harmless, but a wasted location request
    // that could only add latency or fail for no benefit. Removed rather
    // than kept "just in case"; the SMS notification this triggers
    // server-side already works correctly without it.
    mutationFn: () => api.post("/api/attendance/time-out"),
    onSuccess: () => {
      closeTimeOutConfirm();
      queryClient.invalidateQueries({ queryKey: ["attendance-status"] });
    },
    onError: (err) => Alert.alert("Time Out failed", err instanceof Error ? err.message : String(err)),
  });

  if (statusQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (statusQuery.isError) {
    // With the AsyncStorage query persister (App.tsx) now in place, this
    // branch should rarely fire past a technician's very first session —
    // any prior successful load stays available (and status stays
    // "success", not "error") across restarts and offline periods. What
    // this actually catches now is closer to "never had a successful
    // load on this device at all," which genuinely does need connectivity
    // once — there's nothing to fall back to.
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>
          {offlineSync.online
            ? "Couldn't reach the server. Check your connection."
            : "You're offline, and this device hasn't loaded your schedule before. Connect once to get started — after that it stays available offline."}
        </Text>
        <Pressable style={styles.secondaryButton} onPress={() => statusQuery.refetch()}>
          <Text style={styles.secondaryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const data = statusQuery.data!;

  // Generalized so both the Time-In pill and the new Time-Out pill
  // render from one implementation — behaviour is identical to before
  // for Time In, just parameterized instead of closing over the
  // module-level `locationState`/`geofence`/`withinRange` directly.
  const renderRangePillFor = (
    check: { state: import("@/hooks/useGeofenceCheck").GeofenceCheckState; withinRange: boolean },
    targetGeofence: Geofence | null,
    inRangeLabel: string
  ) => {
    if (check.state.kind === "permission-denied") {
      return (
        <View style={[styles.rangePill, styles.rangePillOut]}>
          <Feather name="alert-triangle" size={13} color={theme.warning} />
          <Text style={[styles.rangePillText, { color: theme.warning }]}>
            Location permission denied — enable it in Settings
          </Text>
        </View>
      );
    }
    if (check.state.kind === "timeout") {
      return (
        <View style={[styles.rangePill, styles.rangePillOut]}>
          <Feather name="alert-triangle" size={13} color={theme.warning} />
          <Text style={[styles.rangePillText, { color: theme.warning }]}>
            Couldn't get a GPS fix. On an emulator, set a mock location in Extended Controls.
          </Text>
        </View>
      );
    }
    if (check.state.kind === "checking") {
      return (
        <View style={[styles.rangePill, styles.rangePillOut]}>
          <Feather name="navigation" size={13} color={theme.warning} />
          <Text style={[styles.rangePillText, { color: theme.warning }]}>Checking your location…</Text>
        </View>
      );
    }
    return (
      <View style={[styles.rangePill, check.withinRange ? styles.rangePillOk : styles.rangePillOut]}>
        <Feather
          name={check.withinRange ? "check-circle" : "navigation"}
          size={13}
          color={check.withinRange ? theme.primary : theme.warning}
        />
        <Text style={[styles.rangePillText, { color: check.withinRange ? theme.primary : theme.warning }]}>
          {check.withinRange
            ? inRangeLabel
            : `${Math.round(check.state.distance)}m away — need to be within ${targetGeofence?.radiusMeters}m`}
        </Text>
      </View>
    );
  };

  const renderRangePill = () => renderRangePillFor(timeInCheck, geofence, "You're within range");

  // Shift Complete — replaces the entire Dashboard (not just a disabled
  // Time In button) once today's session has a timeOut. This is what
  // satisfies "prevent timing in again until the next scheduled working
  // day": there is no Time In control anywhere in this branch, and the
  // off-duty branch below (which owns the only Time In button in this
  // screen) is unreachable today since hasTimedOutToday is checked
  // first. The gate is naturally daily — see the note by
  // hasTimedOutToday's declaration above.
  if (hasTimedOutToday) {
    const allDetails = (scheduleQuery.data ?? []).flatMap((s) => s.scheduleDetails);
    const maintainedCount = allDetails.filter(
      (d) => d.isMaintained || locallyQueuedSchedDetailIds.has(d.id)
    ).length;
    const missedCount = allDetails.length - maintainedCount;
    const timeOutIso = statusQuery.data?.session?.timeOut ?? null;

    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Matches the web app's "Shift complete" card exactly: plain
            card, calendar-check icon, bold title, single muted subtitle
            line naming the actual time-out time. The extra
            counts/message below are new to mobile — the web reference
            doesn't have a printer-by-printer breakdown at all — kept
            OUTSIDE this card so the card itself stays a 1:1 match. */}
        <View style={styles.shiftCompleteCard}>
          <MaterialCommunityIcons name="calendar-check" size={40} color={theme.success} />
          <Text style={styles.shiftCompleteTitle}>Shift complete</Text>
          <Text style={styles.shiftCompleteSubtitle}>
            {timeOutIso
              ? `You timed out at ${formatManilaTime(timeOutIso)}. See you on your next scheduled day.`
              : "See you on your next scheduled day."}
          </Text>
        </View>

        <Text style={styles.subtitle2}>
          For now, please review the summary of your completed tasks for the day.
        </Text>

        {allDetails.length > 0 && (
          <View style={styles.shiftStatsRow}>
            <View style={styles.shiftStat}>
              <Text style={[styles.shiftStatValue, { color: theme.success }]}>{maintainedCount}</Text>
              <Text style={styles.shiftStatLabel}>Maintained</Text>
            </View>
            <View style={styles.shiftStatDivider} />
            <View style={styles.shiftStat}>
              <Text style={[styles.shiftStatValue, { color: theme.destructive }]}>{missedCount}</Text>
              <Text style={styles.shiftStatLabel}>Missed</Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Technical Services · Printer Itinerary</Text>
        {scheduleQuery.isLoading ? (
          <ActivityIndicator color={theme.primary} />
        ) : scheduleQuery.isError ? (
          <Text style={styles.error}>
            {offlineSync.online
              ? "Couldn't load today's summary."
              : "You're offline and today's summary hasn't been downloaded to this device yet."}
          </Text>
        ) : allDetails.length === 0 ? (
          <Text style={styles.subtitle}>No printer maintenance was scheduled today.</Text>
        ) : (
          printerSchedules.map((schedule) => (
            <View key={schedule.id} style={{ marginBottom: 16 }}>
              <Text style={styles.stopClient}>{schedule.client.name}</Text>
              <Text style={styles.stopLocation}>{schedule.location.name}</Text>
              <View style={{ gap: 8, marginTop: 8 }}>
                {schedule.scheduleDetails.map((detail) => {
                  // A report saved but not yet synced still represents
                  // completed work, not a miss — see saveMaintenance()'s
                  // online-first logic, which can leave a report queued
                  // for a short window on a bad connection even though
                  // the technician genuinely finished the job.
                  const isQueued = locallyQueuedSchedDetailIds.has(detail.id);
                  const status: "Maintained" | "Pending Sync" | "Missed" = detail.isMaintained
                    ? "Maintained"
                    : isQueued
                    ? "Pending Sync"
                    : "Missed";
                  const statusColor =
                    status === "Maintained"
                      ? theme.success
                      : status === "Pending Sync"
                      ? theme.warning
                      : theme.destructive;
                  const statusIcon =
                    status === "Maintained" ? "check-circle" : status === "Pending Sync" ? "clock" : "x-circle";
                  return (
                    <View key={detail.id} style={[styles.printerRow, styles.printerRowDone]}>
                      <View style={styles.printerIconWrap}>
                        <Feather name="printer" size={16} color={theme.mutedForeground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.printerModel}>{detail.printer.model.name ?? "Printer"}</Text>
                        <Text style={styles.printerSerial}>{detail.printer.serialNo}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: `${statusColor}26` }]}>
                        <Feather name={statusIcon} size={11} color={statusColor} />
                        <Text style={[styles.statusBadgeText, { color: statusColor, marginLeft: 4 }]}>
                          {status}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}

        {/* Support work counts as the technician's day too — leaving it
            out of the end-of-shift summary would make an errand-only day
            look empty. Read-only here: the shift is over, so nothing in
            this branch is actionable. */}
        <SupportServicesSection readOnly />
      </ScrollView>
    );
  }

  if (!onDuty) {
    return (
      <>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.timeInCard}>
          <View style={styles.iconCircle}>
            <Feather name="map-pin" size={28} color={theme.primary} />
          </View>
          <Text style={styles.title}>Time In</Text>
          {data.firstStop ? (
            <>
              <Text style={styles.subtitle}>
                Get within range of {data.firstStop.client} to start your shift.
              </Text>
              {renderRangePill()}
              <Pressable
                style={[styles.primaryButton, !withinRange && styles.primaryButtonDisabled]}
                onPress={() => setShowLocationDisclosure(true)}
                disabled={!withinRange || timeInMutation.isPending}
              >
                {timeInMutation.isPending ? (
                  <ActivityIndicator color={theme.primaryForeground} />
                ) : (
                  <Text style={styles.primaryButtonText}>Time In</Text>
                )}
              </Pressable>
            </>
          ) : (
            <Text style={styles.subtitle}>You have no scheduled visits today.</Text>
          )}
        </View>

        {/* Full-day preview, available before Time In — every client stop
            scheduled today, not just the first one the gate above cares
            about. One card per CLIENT (not per printer — that per-printer
            breakdown only exists once on duty, see the on-duty render
            below), each with its own Google Maps navigation icon. */}
        {data.itinerary.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Today's itinerary</Text>
            {data.itinerary.map((s) => (
              <View key={s.id} style={styles.previewCard}>
                <View style={styles.stopBadge}>
                  <Text style={styles.stopBadgeText}>{s.sequence ?? "•"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopClient}>{s.client}</Text>
                  <Text style={styles.stopLocation}>{s.location}</Text>
                  {s.notes ? <Text style={styles.notes}>{s.notes}</Text> : null}
                </View>
                <NavButton navKey={`preview-${s.id}`} latitude={s.latitude} longitude={s.longitude} />
              </View>
            ))}
          </>
        )}

        {data.tomorrowItinerary.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Tomorrow's itinerary</Text>
            {data.tomorrowItinerary.map((s) => (
              <View key={s.id} style={styles.stopCard}>
                <View style={styles.stopBadge}>
                  <Text style={styles.stopBadgeText}>{s.sequence ?? "•"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopClient}>{s.client}</Text>
                  <Text style={styles.stopLocation}>{s.location}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Location Access disclosure — shown on every Time In tap, requires
          an explicit Continue before any permission is requested. Modal
          renders as its own overlay (RN portals it above the ScrollView
          regardless of nesting), so placement here vs. elsewhere in the
          tree doesn't matter for how it displays. */}
      <Modal
        visible={showLocationDisclosure}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLocationDisclosure(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconCircle}>
              <Feather name="map-pin" size={24} color={theme.primary} />
            </View>
            <Text style={styles.modalTitle}>Location Access</Text>
            <Text style={styles.modalBody}>
              Fiix collects your location while you're on duty (from Time In
              until Time Out) — including in the background, when the app is
              minimized or your phone is locked.
            </Text>
            <Text style={styles.modalSubheading}>This is used for:</Text>
            <View style={styles.modalBulletList}>
              <Text style={styles.modalBullet}>• Verifying Time In / Time Out at the correct location</Text>
              <Text style={styles.modalBullet}>• Giving dispatch visibility into where you are</Text>
              <Text style={styles.modalBullet}>• Technician monitoring while on duty</Text>
              <Text style={styles.modalBullet}>• Keeping your GPS status accurate on the dashboard</Text>
            </View>
            <Text style={styles.modalBody}>
              Location tracking stops automatically as soon as you Time Out.
            </Text>
            <View style={styles.modalNoticeBox}>
              <Feather name="info" size={14} color={theme.info} style={{ marginTop: 1 }} />
              <Text style={styles.modalNoticeText}>
                You may see two permission prompts. Please accept both — the
                second one asks to upgrade to{" "}
                <Text style={{ fontWeight: "700" }}>"Allow all the time."</Text>{" "}
                Time In won't work with only "While using the app."
              </Text>
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                setShowLocationDisclosure(false);
                timeInMutation.mutate();
              }}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </Pressable>
            <Pressable style={styles.modalDismiss} onPress={() => setShowLocationDisclosure(false)}>
              <Text style={styles.modalDismissText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <View style={styles.onDutyBadge}>
          <View style={styles.onDutyDot} />
          <Text style={styles.onDutyText}>ON DUTY</Text>
        </View>
        {syncing && <Text style={styles.syncing}>Syncing offline reports…</Text>}
      </View>
      {/* Technical vs Support Services split. These are two genuinely
          different kinds of assigned work — one is printer maintenance
          against a printer itinerary, the other is a client errand with
          no printer involved at all — and the request was explicit that
          they stay distinct rather than being merged into one "today"
          list. Rendered as one FlatList (printer stops) with the support
          section as its footer, so the whole screen scrolls as a single
          surface and the Time Out button stays pinned below both. */}
      {scheduleQuery.isLoading ? (
        <ActivityIndicator color={theme.primary} />
      ) : scheduleQuery.isError ? (
        <Text style={styles.error}>
          {offlineSync.online
            ? "Couldn't load today's printers."
            : "You're offline and today's printers haven't been downloaded to this device yet."}
        </Text>
      ) : (
        <FlatList
          data={printerSchedules}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ gap: 16, paddingBottom: 8 }}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>Technical Services · Printer Itinerary</Text>
          }
          ListEmptyComponent={
            <Text style={styles.subtitle}>No printer maintenance scheduled today.</Text>
          }
          ListFooterComponent={<SupportServicesSection />}
          renderItem={({ item: schedule }) => {
            return (
              <View>
                {/* Client header row — now carries the navigate icon, so
                    EVERY client in the itinerary has one on duty, not
                    just in the pre-Time-In preview. Coordinates come
                    straight off this same row (schedule.latitude/
                    longitude) rather than a cross-endpoint lookup — see
                    the ScheduleRow type comment for why that changed. */}
                <View style={styles.clientHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stopClient}>{schedule.client.name}</Text>
                    <Text style={styles.stopLocation}>{schedule.location.name}</Text>
                  </View>
                  <NavButton
                    navKey={`sched-${schedule.id}`}
                    latitude={schedule.latitude}
                    longitude={schedule.longitude}
                  />
                </View>
                <View style={{ gap: 8, marginTop: 8 }}>
                  {schedule.scheduleDetails.map((detail) => {
                    const isQueued = locallyQueuedSchedDetailIds.has(detail.id);
                    const isLocked = detail.isMaintained || isQueued;
                    return (
                      <Pressable
                        key={detail.id}
                        style={[styles.printerRow, isLocked && styles.printerRowDone]}
                        onPress={() => openMaintenance(detail)}
                      >
                        <View style={styles.printerIconWrap}>
                          <Feather
                            name={detail.isMaintained ? "check-circle" : isQueued ? "clock" : "printer"}
                            size={16}
                            color={
                              detail.isMaintained
                                ? theme.success
                                : isQueued
                                ? theme.warning
                                : theme.primary
                            }
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.printerModel}>{detail.printer.model.name ?? "Printer"}</Text>
                          <Text style={styles.printerSerial}>{detail.printer.serialNo}</Text>
                        </View>
                        {detail.isMaintained ? (
                          <View style={[styles.statusBadge, styles.statusBadgeDone]}>
                            <Text style={[styles.statusBadgeText, { color: theme.success }]}>Maintained</Text>
                          </View>
                        ) : isQueued ? (
                          <View style={[styles.statusBadge, styles.statusBadgeQueued]}>
                            <Text style={[styles.statusBadgeText, { color: theme.warning }]}>Pending Sync</Text>
                          </View>
                        ) : (
                          <Feather name="chevron-right" size={18} color={theme.mutedForeground} />
                        )}
                        {/* History icon. Its own hit target with
                            stopPropagation-equivalent behaviour (a nested
                            Pressable wins the touch over its parent in
                            RN), so tapping history never accidentally
                            opens the maintenance form — and it stays
                            available on ALREADY-MAINTAINED rows too,
                            where the row itself is locked. That's the
                            case it's arguably most useful in: checking
                            what was done here before. */}
                        <Pressable
                          style={styles.historyButton}
                          hitSlop={8}
                          onPress={() =>
                            navigation.navigate("PrinterHistory", {
                              serialNo: detail.printer.serialNo,
                            })
                          }
                        >
                          <Feather name="clock" size={16} color={theme.info} />
                        </Pressable>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          }}
        />
      )}
      {/* Time Out geofence gate. lastGeofence coming back null (no
          geofence configured on the last stop) is treated as "can't
          verify, so don't allow it" rather than silently letting Time
          Out through unchecked — matching AttendanceGate's existing
          fail-closed philosophy elsewhere in this app: the geofence
          check must be positively satisfied, never assumed passing by
          default just because data was missing. */}
      {lastGeofence && renderRangePillFor(timeOutCheck, lastGeofence, "You're within range to time out")}
      <Pressable
        style={[
          styles.primaryButton,
          styles.timeOutButton,
          !timeOutCheck.withinRange && styles.primaryButtonDisabled,
        ]}
        onPress={() => setShowTimeOutConfirm(true)}
        disabled={!timeOutCheck.withinRange || timeOutMutation.isPending}
      >
        {timeOutMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.primaryButtonText, { color: "#fff" }]}>Time Out</Text>
        )}
      </Pressable>
      {!lastGeofence && (
        <Text style={styles.geofenceMissingNote}>
          No location is on file for your last scheduled stop today, so Time Out can't be
          verified from here yet. Contact your Scheduler.
        </Text>
      )}

      {/* Matches the design you sent: title + close X top-right, plain
          body copy, Cancel / destructive-action pills bottom-right. The
          typed-OUT gate below is the one addition beyond that reference —
          Time Out has no undo (it locks the whole Dashboard until the
          next scheduled day), so a plain two-button confirm is one
          mis-tap away from the same accidental action the confirmation
          exists to prevent. */}
      <Modal visible={showTimeOutConfirm} transparent animationType="fade" onRequestClose={closeTimeOutConfirm}>
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmHeaderRow}>
              <Text style={styles.confirmTitle}>End your shift?</Text>
              <Pressable onPress={closeTimeOutConfirm} hitSlop={10}>
                <Feather name="x" size={20} color={theme.mutedForeground} />
              </Pressable>
            </View>
            <Text style={styles.confirmBody}>
              This records your Time Out and locks the dashboard until your next scheduled Time In.
            </Text>
            <Text style={styles.confirmInputLabel}>Type OUT to confirm</Text>
            <TextInput
              style={styles.confirmInput}
              value={timeOutConfirmText}
              onChangeText={setTimeOutConfirmText}
              placeholder="OUT"
              placeholderTextColor={theme.mutedForeground}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
            />
            <View style={styles.confirmButtonRow}>
              <Pressable style={styles.confirmCancelButton} onPress={closeTimeOutConfirm}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmTimeOutButton,
                  (timeOutConfirmText.trim().toUpperCase() !== "OUT" || timeOutMutation.isPending) &&
                    styles.confirmTimeOutButtonDisabled,
                ]}
                disabled={timeOutConfirmText.trim().toUpperCase() !== "OUT" || timeOutMutation.isPending}
                onPress={() => timeOutMutation.mutate()}
              >
                {timeOutMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmTimeOutText}>Time Out</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background, padding: 16 },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 12,
      backgroundColor: theme.background,
    },
    title: { fontSize: 20, fontWeight: "700", color: theme.foreground },
    subtitle: { color: theme.mutedForeground, textAlign: "center" },
    error: { color: theme.destructive, textAlign: "center" },

    timeInCard: {
      backgroundColor: theme.card,
      borderRadius: theme.radius,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 24,
      alignItems: "center",
      gap: 8,
    },
    iconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    rangePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      marginTop: 4,
      marginBottom: 8,
      maxWidth: "100%",
    },
    rangePillOk: { backgroundColor: "rgba(0,187,144,0.15)" },
    rangePillOut: { backgroundColor: "rgba(233,171,43,0.15)" },
    rangePillText: { fontSize: 12, fontWeight: "600", flexShrink: 1 },

    primaryButton: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      marginTop: 8,
    },
    primaryButtonDisabled: { backgroundColor: theme.muted },
    primaryButtonText: { color: theme.primaryForeground, fontWeight: "700", fontSize: 16 },
    timeOutButton: { backgroundColor: theme.destructive, marginTop: 16 },
    geofenceMissingNote: {
      color: theme.mutedForeground,
      fontSize: 12,
      textAlign: "center",
      marginTop: 8,
    },

    secondaryButton: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      paddingVertical: 10,
      paddingHorizontal: 20,
    },
    secondaryButtonText: { color: theme.foreground, fontWeight: "600" },

    sectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.mutedForeground,
      marginTop: 24,
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    stopCard: {
      flexDirection: "row",
      gap: 12,
      backgroundColor: theme.card,
      borderRadius: theme.radius,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      marginBottom: 10,
    },
    previewCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: theme.card,
      borderRadius: theme.radius,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      marginBottom: 10,
    },
    gpsButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    stopBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: theme.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    stopBadgeText: { color: theme.mutedForeground, fontSize: 12, fontWeight: "700" },
    stopClient: { color: theme.foreground, fontWeight: "700", fontSize: 15 },
    stopLocation: { color: theme.mutedForeground, fontSize: 13, marginTop: 2 },
    notes: { color: theme.info, fontSize: 12, marginTop: 4, fontStyle: "italic" },

    printerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: theme.card,
      borderRadius: theme.radius,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
    },
    printerRowDone: { opacity: 0.6 },
    clientHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    historyButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 8,
    },
    supportCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: theme.card,
      borderRadius: theme.radius,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
    },
    supportIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    supportTypeRow: { flexDirection: "row", marginTop: 6 },
    supportTypeTag: {
      color: theme.info,
      backgroundColor: theme.accent,
      fontSize: 11,
      fontWeight: "700",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: "hidden",
    },
    // Deliberately muted rather than the info-blue every real support-
    // service-type tag uses — this pill is naming an ABSENCE (no
    // printer), not a category, and shouldn't visually compete with the
    // genuine type tags for attention.
    noPrinterTag: { color: theme.mutedForeground, backgroundColor: theme.border },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    statusBadgeDone: { backgroundColor: "rgba(67,185,102,0.15)" },
    statusBadgeQueued: { backgroundColor: "rgba(233,171,43,0.15)" },
    statusBadgeText: { fontSize: 10, fontWeight: "700" },

    shiftCompleteCard: {
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 28,
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
      // Screenshot shows a plain elevated white card with no visible
      // border, unlike this app's other cards (timeInCard, stopCard,
      // etc.) which all use a 1px theme.border outline — matched here
      // deliberately, not an oversight.
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    shiftCompleteTitle: { fontSize: 17, fontWeight: "700", color: theme.foreground, marginTop: 4 },
    shiftCompleteSubtitle: { color: theme.mutedForeground, fontSize: 13, textAlign: "center" },
    subtitle2: { color: theme.mutedForeground, fontSize: 13, textAlign: "center", marginBottom: 4 },
    shiftStatsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
      marginTop: 12,
      marginBottom: 4,
    },
    shiftStat: { alignItems: "center" },
    shiftStatValue: { fontSize: 22, fontWeight: "800" },
    shiftStatLabel: { color: theme.mutedForeground, fontSize: 12, marginTop: 2 },
    shiftStatDivider: { width: 1, height: 28, backgroundColor: theme.border },
    printerIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    printerModel: { color: theme.foreground, fontWeight: "700", fontSize: 14 },
    printerSerial: { color: theme.mutedForeground, fontSize: 12, marginTop: 1 },

    statusBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
    onDutyBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
    onDutyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary },
    onDutyText: { color: theme.primary, fontWeight: "700", fontSize: 12, letterSpacing: 0.5 },
    syncing: { color: theme.info, fontSize: 12 },

    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    modalCard: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: theme.card,
      borderRadius: theme.radius,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 24,
      alignItems: "center",
      gap: 8,
    },
    modalIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    modalTitle: { fontSize: 18, fontWeight: "700", color: theme.foreground },
    modalBody: { color: theme.mutedForeground, textAlign: "center", fontSize: 13, lineHeight: 19 },
    modalSubheading: {
      alignSelf: "flex-start",
      color: theme.foreground,
      fontWeight: "700",
      fontSize: 13,
      marginTop: 4,
    },
    modalBulletList: { alignSelf: "stretch", gap: 4, marginBottom: 4 },
    modalBullet: { color: theme.mutedForeground, fontSize: 13, lineHeight: 19 },
    modalNoticeBox: {
      flexDirection: "row",
      gap: 8,
      alignSelf: "stretch",
      backgroundColor: theme.accent,
      borderRadius: 12,
      padding: 12,
      marginTop: 4,
    },
    modalNoticeText: { flex: 1, color: theme.foreground, fontSize: 12, lineHeight: 17 },
    modalDismiss: { marginTop: 4, padding: 8 },
    modalDismissText: { color: theme.mutedForeground, fontSize: 13, fontWeight: "600" },

    confirmCard: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: theme.card,
      borderRadius: theme.radius,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 20,
      gap: 12,
    },
    confirmHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    confirmTitle: { fontSize: 19, fontWeight: "800", color: theme.foreground },
    confirmBody: { color: theme.mutedForeground, fontSize: 14, lineHeight: 20 },
    confirmInputLabel: { color: theme.mutedForeground, fontSize: 12, fontWeight: "700", marginTop: 2 },
    confirmInput: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      fontWeight: "700",
      color: theme.foreground,
      backgroundColor: theme.background,
    },
    confirmButtonRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
    confirmCancelButton: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    confirmCancelText: { color: theme.foreground, fontWeight: "700" },
    confirmTimeOutButton: {
      paddingHorizontal: 22,
      paddingVertical: 12,
      borderRadius: 999,
      backgroundColor: theme.destructive,
    },
    confirmTimeOutButtonDisabled: { opacity: 0.4 },
    confirmTimeOutText: { color: "#fff", fontWeight: "700" },
  });
}

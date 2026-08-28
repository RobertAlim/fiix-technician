// src/hooks/useOfflineSync.ts
//
// Mirrors features/offline-sync/use-offline-sync.ts's triggers: sync
// whenever connectivity comes back, and once on mount/foreground in case
// something was queued last session and the app cold-started already
// online. On top of that (mobile-specific addition, not mirrored from
// web): a periodic retry while online AND something is actually
// pending/failed — see the interval below — so a report that failed mid-
// upload gets retried automatically without needing another connectivity
// transition or app-foreground event to trigger it. There IS a separate,
// faster light poll of the local queue itself (see below), which is a
// different thing: it's what keeps the Synchronization panel's report
// list/counts visually live while open, not what decides when to attempt
// a sync.
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/hooks/useApi";
import { drainQueue } from "@/lib/sync-engine";
import { listQueuedReports, QueuedReport } from "@/lib/offline-db";

const LAST_SYNC_KEY = "fiix-last-sync-at";

export function useOfflineSync() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [reports, setReports] = useState<QueuedReport[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);
  const wasOffline = useRef(false);
  // Read inside the periodic retry interval below — that interval is set
  // up once (empty dep array on the main effect), so it needs a ref
  // rather than the `online` state value directly to see up-to-date
  // connectivity on every tick without re-creating the interval itself.
  const onlineRef = useRef(true);

  const refreshReports = async () => {
    setReports(await listQueuedReports());
  };

  const runDrain = async () => {
    setSyncing(true);
    try {
      const { synced } = await drainQueue(api);
      if (synced > 0) {
        const now = new Date();
        setLastSyncAt(now);
        await AsyncStorage.setItem(LAST_SYNC_KEY, now.toISOString()).catch(() => {});
        // A successful sync is exactly what flips a schedule detail's
        // isMaintained flag server-side (via the /api/sched-details link
        // step in sync-engine.ts) — without this, DashboardScreen's
        // itinerary would keep showing the just-synced printer as
        // "Queued" (or worse, tappable again) until whatever periodic/
        // focus refetch happened to run next, instead of promptly
        // switching to the real "Already completed" state. Partial keys
        // match as prefixes in react-query by default, so this catches
        // ["schedule", technicianId, "today"] without needing to know
        // the technicianId here.
        queryClient.invalidateQueries({ queryKey: ["schedule"] });
        // Support services need the same treatment for the same reason:
        // a successful sync is what fills in supportServices.status
        // server-side, so without this the Dashboard's Support Services
        // section would keep showing a just-synced activity as
        // "Pending Sync" until some unrelated refetch happened to run.
        queryClient.invalidateQueries({ queryKey: ["support-services"] });
        queryClient.invalidateQueries({ queryKey: ["attendance-status"] });
      }
    } finally {
      setSyncing(false);
      await refreshReports();
    }
  };

  useEffect(() => {
    AsyncStorage.getItem(LAST_SYNC_KEY).then((stored) => {
      if (stored) setLastSyncAt(new Date(stored));
    });
    refreshReports();
    runDrain();

    const netSub = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(isOnline);
      onlineRef.current = isOnline;
      if (isOnline && wasOffline.current) runDrain();
      wasOffline.current = !isOnline;
    });

    const appSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") runDrain();
    });

    // Continuous background retry — the actual fix for "technician
    // shouldn't need to tap Sync": the two triggers above only fire on an
    // offline→online EDGE or an app-foreground EVENT, so a report that
    // failed mid-upload (bad request, printer since deleted, a transient
    // 5xx — anything that isn't itself a connectivity change) would
    // otherwise just sit "failed" until one of those edges happens to
    // occur again. This tick doesn't need its own pending/failed check:
    // runDrain() → drainQueue() reads the (usually near-empty) local
    // queue and is a no-op cost when there's nothing to send, so it's
    // safe to call unconditionally on a schedule. Guarded on onlineRef
    // rather than attempting-and-letting-it-fail while offline, purely to
    // avoid a pointless request-timeout wait every 20s on a device that's
    // genuinely offline. Multiple mounted hook instances (Dashboard +
    // MaintenanceList) each run this same interval — safe, since
    // drainQueue()'s module-level activeDrain mutex (sync-engine.ts)
    // collapses concurrent calls into the one actually-running pass.
    const retryId = setInterval(() => {
      if (onlineRef.current) runDrain();
    }, 20_000);

    // Light poll purely to keep the report list/counts visually
    // up to date (e.g. while the Synchronization panel is open and a
    // report finishes uploading) — 3s is frequent enough to feel live
    // without being a meaningful battery/CPU cost for a local SQLite read.
    const pollId = setInterval(refreshReports, 3000);

    return () => {
      netSub();
      appSub.remove();
      clearInterval(retryId);
      clearInterval(pollId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingCount = reports.filter((r) => r.status === "pending" || r.status === "syncing").length;
  const failedCount = reports.filter((r) => r.status === "failed").length;

  return { syncing, runDrain, reports, pendingCount, failedCount, lastSyncAt, online, refreshReports };
}

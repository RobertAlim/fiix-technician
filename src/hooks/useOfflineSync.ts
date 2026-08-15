// src/hooks/useOfflineSync.ts
//
// Mirrors features/offline-sync/use-offline-sync.ts's triggers: sync
// whenever connectivity comes back, and once on mount/foreground in case
// something was queued last session and the app cold-started already
// online. No polling for the SYNC TRIGGER — connectivity transitions
// drive that, same as web. There IS a light poll of the local queue
// itself (see below), which is a different thing: it's what keeps the
// new Synchronization panel's report list/counts visually live while
// open, not what decides when to attempt a sync.
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApi } from "@/hooks/useApi";
import { drainQueue } from "@/lib/sync-engine";
import { listQueuedReports, QueuedReport } from "@/lib/offline-db";

const LAST_SYNC_KEY = "fiix-last-sync-at";

export function useOfflineSync() {
  const api = useApi();
  const [syncing, setSyncing] = useState(false);
  const [reports, setReports] = useState<QueuedReport[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);
  const wasOffline = useRef(false);

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
      if (isOnline && wasOffline.current) runDrain();
      wasOffline.current = !isOnline;
    });

    const appSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") runDrain();
    });

    // Light poll purely to keep the report list/counts visually
    // up to date (e.g. while the Synchronization panel is open and a
    // report finishes uploading) — 3s is frequent enough to feel live
    // without being a meaningful battery/CPU cost for a local SQLite read.
    const pollId = setInterval(refreshReports, 3000);

    return () => {
      netSub();
      appSub.remove();
      clearInterval(pollId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingCount = reports.filter((r) => r.status === "pending" || r.status === "syncing").length;
  const failedCount = reports.filter((r) => r.status === "failed").length;

  return { syncing, runDrain, reports, pendingCount, failedCount, lastSyncAt, online, refreshReports };
}

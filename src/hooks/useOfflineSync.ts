// src/hooks/useOfflineSync.ts
//
// Mirrors features/offline-sync/use-offline-sync.ts's triggers: sync
// whenever connectivity comes back, and once on mount/foreground in case
// something was queued last session and the app cold-started already
// online. No polling — connectivity transitions are the trigger, same as
// web.
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useApi } from "@/hooks/useApi";
import { drainQueue } from "@/lib/sync-engine";

export function useOfflineSync() {
  const api = useApi();
  const [syncing, setSyncing] = useState(false);
  const wasOffline = useRef(false);

  const runDrain = async () => {
    setSyncing(true);
    try {
      await drainQueue(api);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    runDrain();

    const netSub = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      if (online && wasOffline.current) runDrain();
      wasOffline.current = !online;
    });

    const appSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") runDrain();
    });

    return () => {
      netSub();
      appSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { syncing, runDrain };
}

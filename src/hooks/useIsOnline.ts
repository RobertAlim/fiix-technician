// src/hooks/useIsOnline.ts
//
// A minimal NetInfo subscription for screens that need to distinguish
// "genuine server error" from "offline and this was never cached" in
// their error UI, but don't need useOfflineSync's queue-management
// machinery (drain loop, retry timers, AsyncStorage last-sync read).
// OfflineBanner.tsx has its own near-identical subscription for the
// same reason — kept separate rather than sharing one, since a shared
// singleton would need its own provider/context wiring for what's a
// two-line NetInfo listener either way.
import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
    return () => sub();
  }, []);
  return online;
}

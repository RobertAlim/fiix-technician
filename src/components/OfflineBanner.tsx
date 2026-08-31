// src/components/OfflineBanner.tsx
//
// A thin, always-mounted connectivity indicator — deliberately NOT the
// same thing as useOfflineSync.ts, which also owns the drain loop, the
// 3s queue poll, and the 20s retry timer. Mounting that whole hook a
// third time (Dashboard and MaintenanceListScreen already each mount
// it — see useOfflineSync's own comment on why that's safe) just to
// read `online` at the App root would mean a third copy of all that
// polling machinery running for the entire lifetime of the app,
// including on screens (SignIn, Registration) that have nothing to
// sync. This component only watches NetInfo directly.
//
// Deliberately renders NOTHING when online — never a persistent "You're
// online" chip. The banner exists to make the OFFLINE state impossible
// to miss, not to add permanent visual noise to a screen that's working
// normally.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";

export function OfflineBanner() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(true);
  // Brief "Back online" confirmation instead of the banner just
  // vanishing the instant connectivity returns — a technician who's
  // been working offline for a while benefits from an explicit signal
  // that a sync is now able to happen, not just the silent absence of
  // the warning they'd stopped consciously noticing.
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOffline = useRef(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(isOnline);
      if (isOnline && wasOffline.current) {
        setShowReconnected(true);
        setTimeout(() => setShowReconnected(false), 2500);
      }
      wasOffline.current = !isOnline;
    });
    return () => sub();
  }, []);

  const visible = !online || showReconnected;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingTop: insets.top + 6 },
        online ? styles.containerOnline : styles.containerOffline,
        { opacity },
      ]}
      pointerEvents="none"
    >
      <Feather
        name={online ? "check-circle" : "cloud-off"}
        size={13}
        color={online ? theme.success : theme.warning}
      />
      <Text style={[styles.text, { color: online ? theme.success : theme.warning }]}>
        {online
          ? "Back online — syncing"
          : "You're offline — showing saved data. Changes will sync automatically."}
      </Text>
    </Animated.View>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    container: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingBottom: 6,
      paddingHorizontal: 16,
    },
    containerOffline: { backgroundColor: `${theme.warning}22` },
    containerOnline: { backgroundColor: `${theme.success}22` },
    text: { fontSize: 12, fontWeight: "600", textAlign: "center" },
  });
}

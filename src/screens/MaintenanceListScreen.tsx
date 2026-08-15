// src/screens/MaintenanceListScreen.tsx
//
// Mirrors the entry point of components/pages/Maintenance.tsx. Only
// reachable while on duty — AppTabs blocks the tab press otherwise.
//
// The offline queue section now uses SyncStatusPanel — the previous bare
// list only ever showed "failed (3 attempts)" with no way to see WHY,
// which made a genuinely failed report undiagnosable from the UI alone.
// The new panel mirrors web's SyncStatusIndicator.tsx field-for-field:
// connection state, pending/queued counts, last successful sync time, a
// manual "Sync now", and the real lastError text per failed report.
import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useApi } from "@/hooks/useApi";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { onNextScan } from "@/lib/scan-bridge";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { SyncStatusPanel } from "@/components/SyncStatusPanel";

// Matches the REAL GET /api/maintain?serialNo= response (verified against
// app/api/maintain/route.ts directly after a crash report — an earlier
// version of this interface assumed a flat shape with {value,label}
// sub-objects for client/location/etc, which doesn't match reality and
// crashed MaintenanceFormScreen's printer.client.value access). Only
// serialNo is actually used here (for the immediate not-found check
// before navigating); the rest of the shape is what
// MaintenanceFormScreen re-fetches and consumes properly.
interface PrinterLookupResponse {
  maintenanceData: { serialNo: string };
}

export function MaintenanceListScreen() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const api = useApi();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [serialNo, setSerialNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sync = useOfflineSync();

  const lookupAndOpen = async () => {
    if (!serialNo.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const result = await api.get<PrinterLookupResponse>(
        `/api/maintain?serialNo=${encodeURIComponent(serialNo.trim())}`
      );
      // Manual/scanned entry isn't linked to any schedule item — only an
      // itinerary tap (see DashboardScreen) passes schedDetailsId. The
      // lookup here is still done first purely for immediate "printer not
      // found" feedback before navigating; MaintenanceFormScreen re-runs
      // the same lookup itself regardless (single source of truth for
      // printerId/deploymentId), so this isn't wasted if it succeeds.
      navigation.navigate("MaintenanceForm", { serialNo: result.maintenanceData.serialNo });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Printer not found");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Start a maintenance report</Text>
        <SyncStatusPanel
          reports={sync.reports}
          pendingCount={sync.pendingCount}
          failedCount={sync.failedCount}
          lastSyncAt={sync.lastSyncAt}
          online={sync.online}
          syncing={sync.syncing}
          onSyncNow={sync.runDrain}
          onReportsChanged={sync.refreshReports}
        />
      </View>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="Serial number"
          placeholderTextColor={theme.mutedForeground}
          value={serialNo}
          onChangeText={setSerialNo}
          autoCapitalize="characters"
        />
        <Pressable
          style={styles.scanButton}
          onPress={() => {
            onNextScan((value) => setSerialNo(value));
            navigation.navigate("ScanQR", undefined);
          }}
        >
          <Feather name="camera" size={20} color={theme.primaryForeground} />
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={lookupAndOpen} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={theme.primaryForeground} />
        ) : (
          <Text style={styles.buttonText}>Look Up</Text>
        )}
      </Pressable>
    </View>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: theme.background },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: theme.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
    row: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 12 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      padding: 12,
      color: theme.foreground,
      backgroundColor: theme.card,
    },
    scanButton: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius,
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    button: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonText: { color: theme.primaryForeground, fontWeight: "700", fontSize: 16 },
    error: { color: theme.destructive, marginBottom: 8 },
  });
}

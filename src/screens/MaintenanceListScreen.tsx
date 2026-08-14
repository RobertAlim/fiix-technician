// src/screens/MaintenanceListScreen.tsx
//
// Mirrors the entry point of components/pages/Maintenance.tsx. Only
// reachable while on duty — AppTabs blocks the tab press otherwise.
import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useApi } from "@/hooks/useApi";
import { listQueuedReports, QueuedReport } from "@/lib/offline-db";
import { onNextScan } from "@/lib/scan-bridge";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";
import { RootStackParamList } from "@/navigation/RootNavigator";

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
  const [queued, setQueued] = useState<QueuedReport[]>([]);

  useEffect(() => {
    listQueuedReports().then(setQueued);
    const unsub = navigation.addListener("focus", () => {
      listQueuedReports().then(setQueued);
    });
    return unsub;
  }, [navigation]);

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

  const statusColor = (status: QueuedReport["status"]) =>
    status === "failed" ? theme.destructive : status === "syncing" ? theme.info : theme.warning;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Start a maintenance report</Text>
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

      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Queued offline ({queued.length})</Text>
      <FlatList
        data={queued}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 8 }}
        ListEmptyComponent={<Text style={styles.body}>Nothing queued.</Text>}
        renderItem={({ item }) => (
          <View style={styles.queuedRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
            <Text style={styles.body}>
              {item.id.slice(0, 8)} — {item.status}
              {item.status === "failed" ? ` (${item.attempts} attempt${item.attempts === 1 ? "" : "s"})` : ""}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: theme.background },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: theme.mutedForeground, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
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
    body: { color: theme.mutedForeground },
    queuedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: theme.card,
      borderRadius: theme.radius,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
  });
}

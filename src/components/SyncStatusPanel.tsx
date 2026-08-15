// src/components/SyncStatusPanel.tsx
//
// Mirrors components/SyncStatusIndicator.tsx on web field-for-field:
// a status chip (dot + icon + label, badge with pending count) that opens
// a panel with Connection / Pending reports · Queued uploads / Last
// successful sync, a "Sync now" button, and a list of every non-completed
// queued report showing its status, attempt count, how long ago it was
// saved, GPS accuracy if present, and the actual last error text in red
// when failed — that last part is the piece that was completely missing
// before (queued items only ever showed "failed (3 attempts)" with no way
// to see WHY), which is exactly what made a real failed-report bug
// undiagnosable from the UI alone.
//
// Mobile's QueuedReport.status ("pending" | "syncing" | "failed") maps
// onto web's richer SyncStatus enum at a coarser grain — mobile's
// sync-engine doesn't currently report intermediate upload phases
// (uploading-images vs uploading-signature vs uploading-report
// specifically), only "currently attempting" as a whole. Matching that
// finer breakdown would mean instrumenting sync-engine.ts's internals to
// report progress mid-attempt, which isn't done here — the three states
// mobile does track (pending/uploading/failed) are the ones that actually
// change what a technician needs to do about a report.
import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";
import { formatRelativeTime } from "@/lib/relative-time";
import { QueuedReport, removeReport } from "@/lib/offline-db";

interface Props {
  reports: QueuedReport[];
  pendingCount: number;
  failedCount: number;
  lastSyncAt: Date | null;
  online: boolean;
  syncing: boolean;
  onSyncNow: () => void;
  /** Called after a report is manually discarded, so the parent's
   * `useOfflineSync` state (and anything else keyed off the queue, like
   * DashboardScreen's "Queued" itinerary badges) refreshes immediately
   * instead of waiting for the next 3s poll. */
  onReportsChanged: () => void;
}

function statusMeta(theme: Palette, status: QueuedReport["status"]) {
  if (status === "failed") return { color: theme.destructive, label: "Failed" };
  if (status === "syncing") return { color: theme.info, label: "Uploading" };
  return { color: theme.warning, label: "Pending" };
}

function tryGetGpsAccuracy(payloadJson: string): number | null {
  try {
    const payload = JSON.parse(payloadJson);
    const acc = payload?.gps?.accuracy;
    return typeof acc === "number" ? acc : null;
  } catch {
    return null;
  }
}

export function SyncStatusPanel({
  reports,
  pendingCount,
  failedCount,
  lastSyncAt,
  online,
  syncing,
  onSyncNow,
  onReportsChanged,
}: Props) {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const [open, setOpen] = useState(false);

  const discardReport = (report: QueuedReport) => {
    Alert.alert(
      "Discard this report?",
      "This deletes the queued maintenance report from this device permanently — it will never be sent to the server. Only do this for a report that's genuinely stuck (many failed attempts), not one that's still worth retrying.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            try {
              await removeReport(report.id);
              onReportsChanged();
            } catch (err) {
              Alert.alert("Couldn't discard", err instanceof Error ? err.message : String(err));
            }
          },
        },
      ]
    );
  };

  const overall = useMemo(() => {
    if (!online) return { color: theme.warning, label: "Offline", icon: "cloud-off" as const };
    if (failedCount > 0) return { color: theme.destructive, label: "Sync Failed", icon: "alert-circle" as const };
    if (syncing) return { color: theme.info, label: "Uploading", icon: "upload-cloud" as const };
    if (pendingCount > 0) return { color: theme.warning, label: "Pending Upload", icon: "clock" as const };
    return { color: theme.success, label: "Synced", icon: "check-circle" as const };
  }, [online, failedCount, syncing, pendingCount, theme]);

  return (
    <>
      <Pressable style={styles.chip} onPress={() => setOpen(true)}>
        <View style={[styles.chipDot, { backgroundColor: overall.color }]} />
        <Feather name={overall.icon} size={14} color={overall.color} />
        <Text style={[styles.chipLabel, { color: overall.color }]}>{overall.label}</Text>
        {pendingCount > 0 && (
          <View style={styles.chipBadge}>
            <Text style={styles.chipBadgeText}>{pendingCount}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Synchronization</Text>
              <Pressable
                style={[styles.syncButton, !online && styles.syncButtonDisabled]}
                onPress={onSyncNow}
                disabled={!online || syncing}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color={theme.foreground} />
                ) : (
                  <>
                    <Feather name="refresh-cw" size={12} color={theme.foreground} />
                    <Text style={styles.syncButtonText}>Sync now</Text>
                  </>
                )}
              </Pressable>
            </View>

            <View style={styles.summaryBlock}>
              <Text style={styles.summaryLine}>
                Connection: <Text style={styles.summaryValue}>{online ? "Online" : "Offline"}</Text>
              </Text>
              <Text style={styles.summaryLine}>
                Pending reports: <Text style={styles.summaryValue}>{pendingCount}</Text>
                {"  ·  Queued uploads: "}
                <Text style={styles.summaryValue}>{reports.length}</Text>
              </Text>
              <Text style={styles.summaryLine}>
                Last successful sync:{" "}
                <Text style={styles.summaryValue}>
                  {lastSyncAt ? formatRelativeTime(lastSyncAt) : "—"}
                </Text>
              </Text>
            </View>

            {reports.length > 0 ? (
              <ScrollView style={styles.reportList}>
                {reports.map((r) => {
                  const meta = statusMeta(theme, r.status);
                  const gpsAccuracy = tryGetGpsAccuracy(r.payload);
                  // A report's lastError is only from its MOST RECENT
                  // completed attempt — while a fresh retry is actively
                  // in flight (status "syncing"), showing that old text
                  // reads as "this attempt is failing" when it's really
                  // just leftover from the attempt before. Hidden here,
                  // not cleared from storage, so it's still there to show
                  // again immediately if this attempt fails too.
                  const showError = r.status === "failed" && r.lastError;
                  return (
                    <View key={r.id} style={styles.reportRow}>
                      <View style={styles.reportRowHeader}>
                        <View style={[styles.reportDot, { backgroundColor: meta.color }]} />
                        <Text style={[styles.reportStatus, { color: meta.color }]}>{meta.label}</Text>
                        {r.attempts > 0 && (
                          <Text style={styles.reportMeta}> · attempt {r.attempts}</Text>
                        )}
                      </View>
                      <Text style={styles.reportMeta}>
                        Saved {formatRelativeTime(new Date(r.createdAt))}
                        {gpsAccuracy != null ? ` · GPS ±${Math.round(gpsAccuracy)}m` : ""}
                      </Text>
                      {showError ? (
                        <Text style={styles.reportError} numberOfLines={2}>
                          {r.lastError}
                        </Text>
                      ) : null}
                      {r.status === "failed" && (
                        <Pressable style={styles.discardButton} onPress={() => discardReport(r)}>
                          <Feather name="trash-2" size={11} color={theme.destructive} />
                          <Text style={styles.discardButtonText}>Discard</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.emptyText}>All maintenance reports are synced to the server.</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    chipDot: { width: 8, height: 8, borderRadius: 4 },
    chipLabel: { fontSize: 12, fontWeight: "700" },
    chipBadge: {
      backgroundColor: theme.muted,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 1,
      marginLeft: 2,
    },
    chipBadgeText: { color: theme.mutedForeground, fontSize: 10, fontWeight: "700" },

    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-start", padding: 16, paddingTop: 60 },
    panel: {
      alignSelf: "flex-end",
      width: "100%",
      maxWidth: 340,
      backgroundColor: theme.card,
      borderRadius: theme.radius,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      maxHeight: "70%",
    },
    panelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    panelTitle: { color: theme.foreground, fontWeight: "700", fontSize: 14 },
    syncButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    syncButtonDisabled: { opacity: 0.5 },
    syncButtonText: { color: theme.foreground, fontSize: 11, fontWeight: "700" },

    summaryBlock: { marginTop: 10, gap: 4 },
    summaryLine: { color: theme.mutedForeground, fontSize: 12 },
    summaryValue: { color: theme.foreground, fontWeight: "600" },

    reportList: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border, maxHeight: 220 },
    reportRow: { marginBottom: 10 },
    reportRowHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
    reportDot: { width: 7, height: 7, borderRadius: 4 },
    reportStatus: { fontSize: 12, fontWeight: "700" },
    reportMeta: { color: theme.mutedForeground, fontSize: 11, marginLeft: 13 },
    reportError: { color: theme.destructive, fontSize: 11, marginLeft: 13, marginTop: 2 },
    discardButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      alignSelf: "flex-start",
      marginLeft: 13,
      marginTop: 4,
    },
    discardButtonText: { color: theme.destructive, fontSize: 11, fontWeight: "600" },

    emptyText: {
      color: theme.mutedForeground,
      fontSize: 12,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
  });
}

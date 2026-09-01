// src/screens/PrinterHistoryScreen.tsx
//
// Mobile counterpart of the web app's "<serial> history" modal (the
// reference screenshot): a PRINTER INFORMATION block (serial, model,
// client, print count) above a MAINTENANCE HISTORY list.
//
// Presented as a `modal` stack screen rather than an in-place RN <Modal>
// because it's a full second page of content that scrolls, and the
// technician reaches it from a row deep inside the itinerary — a stack
// screen gets a real back affordance and hardware-back handling for
// free, where a Modal over the Dashboard would have to reimplement both.
//
// The web version renders history as a TABLE (Technician / Status /
// Client at Maintenance / Notes / Replacement-Repair / Date). A six-
// column table doesn't fit a phone, so each record is a card carrying
// the identical six fields — same information, same order, no column
// dropped to make it fit. The status pill keeps the web's colouring
// convention (attention-needing statuses tinted red, everything else
// neutral) via the shared "needs attention" list, which is what
// lib/maintenance-status.ts centralises on the web side.
//
// ⚠️ GET /api/printer-history?serialNo= is a NEW endpoint — see the
// backend spec. It is a read-only projection of data the web modal
// already renders, so nothing new needs computing server-side, but the
// route itself has to exist and be open to the Technician role (the
// existing history views are Admin/Scheduler surfaces).
import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/hooks/useApi";
import { useIsOnline } from "@/hooks/useIsOnline";
import { ApiError } from "@/lib/api";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";
import { RootStackParamList } from "@/navigation/RootNavigator";

type HistoryRoute = RouteProp<RootStackParamList, "PrinterHistory">;

interface HistoryRecord {
  id: number;
  technician: string;
  status: string;
  /** The client/location this printer was deployed to AT THE TIME of that
   *  visit — deliberately not the printer's current client. A transferred
   *  printer keeps its old reports pointing at the old client (see the web
   *  app's Printer Transfer, which retires the deployment rather than
   *  rewriting history), and these are what make that visible. Field
   *  names (`client`/`location`, not `clientAtMaintenance`) match the
   *  real backend route (app/api/printer-history/route.ts) exactly, which
   *  itself matches the web app's own PrinterHistoryDialog.tsx contract —
   *  kept in lockstep deliberately rather than renamed to something more
   *  mobile-specific. */
  client: string | null;
  location: string | null;
  notes: string | null;
  /** Pre-formatted "Replacement/Repair" summary — the web modal shows an
   *  em dash when there's nothing, which this mirrors. */
  replacementRepair: string | null;
  /** Pre-formatted Manila-anchored date string from the server. NOT an
   *  ISO instant formatted on-device: the web app pins report dates to
   *  Asia/Manila via lib/formatDate.ts's formatPhDateTime specifically
   *  because formatting UTC components off an instant produced wrong
   *  dates, and re-deriving that here would risk the same class of bug
   *  on a phone whose own timezone is anything else. */
  date: string;
}

interface PrinterHistoryResponse {
  printer: {
    serialNo: string;
    model: string;
    client: string;
    printCount: number | null;
  };
  history: HistoryRecord[];
}

/** Mirrors lib/maintenance-status.ts's "needs attention" set on the web
 *  side — these are the statuses the reference screenshots render as a
 *  red pill. Matched case-insensitively on a prefix so the parenthetical
 *  detail ("For Replacement (Printer Part)") tints the same as the bare
 *  status. If the web list grows, this is the one place to update. */
const ATTENTION_STATUS_PREFIXES = [
  "for replacement",
  "for repair",
  "for pull-out",
  "for pullout",
  "defective",
  "not working",
];

/** The second reference screenshot (X8H5297160) shows a "Resolved"
 *  status rendered as a GREEN pill — distinct from both the red
 *  attention pills and the neutral grey everything else got before.
 *  Added as its own small prefix list rather than folding it into
 *  "not attention = green" by default, since most non-attention
 *  statuses (e.g. a plain routine visit) aren't actually a resolution
 *  of anything and shouldn't read as one. */
const RESOLVED_STATUS_PREFIXES = ["resolved", "completed", "fixed", "ok", "no issue"];

type StatusTone = "attention" | "resolved" | "neutral";

function statusTone(status: string): StatusTone {
  const s = status.trim().toLowerCase();
  if (ATTENTION_STATUS_PREFIXES.some((p) => s.startsWith(p))) return "attention";
  if (RESOLVED_STATUS_PREFIXES.some((p) => s.startsWith(p))) return "resolved";
  return "neutral";
}

export function PrinterHistoryScreen() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const { params } = useRoute<HistoryRoute>();
  const api = useApi();
  const isOnline = useIsOnline();

  const historyQuery = useQuery({
    queryKey: ["printer-history", params.serialNo],
    queryFn: () =>
      api.get<PrinterHistoryResponse>(
        `/api/printer-history?serialNo=${encodeURIComponent(params.serialNo)}`
      ),
  });

  if (historyQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (historyQuery.isError || !historyQuery.data) {
    // Same reasoning as the other two forms: prefetchTodaysWork warms
    // history for every printer on today's itinerary, so an uncached
    // miss here specifically means this printer's history was looked up
    // outside that set (e.g. scanned via QR rather than tapped from the
    // itinerary) while offline.
    const offlineUncached = !isOnline && !historyQuery.data;
    // Surfaces the ACTUAL failure (status code + URL) rather than just
    // "Couldn't load history" — this screen's most likely failure mode
    // right now is GET /api/printer-history not existing server-side yet
    // (a 404), which looks identical to a generic network hiccup unless
    // the real status is visible. Same pattern RootNavigator's
    // AccountPendingScreen already uses for its own network-error case.
    const err = historyQuery.error;
    const detail =
      !offlineUncached && err instanceof ApiError
        ? `HTTP ${err.status} — ${err.url}`
        : !offlineUncached && err instanceof Error
        ? err.message
        : null;
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>
          {offlineUncached
            ? `You're offline and history for ${params.serialNo} hasn't been downloaded yet.`
            : `Couldn't load history for ${params.serialNo}.`}
        </Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {offlineUncached ? (
          <Text style={styles.empty}>Connect to the internet once to load it.</Text>
        ) : (
          <Pressable style={styles.secondaryButton} onPress={() => historyQuery.refetch()}>
            <Text style={styles.secondaryButtonText}>Retry</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const { printer, history } = historyQuery.data;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View style={styles.titleRow}>
        <Feather name="printer" size={18} color={theme.primary} />
        <Text style={styles.title}>{printer.serialNo} history</Text>
      </View>
      <Text style={styles.subtitle}>
        Current information and complete maintenance history for this printer.
      </Text>

      <Text style={styles.sectionLabel}>Printer Information</Text>
      <View style={styles.infoGrid}>
        <InfoTile icon="hash" label="Serial Number" value={printer.serialNo} theme={theme} />
        <InfoTile icon="layers" label="Model" value={printer.model} theme={theme} />
        <InfoTile icon="home" label="Client" value={printer.client} theme={theme} />
        <InfoTile
          icon="printer"
          label="Print Count"
          value={printer.printCount != null ? printer.printCount.toLocaleString("en-US") : "—"}
          theme={theme}
        />
      </View>

      <Text style={styles.sectionLabel}>Maintenance History ({history.length})</Text>
      {history.length === 0 ? (
        <Text style={styles.empty}>No maintenance has been recorded for this printer yet.</Text>
      ) : (
        history.map((record) => {
          const tone = statusTone(record.status);
          const tint =
            tone === "attention" ? theme.destructive : tone === "resolved" ? theme.success : theme.mutedForeground;
          return (
            <View
              key={record.id}
              style={[styles.recordCard, tone === "attention" && styles.recordCardAttention]}
            >
              <View style={styles.recordHeader}>
                <Text style={styles.recordTechnician}>{record.technician}</Text>
                <Text style={styles.recordDate}>{record.date}</Text>
              </View>
              <View style={[styles.statusPill, { borderColor: tint, backgroundColor: `${tint}1a` }]}>
                <Text style={[styles.statusPillText, { color: tint }]}>{record.status}</Text>
              </View>
              <RecordField
                label="Client at Maintenance"
                value={record.client ?? "—"}
                theme={theme}
              />
              <RecordField label="Notes" value={record.notes ?? "—"} theme={theme} />
              <RecordField
                label="Replacement/Repair"
                value={record.replacementRepair ?? "—"}
                theme={theme}
              />
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function InfoTile({
  icon,
  label,
  value,
  theme,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
  theme: Palette;
}) {
  const styles = createStyles(theme);
  return (
    <View style={styles.infoTile}>
      <View style={styles.infoTileHeader}>
        <Feather name={icon} size={12} color={theme.mutedForeground} />
        <Text style={styles.infoTileLabel}>{label}</Text>
      </View>
      <Text style={styles.infoTileValue}>{value}</Text>
    </View>
  );
}

function RecordField({ label, value, theme }: { label: string; value: string; theme: Palette }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.recordField}>
      <Text style={styles.recordFieldLabel}>{label}</Text>
      <Text style={styles.recordFieldValue}>{value}</Text>
    </View>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 12,
      backgroundColor: theme.background,
    },
    error: { color: theme.destructive, textAlign: "center" },
    detail: {
      textAlign: "center",
      color: theme.mutedForeground,
      fontFamily: "monospace",
      fontSize: 12,
      paddingHorizontal: 8,
      opacity: 0.7,
    },

    titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: { color: theme.foreground, fontSize: 18, fontWeight: "800" },
    subtitle: { color: theme.mutedForeground, fontSize: 12, marginTop: 4 },

    sectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.mutedForeground,
      marginTop: 22,
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },

    infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    infoTile: {
      flexGrow: 1,
      flexBasis: "45%",
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      padding: 12,
    },
    infoTileHeader: { flexDirection: "row", alignItems: "center", gap: 5 },
    infoTileLabel: { color: theme.mutedForeground, fontSize: 11 },
    infoTileValue: { color: theme.foreground, fontSize: 15, fontWeight: "700", marginTop: 5 },

    recordCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      padding: 14,
      marginBottom: 10,
      gap: 8,
    },
    recordCardAttention: { borderColor: theme.destructive },
    recordHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    recordTechnician: { color: theme.foreground, fontWeight: "700", fontSize: 14 },
    recordDate: { color: theme.mutedForeground, fontSize: 11 },
    statusPill: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    statusPillText: { fontSize: 11, fontWeight: "700" },

    recordField: { gap: 2 },
    recordFieldLabel: {
      color: theme.mutedForeground,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    recordFieldValue: { color: theme.foreground, fontSize: 13, lineHeight: 18 },

    empty: { color: theme.mutedForeground, fontSize: 13 },

    secondaryButton: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      paddingVertical: 10,
      paddingHorizontal: 20,
    },
    secondaryButtonText: { color: theme.foreground, fontWeight: "600" },
  });
}

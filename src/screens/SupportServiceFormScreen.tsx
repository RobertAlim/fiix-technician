// src/screens/SupportServiceFormScreen.tsx
//
// The Support Services counterpart to MaintenanceFormScreen: documents a
// scheduled NON-maintenance activity (BIR 2307 form, collection, billing,
// contracts, etc) that has no printer itinerary attached to it.
//
// Deliberately parallel to the maintenance form rather than merged with
// it. The two share a shape (photo -> crop -> signature -> signatory ->
// submit -> offline queue) and now genuinely share the pieces where that
// shape is implemented (SignatoryPicker, SignatureCapture, CropImage-
// Screen, the offline queue, the sync engine), but their FIELDS have
// almost nothing in common — there is no status/parts/print-count/nozzle
// concept here, and no schedule-detail to link back to. Forcing one
// screen to serve both would mean a form that's half-disabled in either
// mode.
//
// WHAT'S REUSED, EXACTLY:
//  - photo capture -> CropImageScreen -> cropAndOptimizeNozzlePhoto():
//    the same crop UX and the same <90KB attempt-ladder the request
//    asked for ("same cropping functionality/experience as Maintenance").
//    The function name still says "nozzle" because it's the existing
//    exported name and renaming it would touch MaintenanceFormScreen for
//    no behavioural gain — it's a generic crop+shrink-to-budget routine.
//  - the offline queue, via kind: "support" (see lib/offline-db.ts)
//  - optimizeSignature() and the "Unsigned" sentinel convention
//
// ⚠️ Every /api/support-services* endpoint this screen calls is NEW and
// does not exist yet — see src/types/support.ts and the backend spec.
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRoute, RouteProp, useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as NavigationBar from "expo-navigation-bar";
import { v4 as uuidv4 } from "uuid";
import { useQuery } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { toByteArray } from "base64-js";

import { useApi } from "@/hooks/useApi";
import { useIsOnline } from "@/hooks/useIsOnline";
import { ApiError } from "@/lib/api";
import { enqueueReport } from "@/lib/offline-db";
import { optimizeSignature } from "@/lib/image-processing";
import { onNextCrop } from "@/lib/crop-bridge";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { SignatoryPicker, SignatoryOption } from "@/components/SignatoryPicker";
import { SignatureCapture } from "@/components/SignatureCapture";
import {
  SupportServiceRow,
  SupportServiceStatus,
  SUPPORT_SERVICE_STATUSES,
  SupportServiceTypeOption,
} from "@/types/support";

type FormRoute = RouteProp<RootStackParamList, "SupportServiceForm">;

interface UserStatus {
  id: number;
}

/** GET /api/support-services/[id] — the single activity plus the
 *  signatories available for its client+location. Bundled into one
 *  response for the same reason GET /api/maintain?serialNo= bundles
 *  signatories with the printer: they're always needed together, and a
 *  technician on a weak connection shouldn't pay for two round-trips to
 *  open one form. */
interface SupportServiceDetailResponse {
  supportService: SupportServiceRow;
  signatories: SignatoryOption[];
}

export function SupportServiceFormScreen() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const { params } = useRoute<FormRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const api = useApi();
  const isOnline = useIsOnline();

  // Same Android nav-bar hiding as MaintenanceFormScreen, for the same
  // reason: the system back/home/recents bar can sit on top of the Save
  // button. Restored on blur via useFocusEffect's cleanup.
  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS !== "android") return;
      NavigationBar.setVisibilityAsync("hidden").catch(() => {});
      NavigationBar.setBehaviorAsync("overlay-swipe").catch(() => {});
      return () => {
        NavigationBar.setVisibilityAsync("visible").catch(() => {});
      };
    }, [])
  );

  const detailQuery = useQuery({
    queryKey: ["support-service", params.supportServiceId],
    queryFn: () =>
      api.get<SupportServiceDetailResponse>(`/api/support-services/${params.supportServiceId}`),
  });
  const userStatusQuery = useQuery({
    queryKey: ["user-status"],
    queryFn: () => api.get<UserStatus>("/api/user-status"),
  });
  const typeOptions = useQuery({
    queryKey: ["dropdown-support-service-types"],
    queryFn: () => api.get<SupportServiceTypeOption[]>("/api/dropdown/support-service-types"),
  });

  const [signatoryId, setSignatoryId] = useState<string | null>(null);
  const [status, setStatus] = useState<SupportServiceStatus | null>(null);
  const [notes, setNotes] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [signatureUri, setSignatureUri] = useState<string | null>(null);
  const [signatureDrawing, setSignatureDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  // The service type is pre-set by whoever scheduled the activity, but is
  // editable here: a technician who arrives and finds the actual errand
  // was something else shouldn't have to file it under the wrong type.
  // Initialised from the scheduled value once the detail query lands.
  const [typeId, setTypeId] = useState<string | null>(null);

  const activity = detailQuery.data?.supportService;

  React.useEffect(() => {
    if (activity && typeId == null) {
      setTypeId(String(activity.supportServiceTypeId));
    }
  }, [activity, typeId]);

  const capturePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera permission required");
      return;
    }
    // Full-resolution raw capture; CropImageScreen does the framing and
    // the size-budget optimization — identical flow to the maintenance
    // nozzle photo, which is exactly what was asked for.
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!result.canceled && result.assets[0]) {
      onNextCrop((croppedUri) => setPhotoUri(croppedUri));
      navigation.navigate("CropImage", { uri: result.assets[0].uri });
    }
  };

  const validate = (): string | null => {
    if (!typeId) return "Support service type is required.";
    if (!status) return "Please mark this activity Achieved or Not Achieved.";
    if (!signatoryId) return "Signatory is required.";
    // Photo and signature are required for an ACHIEVED activity only.
    // "Not Achieved" is the case where the technician arrived and the
    // errand couldn't be completed — there is frequently no document to
    // photograph and nobody willing to sign for it, and demanding both
    // would leave the technician unable to file the outcome at all. The
    // notes field carries the reason instead, and is required in that
    // branch for exactly that reason.
    if (status === "Achieved") {
      if (!photoUri) return "A photo of the completed document is required.";
      if (!signatureUri) return "A signature is required.";
    } else if (!notes.trim()) {
      return "Please note why this activity wasn't achieved.";
    }
    return null;
  };

  const save = async () => {
    if (!activity) {
      Alert.alert("Activity details are still loading — try again in a moment.");
      return;
    }
    const validationError = validate();
    if (validationError) {
      Alert.alert("Missing information", validationError);
      return;
    }
    if (!userStatusQuery.data) {
      Alert.alert("Couldn't confirm your account — check your connection and try again.");
      return;
    }

    setSaving(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        throw new Error("Location permission is required to submit this activity.");
      }
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      const id = uuidv4();
      const payload = {
        supportServiceId: activity.id,
        supportServiceTypeId: Number(typeId),
        clientId: activity.clientId,
        locationId: activity.locationId,
        technicianId: userStatusQuery.data.id,
        signatoryId: Number(signatoryId),
        status,
        notes,
        // Same normalization as the maintenance form: expo-location
        // reports -1 for unknown heading/speed, which fails a min(0)
        // check server-side — sent as null instead.
        gps: {
          latitude: fix.coords.latitude,
          longitude: fix.coords.longitude,
          accuracy: fix.coords.accuracy ?? 10_000,
          altitude: fix.coords.altitude ?? null,
          heading: fix.coords.heading != null && fix.coords.heading >= 0 ? fix.coords.heading : null,
          speed: fix.coords.speed != null && fix.coords.speed >= 0 ? fix.coords.speed : null,
          capturedAt: new Date(fix.timestamp).toISOString(),
          gpsProvider: "expo-location",
          isMockLocation: (fix as any).mocked ?? false,
        },
      };

      let localSignatureUri: string | null = null;
      if (signatureUri) {
        const bytes = toByteArray(signatureUri.replace(/^data:image\/png;base64,/, ""));
        const rawFile = new File(Paths.cache, `support-sig-raw-${id}.png`);
        rawFile.write(bytes);
        localSignatureUri = await optimizeSignature(rawFile.uri);
      }

      // Offline-queue-first, same as Save Maintenance and for the same
      // reason: this resolves near-instantly regardless of signal, and
      // useOfflineSync's connectivity/foreground/20s-interval triggers
      // own the actual send. A technician collecting a signed BIR form in
      // a basement office is exactly the situation this exists for.
      await enqueueReport({
        id,
        kind: "support",
        createdAt: new Date().toISOString(),
        payload: JSON.stringify(payload),
        photoLocalUris: JSON.stringify(photoUri ? [photoUri] : []),
        signatureLocalUri: localSignatureUri,
        // No schedule-detail link: a support activity is completed in
        // place on its own row (see sync-engine.ts's submitSupportService).
        schedDetailsId: null,
      });

      Alert.alert("Saved", "Activity saved. It will sync automatically once you're online.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert("Couldn't save activity", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (detailQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }
  if (detailQuery.isError || !activity) {
    // Same distinction as MaintenanceFormScreen's printer-lookup error —
    // DashboardScreen's prefetch (lib/prefetch.ts) warms every support
    // service on today's list, so reaching this uncached-and-offline
    // path means this activity wasn't part of what was prefetched
    // (e.g. added to the schedule after the technician last had signal).
    const offlineUncached = !isOnline && !activity;
    const err = detailQuery.error;
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
            ? "You're offline and this activity hasn't been downloaded to this device yet."
            : "Couldn't load this support activity."}
        </Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {offlineUncached ? (
          <Text style={styles.body}>
            Connect to the internet once to load it — after that it stays available offline.
          </Text>
        ) : (
          <Pressable style={styles.secondaryButton} onPress={() => detailQuery.refetch()}>
            <Text style={styles.secondaryButtonText}>Retry</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      scrollEnabled={!signatureDrawing}
    >
      <View style={styles.infoCard}>
        <Text style={styles.infoClient}>{activity.client}</Text>
        <Text style={styles.infoLine}>{activity.location}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoTag}>{activity.supportServiceType}</Text>
        </View>
        {activity.notes ? (
          <View style={styles.schedulerNotes}>
            <Feather name="message-square" size={13} color={theme.info} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.schedulerNotesLabel}>Notes from Scheduler</Text>
              <Text style={styles.schedulerNotesText}>{activity.notes}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <Text style={styles.label}>Support service</Text>
      <View style={styles.chipRow}>
        {(typeOptions.data ?? []).map((opt) => {
          const active = typeId === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setTypeId(opt.value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Outcome</Text>
      <View style={styles.chipRow}>
        {SUPPORT_SERVICE_STATUSES.map((s) => {
          const active = status === s;
          const tint = s === "Achieved" ? theme.success : theme.destructive;
          return (
            <Pressable
              key={s}
              style={[
                styles.chip,
                active && { backgroundColor: tint, borderColor: tint },
              ]}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.chipText, active && { color: "#fff" }]}>{s}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>
        Notes{status === "Not Achieved" ? " (required)" : ""}
      </Text>
      <TextInput
        style={styles.textArea}
        multiline
        value={notes}
        onChangeText={setNotes}
        placeholder={
          status === "Not Achieved"
            ? "Why couldn't this be completed?"
            : "Optional notes"
        }
        placeholderTextColor={theme.mutedForeground}
      />

      <SignatoryPicker
        api={api}
        signatories={detailQuery.data?.signatories ?? []}
        value={signatoryId}
        onChange={setSignatoryId}
        clientId={activity.clientId}
        locationId={activity.locationId}
        clientName={activity.client}
        locationName={activity.location}
        onAdded={() => detailQuery.refetch()}
      />

      <Text style={styles.label}>
        Photo{status === "Achieved" ? " (required)" : ""}
      </Text>
      {photoUri ? <Image source={{ uri: photoUri }} style={styles.preview} /> : null}
      <Pressable style={styles.secondaryButton} onPress={capturePhoto}>
        <Feather name="camera" size={16} color={theme.foreground} />
        <Text style={styles.secondaryButtonText}>
          {photoUri ? "Retake Photo" : "Take Photo"}
        </Text>
      </Pressable>

      <SignatureCapture
        label={`Signature${status === "Achieved" ? " (required)" : ""}`}
        value={signatureUri}
        onChange={setSignatureUri}
        onDrawingChange={setSignatureDrawing}
      />

      <Pressable style={styles.primaryButton} onPress={save} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={theme.primaryForeground} />
        ) : (
          <Text style={styles.primaryButtonText}>Save Support Service</Text>
        )}
      </Pressable>
    </ScrollView>
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
    body: { color: theme.mutedForeground, textAlign: "center" },
    detail: {
      textAlign: "center",
      color: theme.mutedForeground,
      fontFamily: "monospace",
      fontSize: 12,
      paddingHorizontal: 8,
      opacity: 0.7,
    },

    infoCard: {
      backgroundColor: theme.card,
      borderRadius: theme.radius,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      gap: 4,
    },
    infoClient: { color: theme.foreground, fontWeight: "700", fontSize: 16 },
    infoLine: { color: theme.mutedForeground, fontSize: 13 },
    infoRow: { flexDirection: "row", gap: 8, marginTop: 6 },
    infoTag: {
      color: theme.info,
      backgroundColor: theme.accent,
      fontSize: 11,
      fontWeight: "700",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    schedulerNotes: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: theme.accent,
      borderRadius: 12,
      padding: 10,
      marginTop: 10,
    },
    schedulerNotesLabel: {
      color: theme.info,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    schedulerNotesText: { color: theme.foreground, fontSize: 13, marginTop: 2, lineHeight: 18 },

    label: { fontWeight: "600", color: theme.mutedForeground, fontSize: 13 },
    textArea: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      padding: 12,
      minHeight: 90,
      textAlignVertical: "top",
      color: theme.foreground,
      backgroundColor: theme.card,
    },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    chipText: { color: theme.foreground, fontSize: 13, fontWeight: "600" },
    chipTextActive: { color: theme.primaryForeground },

    preview: { width: "100%", height: 200, borderRadius: theme.radius, resizeMode: "cover" },

    primaryButton: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
      marginBottom: 32,
    },
    primaryButtonText: { color: theme.primaryForeground, fontWeight: "700", fontSize: 16 },
    secondaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      paddingVertical: 12,
      backgroundColor: theme.card,
    },
    secondaryButtonText: { color: theme.foreground, fontWeight: "600" },
  });
}

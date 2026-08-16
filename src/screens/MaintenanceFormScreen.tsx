// src/screens/MaintenanceFormScreen.tsx
//
// Full field/validation/save parity pass against the real web form
// (components/pages/Maintenance.tsx, validation/maintainSchema.ts,
// app/api/maintain/route.ts) — checked directly against source, not
// assumed, after two real bugs surfaced from the previous version:
//
// 1. crypto.getRandomValues() crash — uuid needs react-native-get-random-
//    values imported before anything else (see App.tsx); Hermes has no
//    native Web Crypto API. Native module, needs a rebuild.
// 2. The `gps` fix sent to POST /api/maintain was only {latitude,
//    longitude} — gpsFixSchema actually REQUIRES accuracy and an ISO
//    capturedAt timestamp too (no defaults for either), so every
//    submission would have been silently 400-rejected by
//    maintainSubmitSchema.safeParse() the moment the crash above was
//    fixed. Now sends the full shape the schema demands.
//
// FIELD PARITY: Work Done (Head Clean, Ink Flushing, Refill Ink C/M/Y/K,
// Reset Box/Program) and Services (Cleaning of Printer, Cleaning of Waste
// Tank, Replacement+parts, Repair+parts, Replace Service Unit+QR-scanned
// serial) are all wired up now, matching the web form's exact field set
// and the same conditional validation rules from maintainFormSchema's
// .refine() chain (replicated as plain JS checks below — no zod/
// react-hook-form dependency added just for this one screen, but the
// RULES themselves are copied 1:1, not reinvented).
import React, { useEffect, useState } from "react";
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
import SignatureScreen, { SignatureViewRef } from "react-native-signature-canvas";
import { v4 as uuidv4 } from "uuid";
import { useQuery } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { toByteArray } from "base64-js";

import { useApi } from "@/hooks/useApi";
import { enqueueReport } from "@/lib/offline-db";
import { optimizeSignature } from "@/lib/image-processing";
import { onNextScan } from "@/lib/scan-bridge";
import { onNextCrop } from "@/lib/crop-bridge";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";
import { RootStackParamList } from "@/navigation/RootNavigator";

type FormRoute = RouteProp<RootStackParamList, "MaintenanceForm">;

interface StatusOption {
  value: string; // CAST(status.id AS TEXT) server-side — a string, not a number
  label: string;
}
interface PartOption {
  value: string; // CAST(parts.id AS TEXT) server-side — same string convention
  label: string;
}
interface SignatoryOption {
  value: string;
  label: string;
}
interface MaintenanceData {
  id: number; // printerId
  deploymentId: number;
  serialNo: string;
  modelId: number;
  model: string;
  clientId: number;
  client: string;
  locationId: number;
  location: string;
  departmentId: number;
  department: string;
}
interface PrinterLookupResponse {
  maintenanceData: MaintenanceData;
  signatories: SignatoryOption[];
}
interface UserStatus {
  id: number;
}
interface PartRef {
  partId: string;
  partName: string;
}

export function MaintenanceFormScreen() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const { params } = useRoute<FormRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const api = useApi();
  const sigRef = React.useRef<SignatureViewRef>(null);

  // Hides Android's system nav bar (back/home/recents) specifically while
  // this screen is focused, so it can't obscure the Save Maintenance
  // button — restored automatically the moment the technician navigates
  // away, via useFocusEffect's cleanup running on blur. `overlay-swipe`
  // behavior means a technician can still swipe from the bottom edge to
  // briefly reveal the bar if they genuinely need it (not fully locked
  // out), rather than the more aggressive `immersive` mode that also
  // hides the status bar and intercepts swipes.
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

  const printerQuery = useQuery({
    queryKey: ["printer-lookup", params.serialNo],
    queryFn: () => api.get<PrinterLookupResponse>(`/api/maintain?serialNo=${encodeURIComponent(params.serialNo)}`),
  });
  const userStatusQuery = useQuery({
    queryKey: ["user-status"],
    queryFn: () => api.get<UserStatus>("/api/user-status"),
  });
  const statusOptions = useQuery({
    queryKey: ["dropdown-status"],
    queryFn: () => api.get<StatusOption[]>("/api/dropdown/status"),
  });
  const partsOptions = useQuery({
    queryKey: ["dropdown-parts"],
    queryFn: () => api.get<PartOption[]>("/api/dropdown/parts"),
  });

  // Core fields
  const [statusId, setStatusId] = useState<string | null>(null);
  const [signatoryId, setSignatoryId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [nozzlePhotoUri, setNozzlePhotoUri] = useState<string | null>(null);
  const [signatureUri, setSignatureUri] = useState<string | null>(null);
  // Toggled by the signature canvas's own onBegin/onEnd (see below) — the
  // actual fix for strokes rendering as disconnected dots instead of
  // continuous lines. The canvas sits inside a ScrollView; without this,
  // the ScrollView's own pan/scroll gesture responder can steal the touch
  // mid-stroke (a well-known interaction anywhere a drawing surface is
  // nested inside a scrollable container), so only touchstart and
  // touchend ever reach the canvas — visually indistinguishable from a
  // series of dots. Locking scroll for the exact duration of a stroke is
  // the standard fix for this class of gesture conflict.
  const [signatureDrawing, setSignatureDrawing] = useState(false);

  // Work Done
  const [headClean, setHeadClean] = useState(false);
  const [inkFlush, setInkFlush] = useState(false);
  const [colorSelected, setColorSelected] = useState(false);
  const [cyan, setCyan] = useState(false);
  const [magenta, setMagenta] = useState(false);
  const [yellow, setYellow] = useState(false);
  const [black, setBlack] = useState(false);
  const [resetSelected, setResetSelected] = useState(false);
  const [resetBox, setResetBox] = useState(false);
  const [resetProgram, setResetProgram] = useState(false);

  // Services
  const [cleanPrinter, setCleanPrinter] = useState(false);
  const [cleanWasteTank, setCleanWasteTank] = useState(false);
  const [replace, setReplace] = useState(false);
  const [replaceParts, setReplaceParts] = useState<PartRef[]>([]);
  const [repair, setRepair] = useState(false);
  const [repairParts, setRepairParts] = useState<PartRef[]>([]);
  const [replaceUnit, setReplaceUnit] = useState(false);
  const [replaceSerialNo, setReplaceSerialNo] = useState("");

  const [saving, setSaving] = useState(false);

  // New-signatory inline form — POST /api/signatories, scoped to this
  // exact client+location per the requirement that the same client can
  // have distinct signatories at different locations, and that duplicate
  // prevention only fires when BOTH client AND location match (server-side
  // in app/api/signatories/route.ts — verified against that source, not
  // assumed, since the original route only scoped duplicates by client).
  const [showAddSignatory, setShowAddSignatory] = useState(false);
  const [newSigFirstName, setNewSigFirstName] = useState("");
  const [newSigLastName, setNewSigLastName] = useState("");
  const [addingSignatory, setAddingSignatory] = useState(false);

  const signatories = printerQuery.data?.signatories ?? [];

  useEffect(() => {
    if (signatories.length === 1 && !signatoryId) {
      setSignatoryId(signatories[0].value);
    }
  }, [printerQuery.data]);

  const submitNewSignatory = async () => {
    const printer = printerQuery.data?.maintenanceData;
    if (!printer) return;
    const firstName = newSigFirstName.trim();
    const lastName = newSigLastName.trim();
    if (!firstName || !lastName) {
      Alert.alert("First and last name are both required.");
      return;
    }
    setAddingSignatory(true);
    try {
      const result = await api.post<{ message: string; id: number }>("/api/signatories", {
        clientId: printer.clientId,
        locationId: printer.locationId,
        firstName,
        lastName,
      });
      await printerQuery.refetch();
      setSignatoryId(String(result.id));
      setShowAddSignatory(false);
      setNewSigFirstName("");
      setNewSigLastName("");
    } catch (err) {
      // The route returns 409 specifically for "this exact client+location
      // already has this signatory" — surfaced with the server's own
      // message rather than a generic failure, since it's not really an
      // error so much as "you don't need to add this, it's already here."
      const message =
        err instanceof Error ? err.message : "Couldn't add signatory.";
      Alert.alert("Couldn't add signatory", message);
    } finally {
      setAddingSignatory(false);
    }
  };

  const togglePart = (list: PartRef[], setList: (v: PartRef[]) => void, opt: PartOption) => {
    const exists = list.some((p) => p.partId === opt.value);
    setList(exists ? list.filter((p) => p.partId !== opt.value) : [...list, { partId: opt.value, partName: opt.label }]);
  };

  const capturePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera permission required");
      return;
    }
    // Full-resolution raw capture, uncropped/unoptimized — CropImageScreen
    // is where the technician selects just the relevant nozzle-check
    // portion, and src/lib/image-processing.ts's
    // cropAndOptimizeNozzlePhoto() (called from there) is what actually
    // resizes/compresses to match the web app's real output. onNextCrop
    // registers this screen's one-shot callback before navigating, same
    // pattern as scanReplacementUnit()/onNextScan below.
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!result.canceled && result.assets[0]) {
      onNextCrop((croppedUri) => setNozzlePhotoUri(croppedUri));
      navigation.navigate("CropImage", { uri: result.assets[0].uri });
    }
  };

  const scanReplacementUnit = () => {
    onNextScan((value) => setReplaceSerialNo(value));
    navigation.navigate("ScanQR", undefined);
  };

  const onSignatureOK = (base64: string) => {
    setSignatureUri(base64);
  };

  // Mirrors validation/maintainSchema.ts's .refine() chain exactly — same
  // rules, same order, same messages where reasonable — rather than only
  // relying on the server to reject an incomplete submission after it's
  // already queued offline.
  const validate = (): string | null => {
    if (!statusId) return "Status is required.";
    if (!signatoryId) return "Signatory is required.";
    if (!nozzlePhotoUri) return "A nozzle check photo is required.";
    // maintain.signPath is NOT NULL in the actual database schema — found
    // this the hard way via a Vercel log showing a real Postgres
    // constraint violation (23502) for a report saved without one. The
    // Zod submit schema itself marks signPath as .optional(), which is a
    // pre-existing mismatch with the DB constraint on the web app's own
    // validation layers, not something safe to rely on — the database is
    // the real source of truth for what a submission must contain
    // regardless of how permissive the schema is. Checked here so an
    // un-signed report can never reach the offline queue at all, rather
    // than syncing 30+ times against a constraint it can structurally
    // never satisfy.
    if (!signatureUri) return "A signature is required.";
    if (replace && replaceParts.length === 0) return "Please select at least one replacement part.";
    if (repair && repairParts.length === 0) return "Please select at least one repair part.";
    if (colorSelected && !cyan && !magenta && !yellow && !black) return "Please select at least one color.";
    if (resetSelected && !resetBox && !resetProgram) return "Please select at least one reset option.";
    if (replaceUnit && replaceSerialNo.trim() === "") return "Please scan the QR code of the replacement unit.";
    return null;
  };

  // Save Maintenance: offline-queue-first (reverted from a brief
  // online-first experiment) — see the comment right above enqueueReport()
  // below for why, and useOfflineSync.ts for the auto-retry side of this.
  const saveMaintenance = async () => {
    const printer = printerQuery.data?.maintenanceData;
    if (!printer) {
      Alert.alert("Printer details are still loading — try again in a moment.");
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
        throw new Error("Location permission is required to submit a report.");
      }
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      const id = uuidv4();
      const payload = {
        printerId: printer.id,
        deploymentId: printer.deploymentId,
        client: { value: printer.clientId, label: printer.client },
        location: { value: printer.locationId, label: printer.location },
        department: { value: printer.departmentId, label: printer.department },
        model: { value: printer.modelId, label: printer.model },
        serialNo: printer.serialNo,
        status: Number(statusId),
        userId: userStatusQuery.data.id,
        signatoryId: Number(signatoryId),
        notes,
        headClean,
        inkFlush,
        cleanPrinter,
        cleanWasteTank,
        colorSelected,
        cyan,
        magenta,
        yellow,
        black,
        resetSelected,
        resetBox,
        resetProgram,
        replace,
        replaceParts,
        repair,
        repairParts,
        replaceUnit,
        replaceSerialNo: replaceUnit ? replaceSerialNo.trim() : undefined,
        ...(params.originMTId != null ? { originMTId: params.originMTId } : {}),
        // gpsFixSchema's REAL required shape (validation/maintainSchema.ts)
        // — accuracy and capturedAt have no server-side defaults, so
        // omitting them (as an earlier version of this screen did) fails
        // maintainSubmitSchema.safeParse() outright. heading/speed come
        // back as -1 from expo-location when unknown, which would fail
        // the schema's min(0) checks — normalized to null instead, which
        // the schema explicitly allows.
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

      // Optimize before writing to disk — see src/lib/image-processing.ts.
      // Resized/compressed here (not at capture time for the signature,
      // since the raw canvas base64 only exists at save time) so the
      // queued row and every later upload attempt always references the
      // already-optimized file, never the raw canvas output.
      let localSignatureUri: string | null = null;
      if (signatureUri) {
        const bytes = toByteArray(signatureUri.replace(/^data:image\/png;base64,/, ""));
        const rawFile = new File(Paths.cache, `sig-raw-${id}.png`);
        rawFile.write(bytes);
        localSignatureUri = await optimizeSignature(rawFile.uri);
      }

      // Save Maintenance is offline-queue-first, by design: enqueueReport()
      // below is a local SQLite insert, so this resolves near-instantly
      // regardless of connection quality — a technician standing next to a
      // printer with poor signal isn't stuck waiting on a network
      // round-trip (or its timeout) just to get an "it's saved" confirm.
      // The actual server sync is entirely useOfflineSync's job: it
      // triggers on the offline→online transition, on app foreground, AND
      // now on a periodic interval (~20s) while online with anything still
      // pending/failed — see useOfflineSync.ts — so a queued report is
      // retried automatically without the technician ever needing to open
      // Synchronization and tap Sync themselves. Every retry goes through
      // submitReport(), whose uploadToR2 PUTs to a fixed per-report key and
      // whose /api/maintain POST is clientUuid-idempotent, so however many
      // times a report gets retried it can only ever land once server-side.
      await enqueueReport({
        id,
        createdAt: new Date().toISOString(),
        payload: JSON.stringify(payload),
        photoLocalUris: JSON.stringify([nozzlePhotoUri]),
        signatureLocalUri: localSignatureUri,
        schedDetailsId: params.schedDetailsId ?? null,
      });

      Alert.alert("Saved", "Report saved. It will sync automatically once you're online.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert("Couldn't save report", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (printerQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }
  if (printerQuery.isError || !printerQuery.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Couldn't load printer details for {params.serialNo}.</Text>
        <Pressable style={styles.secondaryButton} onPress={() => printerQuery.refetch()}>
          <Text style={styles.secondaryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const printer = printerQuery.data.maintenanceData;

  const CheckRow = ({
    label,
    value,
    onToggle,
    indent,
  }: {
    label: string;
    value: boolean;
    onToggle: () => void;
    indent?: boolean;
  }) => (
    <Pressable style={[styles.checkRow, indent && styles.checkRowIndent]} onPress={onToggle}>
      <View style={[styles.checkbox, value && styles.checkboxChecked]}>
        {value && <Feather name="check" size={13} color={theme.primaryForeground} />}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );

  const PartPicker = ({ list, setList }: { list: PartRef[]; setList: (v: PartRef[]) => void }) => (
    <View style={[styles.chipRow, styles.checkRowIndent]}>
      {(partsOptions.data ?? []).map((opt) => {
        const active = list.some((p) => p.partId === opt.value);
        return (
          <Pressable
            key={opt.value}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => togglePart(list, setList, opt)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      scrollEnabled={!signatureDrawing}
    >
      <View style={styles.infoCard}>
        <Text style={styles.infoClient}>{printer.client}</Text>
        <Text style={styles.infoLine}>{printer.location}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoTag}>{printer.model}</Text>
          <Text style={styles.infoTag}>{printer.department}</Text>
        </View>
        <Text style={styles.infoSerial}>Serial: {printer.serialNo}</Text>
      </View>

      <Text style={styles.sectionLabel}>Work Done</Text>
      <CheckRow label="Head Clean" value={headClean} onToggle={() => setHeadClean(!headClean)} />
      <CheckRow label="Ink Flushing" value={inkFlush} onToggle={() => setInkFlush(!inkFlush)} />
      <CheckRow
        label="Refill Ink [C][M][Y][K]"
        value={colorSelected}
        onToggle={() => setColorSelected(!colorSelected)}
      />
      {colorSelected && (
        <View style={[styles.chipRow, styles.checkRowIndent]}>
          <CheckRow label="C" value={cyan} onToggle={() => setCyan(!cyan)} />
          <CheckRow label="M" value={magenta} onToggle={() => setMagenta(!magenta)} />
          <CheckRow label="Y" value={yellow} onToggle={() => setYellow(!yellow)} />
          <CheckRow label="K" value={black} onToggle={() => setBlack(!black)} />
        </View>
      )}
      <CheckRow
        label="Reset [Box][Program]"
        value={resetSelected}
        onToggle={() => setResetSelected(!resetSelected)}
      />
      {resetSelected && (
        <View style={[styles.chipRow, styles.checkRowIndent]}>
          <CheckRow label="Box" value={resetBox} onToggle={() => setResetBox(!resetBox)} />
          <CheckRow label="Program" value={resetProgram} onToggle={() => setResetProgram(!resetProgram)} />
        </View>
      )}

      <Text style={styles.sectionLabel}>Services</Text>
      <CheckRow label="Cleaning of Printer" value={cleanPrinter} onToggle={() => setCleanPrinter(!cleanPrinter)} />
      <CheckRow
        label="Cleaning of Waste Tank"
        value={cleanWasteTank}
        onToggle={() => setCleanWasteTank(!cleanWasteTank)}
      />
      <CheckRow label="Replacement" value={replace} onToggle={() => setReplace(!replace)} />
      {replace && <PartPicker list={replaceParts} setList={setReplaceParts} />}
      <CheckRow label="Repair" value={repair} onToggle={() => setRepair(!repair)} />
      {repair && <PartPicker list={repairParts} setList={setRepairParts} />}
      <CheckRow
        label="Replace Service Unit"
        value={replaceUnit}
        onToggle={() => setReplaceUnit(!replaceUnit)}
      />
      {replaceUnit && (
        <View style={[styles.checkRowIndent, { flexDirection: "row", gap: 8, alignItems: "center" }]}>
          <Text style={styles.body}>
            {replaceSerialNo ? `Scanned: ${replaceSerialNo}` : "No unit scanned yet"}
          </Text>
          <Pressable style={styles.scanChip} onPress={scanReplacementUnit}>
            <Feather name="camera" size={14} color={theme.primary} />
            <Text style={styles.scanChipText}>Scan QR</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={styles.textArea}
        multiline
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional notes"
        placeholderTextColor={theme.mutedForeground}
      />

      <Text style={styles.label}>Status</Text>
      <View style={styles.chipRow}>
        {(statusOptions.data ?? []).map((opt) => {
          const active = statusId === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setStatusId(opt.value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.signatoryHeaderRow}>
        <Text style={styles.label}>Signatory (Checked By)</Text>
        <Pressable
          style={styles.addSignatoryButton}
          onPress={() => setShowAddSignatory((v) => !v)}
        >
          <Feather name={showAddSignatory ? "x" : "plus"} size={14} color={theme.primary} />
        </Pressable>
      </View>

      {showAddSignatory && (
        <View style={styles.addSignatoryBox}>
          <TextInput
            style={styles.input}
            placeholder="First name"
            placeholderTextColor={theme.mutedForeground}
            value={newSigFirstName}
            onChangeText={setNewSigFirstName}
          />
          <TextInput
            style={styles.input}
            placeholder="Last name"
            placeholderTextColor={theme.mutedForeground}
            value={newSigLastName}
            onChangeText={setNewSigLastName}
          />
          <Text style={styles.addSignatoryHint}>
            Added for {printerQuery.data?.maintenanceData.client} —{" "}
            {printerQuery.data?.maintenanceData.location} specifically.
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={submitNewSignatory}
            disabled={addingSignatory}
          >
            {addingSignatory ? (
              <ActivityIndicator color={theme.foreground} />
            ) : (
              <Text style={styles.secondaryButtonText}>Add Signatory</Text>
            )}
          </Pressable>
        </View>
      )}

      {signatories.length === 0 ? (
        <Text style={styles.body}>
          No signatories on file for this client and location yet — add one above.
        </Text>
      ) : (
        <View style={styles.chipRow}>
          {signatories.map((opt) => {
            const active = signatoryId === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSignatoryId(opt.value)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={styles.label}>Nozzle check photo (required)</Text>
      {nozzlePhotoUri ? <Image source={{ uri: nozzlePhotoUri }} style={styles.preview} /> : null}
      <Pressable style={styles.secondaryButton} onPress={capturePhoto}>
        <Feather name="camera" size={16} color={theme.foreground} />
        <Text style={styles.secondaryButtonText}>Take Photo</Text>
      </Pressable>

      <Text style={styles.label}>Signatory signature (required)</Text>
      <View style={styles.sigBox}>
        <SignatureScreen
          ref={sigRef}
          onOK={onSignatureOK}
          onBegin={() => setSignatureDrawing(true)}
          // THE ACTUAL BUG: drawing on this canvas never populates
          // `signatureUri` on its own — react-native-signature-canvas
          // only converts strokes to data when readSignature() is
          // explicitly called, which nothing here was doing. A
          // technician could draw a perfectly valid signature and still
          // get "A signature is required" on save, because the state
          // this screen checks was never set. Calling readSignature()
          // here — every time a stroke ends — keeps signatureUri
          // continuously up to date as the technician draws, so by the
          // time they tap Save Maintenance (however much later) it's
          // already captured, with no separate "confirm" step to
          // remember.
          onEnd={() => {
            setSignatureDrawing(false);
            sigRef.current?.readSignature();
          }}
          descriptionText=""
          webStyle="body,html{background:#fff;}"
        />
      </View>
      <Pressable
        style={styles.secondaryButton}
        onPress={() => {
          sigRef.current?.clearSignature();
          // clearSignature() only wipes the visual canvas — it doesn't
          // touch signatureUri, which the onEnd-driven auto-capture above
          // may already have populated from drawing before this tap.
          // Without this, a technician who draws, then clears and
          // reconsiders, would still have the OLD captured signature
          // silently attached to the submission despite the canvas
          // looking empty.
          setSignatureUri(null);
        }}
      >
        <Text style={styles.secondaryButtonText}>Clear Signature</Text>
      </Pressable>

      <Pressable style={styles.primaryButton} onPress={saveMaintenance} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={theme.primaryForeground} />
        ) : (
          <Text style={styles.primaryButtonText}>Save Maintenance</Text>
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
    body: { color: theme.mutedForeground },

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
    infoSerial: { color: theme.mutedForeground, fontSize: 12, marginTop: 6 },

    sectionLabel: {
      fontWeight: "700",
      color: theme.foreground,
      fontSize: 15,
      marginTop: 8,
    },
    label: {
      fontWeight: "600",
      color: theme.mutedForeground,
      fontSize: 13,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },

    checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
    checkRowIndent: { marginLeft: 12 },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxChecked: { backgroundColor: theme.primary, borderColor: theme.primary },
    checkLabel: { color: theme.foreground, fontSize: 14 },

    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    chipText: { color: theme.mutedForeground, fontSize: 13, fontWeight: "600" },
    chipTextActive: { color: theme.primaryForeground },

    signatoryHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    addSignatoryButton: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    addSignatoryBox: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      padding: 12,
      gap: 8,
    },
    addSignatoryHint: { color: theme.mutedForeground, fontSize: 11 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      padding: 10,
      color: theme.foreground,
      backgroundColor: theme.background,
    },

    scanChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: theme.primary,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    scanChipText: { color: theme.primary, fontSize: 12, fontWeight: "700" },

    textArea: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      padding: 12,
      minHeight: 80,
      textAlignVertical: "top",
      color: theme.foreground,
      backgroundColor: theme.card,
    },
    preview: { width: "100%", height: 200, borderRadius: theme.radius },
    sigBox: {
      height: 200,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      overflow: "hidden",
    },
    secondaryButton: {
      flexDirection: "row",
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      borderRadius: theme.radius,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryButtonText: { color: theme.foreground, fontWeight: "600" },
    primaryButton: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: { color: theme.primaryForeground, fontWeight: "700", fontSize: 16 },
  });
}

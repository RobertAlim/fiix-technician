// src/components/SignatoryPicker.tsx
//
// The signatory chip-row + inline "add a new signatory" form, extracted
// so Support Services gets literally the same behaviour the request
// asked for ("populated using the same technician/signatory combobox
// behavior as Maintenance") rather than a lookalike reimplementation
// that drifts the first time one of them is fixed.
//
// ⚠️ MaintenanceFormScreen is deliberately NOT refactored onto this
// component in this delta. It works today, it's the single most
// load-bearing screen in the app, and swapping its signatory block for a
// shared component is a behaviour-neutral change that can only introduce
// risk in the same delta as a large new feature. Worth doing as its own
// small follow-up delta — flagged rather than silently left as
// duplication.
//
// Behaviour copied 1:1 from that screen:
//  - auto-select when exactly one signatory exists
//  - POST /api/signatories scoped to BOTH clientId AND locationId (the
//    route only treats a signatory as a duplicate when both match, since
//    one client can have different signatories per location)
//  - surface the route's own 409 message rather than a generic failure,
//    because "this already exists" isn't really an error
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";
import { ApiClient } from "@/lib/api";

export interface SignatoryOption {
  value: string;
  label: string;
}

interface Props {
  api: ApiClient;
  signatories: SignatoryOption[];
  value: string | null;
  onChange: (value: string) => void;
  clientId: number;
  locationId: number;
  clientName: string;
  locationName: string;
  /** Called after a new signatory is created so the parent can refetch
   *  whatever query owns the list — this component doesn't own it. */
  onAdded: () => Promise<unknown>;
}

export function SignatoryPicker({
  api,
  signatories,
  value,
  onChange,
  clientId,
  locationId,
  clientName,
  locationName,
  onAdded,
}: Props) {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  const [showAdd, setShowAdd] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (signatories.length === 1 && !value) {
      onChange(signatories[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatories]);

  const submitNew = async () => {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      Alert.alert("First and last name are both required.");
      return;
    }
    setAdding(true);
    try {
      const result = await api.post<{ message: string; id: number }>("/api/signatories", {
        clientId,
        locationId,
        firstName: first,
        lastName: last,
      });
      await onAdded();
      onChange(String(result.id));
      setShowAdd(false);
      setFirstName("");
      setLastName("");
    } catch (err) {
      Alert.alert(
        "Couldn't add signatory",
        err instanceof Error ? err.message : "Couldn't add signatory."
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Signatory (Checked By)</Text>
        <Pressable style={styles.addButton} onPress={() => setShowAdd((v) => !v)}>
          <Feather name={showAdd ? "x" : "plus"} size={14} color={theme.primary} />
        </Pressable>
      </View>

      {showAdd && (
        <View style={styles.addBox}>
          <TextInput
            style={styles.input}
            placeholder="First name"
            placeholderTextColor={theme.mutedForeground}
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            style={styles.input}
            placeholder="Last name"
            placeholderTextColor={theme.mutedForeground}
            value={lastName}
            onChangeText={setLastName}
          />
          <Text style={styles.addHint}>
            Added for {clientName} — {locationName} specifically.
          </Text>
          <Pressable style={styles.secondaryButton} onPress={submitNew} disabled={adding}>
            {adding ? (
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
            const active = value === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onChange(opt.value)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    label: { fontWeight: "600", color: theme.mutedForeground, fontSize: 13 },
    body: { color: theme.mutedForeground },
    addButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    addBox: {
      gap: 8,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      padding: 12,
    },
    addHint: { color: theme.mutedForeground, fontSize: 11 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      padding: 12,
      color: theme.foreground,
      backgroundColor: theme.background,
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

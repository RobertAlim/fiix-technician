// src/screens/ProfileScreen.tsx
//
// Mirrors app/(root)/profile: view + edit the caller's own row. Uses
// PUT /api/profile — matches the route exactly (firstName/lastName/
// middleName/contactNo/email only, not birthday). contactNo/email are
// shown but read-only (see the two locked fields below) — the route
// itself still requires both in the body, so those two are always
// resubmitted with their existing server value, never anything typed on
// this screen (moot anyway, since their inputs aren't editable).
//
// Also hosts the theme toggle (Light / Dark / System) — the web app has
// no per-user theme setting to mirror (it just follows the OS/browser),
// so this is new UI specific to the mobile app; Profile is the natural
// home for it since it's the one screen every role already associates
// with "my settings."
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/hooks/useApi";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";

interface UserProfile {
  id: number;
  firstName: string;
  lastName: string;
  middleName: string | null;
  contactNo: string | null;
  birthday: string | null;
  email: string;
  role: string | null;
}

const THEME_OPTIONS = [
  { key: "light" as const, label: "Light", icon: "sun" as const },
  { key: "dark" as const, label: "Dark", icon: "moon" as const },
  { key: "system" as const, label: "System", icon: "smartphone" as const },
];

export function ProfileScreen() {
  const { theme, mode, isExplicit, setMode } = useAppTheme();
  const styles = createStyles(theme);
  const api = useApi();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["user-status"],
    queryFn: () => api.get<UserProfile>("/api/user-status"),
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");

  useEffect(() => {
    if (profileQuery.data) {
      setFirstName(profileQuery.data.firstName);
      setLastName(profileQuery.data.lastName);
      setMiddleName(profileQuery.data.middleName ?? "");
    }
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    // contactNo/email are deliberately read straight from profileQuery.data
    // here, NOT from any local editable state — see the read-only fields
    // below. PUT /api/profile still requires both in the body (it's the
    // same route the web app's editable profile form posts to), so this
    // resubmits them unchanged rather than omitting them, which keeps
    // this request valid without ever letting what's typed on this screen
    // affect either field.
    mutationFn: () =>
      api.put("/api/profile", {
        firstName,
        lastName,
        middleName,
        contactNo: profileQuery.data?.contactNo ?? "",
        email: profileQuery.data?.email ?? "",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-status"] }),
  });

  if (profileQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const activeThemeKey = isExplicit ? mode : "system";

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container}>
      <Text style={styles.label}>Appearance</Text>
      <View style={styles.themeRow}>
        {THEME_OPTIONS.map((opt) => {
          const active = activeThemeKey === opt.key;
          return (
            <Pressable
              key={opt.key}
              style={[styles.themeOption, active && styles.themeOptionActive]}
              onPress={() => setMode(opt.key)}
            >
              <Feather name={opt.icon} size={16} color={active ? theme.primaryForeground : theme.foreground} />
              <Text style={[styles.themeOptionText, active && { color: theme.primaryForeground }]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>First name</Text>
      <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholderTextColor={theme.mutedForeground} />

      <Text style={styles.label}>Last name</Text>
      <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholderTextColor={theme.mutedForeground} />

      <Text style={styles.label}>Middle name</Text>
      <TextInput style={styles.input} value={middleName} onChangeText={setMiddleName} placeholderTextColor={theme.mutedForeground} />

      <View style={styles.lockedLabelRow}>
        <Text style={[styles.label, { marginTop: 0 }]}>Contact number</Text>
        <Feather name="lock" size={11} color={theme.mutedForeground} />
      </View>
      <TextInput
        style={[styles.input, styles.inputLocked]}
        value={profileQuery.data?.contactNo ?? ""}
        editable={false}
        keyboardType="phone-pad"
        placeholderTextColor={theme.mutedForeground}
      />

      <View style={styles.lockedLabelRow}>
        <Text style={[styles.label, { marginTop: 0 }]}>Email</Text>
        <Feather name="lock" size={11} color={theme.mutedForeground} />
      </View>
      <TextInput
        style={[styles.input, styles.inputLocked]}
        value={profileQuery.data?.email ?? ""}
        editable={false}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor={theme.mutedForeground}
      />
      <Text style={styles.lockedHint}>Contact an Admin to update your contact number or email.</Text>

      <View style={styles.rolePill}>
        <Text style={styles.rolePillText}>{profileQuery.data?.role ?? "—"}</Text>
      </View>

      <Pressable style={styles.button} onPress={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? (
          <ActivityIndicator color={theme.primaryForeground} />
        ) : (
          <Text style={styles.buttonText}>Save Changes</Text>
        )}
      </Pressable>
      {saveMutation.isError && (
        <Text style={styles.error}>
          {saveMutation.error instanceof Error ? saveMutation.error.message : "Save failed"}
        </Text>
      )}
      {saveMutation.isSuccess && <Text style={styles.success}>Saved.</Text>}

      <Pressable style={styles.signOutButton} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    container: { padding: 16, gap: 4, backgroundColor: theme.background },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background },
    label: { fontWeight: "600", marginTop: 12, color: theme.mutedForeground, fontSize: 13 },
    themeRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 8 },
    themeOption: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      borderRadius: theme.radius,
      paddingVertical: 10,
    },
    themeOptionActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    themeOptionText: { color: theme.foreground, fontWeight: "600", fontSize: 13 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      padding: 12,
      marginTop: 4,
      color: theme.foreground,
      backgroundColor: theme.card,
    },
    lockedLabelRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 },
    inputLocked: { backgroundColor: theme.muted, color: theme.mutedForeground, marginTop: 4 },
    lockedHint: { color: theme.mutedForeground, fontSize: 11, marginTop: 4 },
    rolePill: {
      alignSelf: "flex-start",
      backgroundColor: theme.accent,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 4,
      marginTop: 16,
      marginBottom: 16,
    },
    rolePillText: { color: theme.info, fontSize: 12, fontWeight: "700" },
    button: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonText: { color: theme.primaryForeground, fontWeight: "700", fontSize: 16 },
    error: { color: theme.destructive, marginTop: 8 },
    success: { color: theme.success, marginTop: 8 },
    signOutButton: {
      marginTop: 32,
      borderWidth: 1,
      borderColor: theme.destructive,
      borderRadius: theme.radius,
      paddingVertical: 12,
      alignItems: "center",
    },
    signOutText: { color: theme.destructive, fontWeight: "700" },
  });
}

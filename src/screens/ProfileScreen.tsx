// src/screens/ProfileScreen.tsx
//
// Mirrors app/(root)/profile: view + edit the caller's own row. Uses
// PUT /api/profile — matches the route exactly (firstName/lastName/
// middleName/contactNo/email only, not birthday).
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
  const [contactNo, setContactNo] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (profileQuery.data) {
      setFirstName(profileQuery.data.firstName);
      setLastName(profileQuery.data.lastName);
      setMiddleName(profileQuery.data.middleName ?? "");
      setContactNo(profileQuery.data.contactNo ?? "");
      setEmail(profileQuery.data.email);
    }
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put("/api/profile", { firstName, lastName, middleName, contactNo, email }),
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

      <Text style={styles.label}>Contact number</Text>
      <TextInput
        style={styles.input}
        value={contactNo}
        onChangeText={setContactNo}
        keyboardType="phone-pad"
        placeholderTextColor={theme.mutedForeground}
      />

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor={theme.mutedForeground}
      />

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

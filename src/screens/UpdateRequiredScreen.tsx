// src/screens/UpdateRequiredScreen.tsx
//
// The hard-stop screen RootNavigator renders in place of the ENTIRE app
// when the installed build is outdated. Deliberately offers no way
// forward except updating — no Sign Out, no Retry-and-continue-anyway,
// no dismiss. Unlike AccountPendingScreen (which offers Sign Out because
// that's a genuine recovery path for an account-state problem), there is
// no legitimate action here except installing the update; a bypass
// button would defeat the entire point of a "hard enforcement" gate.
import React from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";

export function UpdateRequiredScreen({
  updateUrl,
  message,
}: {
  updateUrl: string | null;
  message?: string | null;
}) {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Feather name="download-cloud" size={40} color={theme.primary} />
      </View>
      <Text style={styles.title}>Update Required</Text>
      <Text style={styles.body}>
        A newer version of Fiix Technician is required to continue. Please install the latest
        update before signing back in.
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {updateUrl ? (
        <Pressable style={styles.button} onPress={() => Linking.openURL(updateUrl)}>
          <Feather name="download" size={16} color={theme.primaryForeground} />
          <Text style={styles.buttonText}>Download Update</Text>
        </Pressable>
      ) : (
        // updateUrl coming back null/empty is a backend misconfiguration
        // (see BACKEND-SPEC-delta-008.md — it's a required field), not a
        // state the technician can do anything about — surfaced plainly
        // rather than rendering a button that goes nowhere.
        <Text style={styles.message}>Contact your administrator for the update link.</Text>
      )}
    </View>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 12,
      backgroundColor: theme.background,
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    title: { fontSize: 20, fontWeight: "800", textAlign: "center", color: theme.foreground },
    body: { textAlign: "center", color: theme.mutedForeground, lineHeight: 20 },
    message: {
      textAlign: "center",
      color: theme.mutedForeground,
      fontSize: 13,
      fontStyle: "italic",
      marginTop: 4,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.primary,
      borderRadius: theme.radius,
      paddingVertical: 14,
      paddingHorizontal: 28,
      marginTop: 16,
    },
    buttonText: { color: theme.primaryForeground, fontWeight: "700", fontSize: 15 },
  });
}

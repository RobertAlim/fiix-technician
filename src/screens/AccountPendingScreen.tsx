// src/screens/AccountPendingScreen.tsx
// Mirrors app/(root)/account-pending/page.tsx.
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useAuth } from "@clerk/expo";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";

export function AccountPendingScreen({
  reason,
  detail,
}: {
  reason?: "no-role" | "network-error";
  detail?: string;
}) {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const { signOut } = useAuth();
  const isNoRole = reason === "no-role";
  const isNetworkError = reason === "network-error";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {isNetworkError
          ? "Couldn't reach the server"
          : isNoRole
          ? "Awaiting Role Assignment"
          : "Account Pending Activation"}
      </Text>
      <Text style={styles.body}>
        {isNetworkError
          ? "Check your connection and try again."
          : isNoRole
          ? "Your account is active but hasn't been assigned a role yet. Contact an administrator."
          : "An administrator needs to review and activate your account before you can sign in."}
      </Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      <Pressable style={styles.button} onPress={() => signOut()}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </Pressable>
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
      gap: 16,
      backgroundColor: theme.background,
    },
    title: { fontSize: 18, fontWeight: "700", textAlign: "center", color: theme.foreground },
    body: { textAlign: "center", color: theme.mutedForeground },
    detail: {
      textAlign: "center",
      color: theme.mutedForeground,
      fontFamily: "monospace",
      fontSize: 12,
      paddingHorizontal: 8,
      opacity: 0.7,
    },
    button: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      paddingVertical: 10,
      paddingHorizontal: 24,
      marginTop: 8,
    },
    buttonText: { color: theme.foreground, fontWeight: "600" },
  });
}

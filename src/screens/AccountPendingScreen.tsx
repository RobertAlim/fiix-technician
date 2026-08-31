// src/screens/AccountPendingScreen.tsx
// Mirrors app/(root)/account-pending/page.tsx.
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useAuth } from "@clerk/expo";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";
import { useIsOnline } from "@/hooks/useIsOnline";

export function AccountPendingScreen({
  reason,
  detail,
  onRetry,
}: {
  reason?: "no-role" | "network-error";
  detail?: string;
  // Only meaningful for reason="network-error" — RootNavigator passes
  // its statusQuery.refetch() here. Previously this screen had no way
  // to recover from a failed /api/user-status call short of signing
  // out entirely, which doesn't even help (signing back in needs the
  // same network access that just failed) — a technician on a genuine
  // first-ever cold start with no connectivity had no path forward at
  // all. Optional because the no-role/pending-activation cases have
  // nothing to retry — those are real account states, not a failed
  // fetch.
  onRetry?: () => void;
}) {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const { signOut } = useAuth();
  const online = useIsOnline();
  const isNoRole = reason === "no-role";
  const isNetworkError = reason === "network-error";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {isNetworkError
          ? online
            ? "Couldn't reach the server"
            : "You're offline"
          : isNoRole
          ? "Awaiting Role Assignment"
          : "Account Pending Activation"}
      </Text>
      <Text style={styles.body}>
        {isNetworkError
          ? online
            ? "Check your connection and try again."
            : // This is specifically the never-cached case — once
              // /api/user-status has loaded successfully even once on
              // this device, the persisted query cache (App.tsx) means
              // this whole screen is bypassed on future offline
              // launches. Reaching this message means that hasn't
              // happened yet.
              "This device hasn't loaded your account before, so it needs a connection at least once to get started. After that, you'll be able to open the app offline."
          : isNoRole
          ? "Your account is active but hasn't been assigned a role yet. Contact an administrator."
          : "An administrator needs to review and activate your account before you can sign in."}
      </Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {isNetworkError && onRetry ? (
        <Pressable style={[styles.button, styles.retryButton]} onPress={onRetry}>
          <Text style={[styles.buttonText, { color: theme.primaryForeground }]}>Retry</Text>
        </Pressable>
      ) : null}
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
    retryButton: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
      marginTop: 16,
    },
    buttonText: { color: theme.foreground, fontWeight: "600" },
  });
}

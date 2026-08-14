// src/screens/SignInScreen.tsx
//
// Confirmed against the Clerk Dashboard for this instance (SSO
// Connections: Google and Facebook, no password/email-code). Uses
// @clerk/expo's *experimental* useSSO() (from "@clerk/expo/experimental"),
// which Clerk's own source doc-comments recommend for Core 3 apps.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { useSSO } from "@clerk/expo/experimental";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";

WebBrowser.maybeCompleteAuthSession();

// `native` MUST be passed explicitly — makeRedirectUri() only returns the
// app's own custom scheme when a `native` value is given AND the app is
// running in a Bare/Standalone execution environment (a real dev-client
// or release build) rather than Expo Go. Logged (not shown on-screen) so
// a future redirect issue is diagnosable from Metro's logs.
const REDIRECT_URL = AuthSession.makeRedirectUri({
  path: "sso-callback",
  native: "fiixtechnician://sso-callback",
});
console.log(`[auth] executionEnvironment: ${Constants.executionEnvironment}`);
console.log(`[auth] redirect URL: ${REDIRECT_URL}`);

export function SignInScreen() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const { startSSOFlow } = useSSO();
  const [loadingStrategy, setLoadingStrategy] = useState<"google" | "facebook" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  const signInWith = useCallback(
    async (strategy: "oauth_google" | "oauth_facebook", key: "google" | "facebook") => {
      setError(null);
      setLoadingStrategy(key);
      try {
        const { createdSessionId } = await startSSOFlow({ strategy, redirectUrl: REDIRECT_URL });
        if (!createdSessionId) {
          setError("Sign in didn't complete. Please try again.");
        }
      } catch (err: any) {
        setError(err?.errors?.[0]?.message ?? err?.message ?? "Sign in failed.");
      } finally {
        setLoadingStrategy(null);
      }
    },
    [startSSOFlow]
  );

  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <Text style={styles.logoText}>Fx</Text>
      </View>
      <Text style={styles.title}>Fiix Technician</Text>
      <Text style={styles.subtitle}>Sign in to view your schedule and reports</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, styles.google]}
        onPress={() => signInWith("oauth_google", "google")}
        disabled={loadingStrategy !== null}
      >
        {loadingStrategy === "google" ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Continue with Google</Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.button, styles.facebook]}
        onPress={() => signInWith("oauth_facebook", "facebook")}
        disabled={loadingStrategy !== null}
      >
        {loadingStrategy === "facebook" ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Continue with Facebook</Text>
        )}
      </Pressable>
    </View>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      padding: 24,
      gap: 12,
      backgroundColor: theme.background,
    },
    logoCircle: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginBottom: 16,
    },
    logoText: { color: theme.primary, fontSize: 26, fontWeight: "800" },
    title: { fontSize: 22, fontWeight: "700", textAlign: "center", color: theme.foreground },
    subtitle: {
      color: theme.mutedForeground,
      textAlign: "center",
      marginBottom: 24,
      fontSize: 13,
    },
    button: {
      paddingVertical: 14,
      borderRadius: theme.radius,
      alignItems: "center",
      justifyContent: "center",
    },
    google: { backgroundColor: "#4285F4" },
    facebook: { backgroundColor: "#1877F2" },
    buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
    error: { color: theme.destructive, marginBottom: 12, textAlign: "center" },
  });
}

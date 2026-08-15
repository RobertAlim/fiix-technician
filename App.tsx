// MUST be the very first import in the app — uuid (used by
// MaintenanceFormScreen for the offline-report idempotency key) calls
// crypto.getRandomValues() under the hood, which Hermes doesn't provide
// natively. This polyfill has to install itself before anything else
// (including uuid itself) gets a chance to run, or the polyfill is a
// no-op and every uuidv4() call throws
// "crypto.getRandomValues() not supported."
import "react-native-get-random-values";
import "react-native-gesture-handler";
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CLERK_PUBLISHABLE_KEY } from "@/config";
import { ThemeProvider, useAppTheme } from "@/theme";
import { RootNavigator } from "@/navigation/RootNavigator";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";
// Registers the background location TaskManager task at module load time —
// required so the task definition exists even if the app is cold-started
// by the OS to deliver a location update while fully closed.
import "@/lib/background-location";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// Bridges this app's theme system into React Navigation's own theme prop
// (which colors every navigator's background/header/border) and the
// status bar's content color — both need to react live to the same
// light/dark state, not just the screen-level styles.
function ThemedApp() {
  const { theme, mode } = useAppTheme();
  const base = mode === "light" ? DefaultTheme : DarkTheme;
  const navigationTheme = {
    ...base,
    dark: mode === "dark",
    colors: {
      ...base.colors,
      background: theme.background,
      card: theme.card,
      text: theme.foreground,
      primary: theme.primary,
      border: theme.border,
      notification: theme.destructive,
    },
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootNavigator />
      <StatusBar style={mode === "light" ? "dark" : "light"} />
    </NavigationContainer>
  );
}

// Config-missing screen — plain hardcoded colors, same reasoning as
// RootErrorBoundary: this has to render before ThemeProvider even mounts.
//
// THE ACTUAL BUG THIS FIXES: the previous version only console.error'd
// when EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY was missing, then proceeded to
// mount <ClerkProvider publishableKey=""> anyway. Clerk's SDK validates
// the key immediately and throws/hangs on an empty one — with no
// dev-mode red-box in a release build to surface that, the result is
// exactly "black screen on every device" and no way to tell why. A
// missing EXPO_PUBLIC_* var at runtime almost always means it wasn't
// actually available to the EAS cloud build (a local .env file is NOT
// automatically uploaded to EAS's build servers — it needs to be
// registered via `eas env:create` or eas.json's `env` field) — this
// screen says so directly instead of leaving that to be guessed at from
// a blank screen.
//
// API_BASE_URL (src/config.ts) deliberately isn't checked here — it has
// a hardcoded fallback default and can never actually be empty, unlike
// the Clerk key, which has none. Checking it would only ever be a
// permanently-false condition, not a real signal.
function ConfigMissingScreen() {
  return (
    <View style={configStyles.container}>
      <Text style={configStyles.title}>Configuration Missing</Text>
      <Text style={configStyles.message}>
        This build is missing a required environment variable:
      </Text>
      <Text style={configStyles.varName}>• EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY</Text>
      <Text style={configStyles.hint}>
        If this is an EAS cloud build, a local .env file is not
        automatically available to it — register this via `eas env:create`
        (or eas.json's build.&lt;profile&gt;.env) and rebuild.
      </Text>
    </View>
  );
}

const configStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#010d16", alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  title: { color: "#ff5c82", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  message: { color: "#e4f3ea", fontSize: 14, textAlign: "center", marginBottom: 4 },
  varName: { color: "#e9ab2b", fontSize: 13, fontFamily: "monospace" },
  hint: { color: "#6ebfb9", fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 17 },
});

export default function App() {
  if (!CLERK_PUBLISHABLE_KEY) {
    return <ConfigMissingScreen />;
  }

  return (
    <RootErrorBoundary>
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <ThemeProvider>
              <ThemedApp />
            </ThemeProvider>
          </SafeAreaProvider>
        </QueryClientProvider>
      </ClerkProvider>
    </RootErrorBoundary>
  );
}

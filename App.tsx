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
import { StatusBar } from "expo-status-bar";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CLERK_PUBLISHABLE_KEY } from "@/config";
import { ThemeProvider, useAppTheme } from "@/theme";
import { RootNavigator } from "@/navigation/RootNavigator";
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

export default function App() {
  if (!CLERK_PUBLISHABLE_KEY) {
    // Fails loudly rather than silently running unauthenticated — this
    // should only ever happen from a misconfigured build, never in
    // production.
    console.error(
      "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. See .env.example."
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <ThemeProvider>
            <ThemedApp />
          </ThemeProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

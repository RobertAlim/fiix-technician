// MUST be the very first import in the app — uuid (used by
// MaintenanceFormScreen for the offline-report idempotency key) calls
// crypto.getRandomValues() under the hood, which Hermes doesn't provide
// natively. This polyfill has to install itself before anything else
// (including uuid itself) gets a chance to run, or the polyfill is a
// no-op and every uuidv4() call throws
// "crypto.getRandomValues() not supported."
import "react-native-get-random-values";
import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { View, Text, StyleSheet, AppState, AppStateStatus, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { QueryClient, onlineManager, focusManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CLERK_PUBLISHABLE_KEY } from "@/config";
import { ThemeProvider, useAppTheme } from "@/theme";
import { RootNavigator } from "@/navigation/RootNavigator";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
// Registers the background location TaskManager task at module load time —
// required so the task definition exists even if the app is cold-started
// by the OS to deliver a location update while fully closed.
import "@/lib/background-location";

// networkMode: "offlineFirst" (not the default "online") — with "online",
// a query that has never successfully fetched stays permanently paused
// while offline rather than attempting and failing fast, which left the
// UI showing an indefinite spinner instead of a clear "you're offline
// and this hasn't been downloaded yet" state. "offlineFirst" still
// serves cached data immediately when present (unchanged from before),
// it just also lets a genuinely-uncached query fail fast enough to
// render the friendly empty/offline states screens now check for
// (see prefetch.ts and the isError branches this enables across
// Dashboard, MaintenanceForm, SupportServiceForm, PrinterHistory).
//
// gcTime bumped from the (implicit) default 5 minutes to 7 days: gcTime
// is how long UNUSED cached data is kept before being dropped from
// memory AND from what gets persisted below — 5 minutes was fine when
// the cache only had to survive within one screen session, but is far
// too short for "still there tomorrow morning if last night's Time-Out
// sync happened offline and the app was killed before ever going back
// online." A technician's actual working set (today's itinerary, each
// scheduled printer's detail, dropdowns) is small, so keeping a week of
// it in AsyncStorage costs nothing meaningful.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, gcTime: 7 * 24 * 60 * 60 * 1000, networkMode: "offlineFirst" },
  },
});

// AsyncStorage-backed persister — the actual fix for "offline after an
// app restart." Without this, every GET response lived only in the
// in-memory QueryClient cache: perfectly fine for staying usable while
// the app keeps running through a signal drop, but wiped the instant
// the app was killed or the OS reclaimed it, which is exactly when a
// technician most needs yesterday's — or this morning's — itinerary
// still on screen. React Native has no browser localStorage for the
// default sync persister to use, so this swaps in the async variant
// bound to the same AsyncStorage useOfflineSync.ts already depends on.
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "fiix-query-cache",
  // Throttles how often a persist write fires on rapid-fire cache
  // updates (e.g. the 3s queue-status poll in useOfflineSync ticking)
  // — this cache is read-heavy background reference data, not something
  // that needs sub-second durability, and writing on every single
  // invalidation would be pure AsyncStorage churn for no benefit.
  throttleTime: 1_000,
});

// react-query's onlineManager defaults to a browser-only implementation
// (window's online/offline events via `navigator.onLine`) — neither
// exists in React Native, so without this, onlineManager silently
// reports "online" unconditionally no matter what the device's real
// connectivity is. That's not a cosmetic gap: it's what
// `networkMode: "offlineFirst"` above and every query's
// `refetchOnReconnect` (on by default) actually key off internally —
// without wiring a real source, "refetch automatically once the
// connection comes back" (part of the request) would never fire on its
// own, only via the explicit invalidateQueries calls useOfflineSync
// already makes after a successful queue drain. This is TanStack
// Query's own documented React Native integration pattern, bound to
// the same NetInfo library useOfflineSync and OfflineBanner already
// depend on, so all three agree on one definition of "online."
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected && state.isInternetReachable !== false);
  });
});

// Same story for focusManager: its default is the browser's
// `visibilitychange` event, which — like `navigator.onLine` above —
// doesn't exist in React Native, so `refetchOnWindowFocus` (also on by
// default) never fires either without this. AppState's "active" event
// is React Native's equivalent of a browser tab regaining focus — e.g.
// the technician switching back to Fiix after using another app or
// after the OS backgrounded it. Platform-gated because the web-focused
// default DOES already work correctly if this ever runs in a web
// build (Expo supports one, even though this app isn't shipped that
// way today) — overriding it there would be actively wrong, not just
// redundant.
function handleAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
}

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
      {/* Mounted above the navigator (not inside Dashboard/MaintenanceList
          the way SyncStatusPanel's chip is) so the offline/online
          transition is visible from EVERY screen — including SignIn,
          the printer form, Support Services — not just the two screens
          that happen to care about the sync queue specifically. This is
          the "clearly handle the transition ... without interrupting
          the technician's workflow" half of the requirement: a thin
          banner that appears/disappears, never a blocking modal. */}
      <OfflineBanner />
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
  // Subscribed unconditionally, before the config-check early return
  // below — React's hook rules require this to run on every render
  // regardless of that branch, and the subscription itself is cheap
  // and harmless even in the (rare, misconfigured-build) case where
  // ConfigMissingScreen ends up rendering instead of the real app.
  useEffect(() => {
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, []);

  if (!CLERK_PUBLISHABLE_KEY) {
    return <ConfigMissingScreen />;
  }

  return (
    <RootErrorBoundary>
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: asyncStoragePersister,
            // How long a PERSISTED (disk) entry is trusted before being
            // dropped on rehydration — deliberately longer than an
            // ordinary offline shift: a technician who is out sick, or
            // whose phone stays off over a weekend, shouldn't come back
            // to a wiped cache. Distinct from queryClient's own gcTime
            // above (which governs the in-memory copy); this is the
            // on-disk equivalent, and react-query-persist-client also
            // clamps by gcTime automatically, so this can't outlive that.
            maxAge: 7 * 24 * 60 * 60 * 1000,
            // Bumped whenever a cached response's SHAPE changes in a way
            // an old persisted blob wouldn't match (e.g. a field renamed
            // or removed on an API route) — mismatched cached JSON
            // getting fed straight into a screen expecting the new shape
            // is a worse failure mode than just re-fetching once. Not
            // tied to the app version automatically: bump this by hand
            // in the same PR as a breaking response-shape change.
            buster: "v1",
          }}
        >
          <SafeAreaProvider>
            <ThemeProvider>
              <ThemedApp />
            </ThemeProvider>
          </SafeAreaProvider>
        </PersistQueryClientProvider>
      </ClerkProvider>
    </RootErrorBoundary>
  );
}

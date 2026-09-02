// src/navigation/RootNavigator.tsx
//
// Mirrors middleware.ts's gating logic (account active? role assigned?)
// but adds one more gate the web app doesn't need: this app is
// Technician-only. An Admin or Scheduler who signs in here (e.g. wrong
// account, shared device) is shown UnsupportedRoleScreen and sent back to
// sign-out rather than any Technician UI — the web app remains the only
// surface for those roles, so there's no reason to build anything for them
// here.
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, View, Text, Pressable } from "react-native";

import { useApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import { useAppTheme } from "@/theme";
import { SignInScreen } from "@/screens/SignInScreen";
import { RegistrationScreen } from "@/screens/RegistrationScreen";
import { AccountPendingScreen } from "@/screens/AccountPendingScreen";
import { UnsupportedRoleScreen } from "@/screens/UnsupportedRoleScreen";
import { UpdateRequiredScreen } from "@/screens/UpdateRequiredScreen";
import { AppTabs } from "@/navigation/AppTabs";
import { MaintenanceFormScreen } from "@/screens/MaintenanceFormScreen";
import { ScanQRScreen } from "@/screens/ScanQRScreen";
import { CropImageScreen } from "@/screens/CropImageScreen";
import { SupportServiceFormScreen } from "@/screens/SupportServiceFormScreen";
import { PrinterHistoryScreen } from "@/screens/PrinterHistoryScreen";
import { VERSION_CHECK_INTERVAL_MS } from "@/config";
import {
  VersionCheckResponse,
  getInstalledBuildNumber,
  getRequiredBuildNumber,
  getUpdateUrl,
  isBuildOutdated,
} from "@/lib/version-check";

export type RootStackParamList = {
  AppTabs: undefined;
  // printerId/deploymentId deliberately NOT passed as nav params —
  // MaintenanceFormScreen always resolves them itself via
  // GET /api/maintain?serialNo=, the same single source of truth
  // regardless of entry path (itinerary tap vs scan/manual lookup),
  // matching how the web app's Maintenance page takes just `serialNo`
  // as its identifying prop. schedDetailsId/originMTId are present only
  // when opened from an itinerary row — that's what links the resulting
  // report back to the schedule (POST /api/sched-details after submit),
  // mirroring features/offline-sync/sync-engine.ts's step 4 on web.
  MaintenanceForm: { serialNo: string; schedDetailsId?: number; originMTId?: number };
  ScanQR: { callingPage?: string } | undefined;
  // Raw camera output only — the finished cropped/optimized uri comes
  // back through crop-bridge.ts's one-shot callback (same pattern as
  // ScanQR/scan-bridge.ts), not a param, since there's no built-in way
  // for a popped screen to hand a value back up the stack.
  CropImage: { uri: string };
  // Support Services now opens in two ways:
  //  - { supportServiceId }: a Scheduler-created row — the screen
  //    re-resolves the full activity (and its signatories) from one
  //    endpoint, same reasoning as MaintenanceForm taking only a
  //    serialNo, so it behaves identically however it was reached.
  //  - { scheduleId, ...fromSchedule }: documenting a printer-less
  //    `schedules` row for the first time. No supportServices row exists
  //    yet to fetch, so the client/location/notes the Dashboard already
  //    has loaded are passed through directly instead of adding a round
  //    trip to re-fetch data the caller already had in hand — signatories
  //    are fetched separately via the existing GET /api/signatories.
  SupportServiceForm:
    | { supportServiceId: number }
    | {
        scheduleId: number;
        clientId: number;
        locationId: number;
        client: string;
        location: string;
        notes: string | null;
      };
  // Read-only history view for one printer. serialNo, not printerId:
  // it's the identifier every other lookup in this app is keyed by
  // (GET /api/maintain?serialNo=, the QR codes themselves), so a caller
  // never has to carry a second identifier just for this screen.
  PrinterHistory: { serialNo: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// /api/user-status returns the full `users` row (see lib/user-status.ts —
// it's `select()` with no column list), not a purpose-built DTO. Only
// isActive/role are used by the web middleware; contactNo/birthday are
// read here too since they're what the registration form
// (app/(root)/registration) collects, and there's no dedicated
// "profile complete" flag server-side to check instead.
interface UserStatus {
  isActive: boolean;
  role: "Admin" | "Technician" | "Scheduler" | null;
  contactNo: string | null;
  birthday: string | null;
}

function Centered({ children }: { children: React.ReactNode }) {
  const { theme } = useAppTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}>
      {children}
    </View>
  );
}

export function RootNavigator() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const { theme } = useAppTheme();

  // Mandatory version gate — checked FIRST, before isLoaded/isSignedIn,
  // so an outdated build is blocked before it can even reach the sign-in
  // screen. Deliberately unauthenticated (see version-check.ts) for
  // exactly that reason: it can't depend on a Clerk token the technician
  // doesn't have yet.
  //
  // `enabled: true` unconditionally (no gate on isSignedIn) is the
  // whole point here — every other query in this file only runs once
  // signed in; this one has to run regardless.
  const versionQuery = useQuery({
    queryKey: ["app-version-check"],
    queryFn: () => api.get<VersionCheckResponse>("/api/app-version"),
    // Re-checks a still-running session periodically, not just at cold
    // start — see VERSION_CHECK_INTERVAL_MS's own comment for why "on
    // app startup" alone isn't enough for a HARD enforcement claim.
    // refetchOnWindowFocus (react-query's default, wired to AppState via
    // focusManager in App.tsx) adds a second trigger on top of this
    // timer: switching back into the app after using something else
    // re-checks immediately rather than waiting out the rest of the
    // interval.
    refetchInterval: VERSION_CHECK_INTERVAL_MS,
    // Overrides the app-wide default (retry: 1, set in App.tsx) with
    // more attempts and real backoff between them — this is the ONE
    // query in the entire app whose failure can fully block access
    // before a technician even reaches sign-in, so it should tolerate a
    // flaky mobile connection (a single dropped packet, a momentary
    // handoff between cell towers) rather than giving up after one retry
    // fired near-instantly. 3 retries with 1s/2s/4s backoff costs at
    // most ~7 extra seconds on a genuinely bad connection, which is
    // cheap insurance against showing a block screen for a problem that
    // would have resolved itself on the next attempt.
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  // Declared here, BEFORE any conditional return below — React's hook
  // rules require every hook to run unconditionally on every render, in
  // the same order. This has to stay above the version-gate's early
  // returns for that reason, even though its result is only consumed
  // further down; splitting it out to sit next to its "not signed in"
  // check would put a `useQuery` call after an early `return`.
  const statusQuery = useQuery({
    queryKey: ["user-status"],
    queryFn: () => api.get<UserStatus>("/api/user-status"),
    enabled: isSignedIn === true,
  });

  if (versionQuery.data) {
    const installedBuild = getInstalledBuildNumber();
    const requiredBuild = getRequiredBuildNumber(versionQuery.data);
    if (isBuildOutdated(installedBuild, requiredBuild)) {
      return (
        <UpdateRequiredScreen
          updateUrl={getUpdateUrl(versionQuery.data)}
          message={versionQuery.data.message}
        />
      );
    }
    // Installed build is current — fall through to the rest of the app
    // normally. A background refetch failing LATER (e.g. the technician
    // goes offline mid-shift) does not re-trigger this branch, because
    // `versionQuery.data` still holds the last successful response —
    // exactly the "don't lock out an already-verified offline session"
    // behavior the delta README explains in more depth.
  } else if (versionQuery.isError) {
    // No cached data AND the live check just failed — this device has
    // NEVER successfully verified its build. Fails closed here,
    // deliberately: unlike every other query in this app, letting an
    // unverified build through "just this once" is precisely the gap a
    // mandatory version gate exists to close. In practice this is a
    // narrow window (effectively "first-ever launch with no
    // connectivity"), since Clerk sign-in itself needs a network
    // connection the technician doesn't have here either.
    //
    // Shows the real failure underneath the generic message — an
    // ApiError means the request reached the server and got back a
    // non-2xx status (shown as the status code + URL); any other Error
    // means the request never got a response at all (DNS, timeout,
    // no connectivity, TLS failure, etc — shown as that error's own
    // message, e.g. "Network request failed" or "Request timed out").
    // This is the same information adb logcat / Console.app would show
    // for this request's `[api] ...` log line, surfaced directly on the
    // screen instead, so diagnosing this doesn't require pulling device
    // logs at all.
    const err = versionQuery.error;
    const detail =
      err instanceof ApiError
        ? `HTTP ${err.status} — ${err.url}`
        : err instanceof Error
        ? err.message
        : null;
    return (
      <Centered>
        <View style={{ padding: 24, gap: 16, alignItems: "center" }}>
          <Text style={{ color: theme.foreground, fontWeight: "700", fontSize: 16, textAlign: "center" }}>
            Couldn't verify app version
          </Text>
          <Text style={{ color: theme.mutedForeground, textAlign: "center" }}>
            This device hasn't verified it's running an approved build yet. Connect to the
            internet and try again.
          </Text>
          {detail && (
            <Text
              style={{
                color: theme.mutedForeground,
                fontFamily: "monospace",
                fontSize: 12,
                textAlign: "center",
                opacity: 0.7,
                paddingHorizontal: 8,
              }}
            >
              {detail}
            </Text>
          )}
          <Pressable
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: theme.radius,
              paddingVertical: 10,
              paddingHorizontal: 24,
            }}
            onPress={() => versionQuery.refetch()}
          >
            <Text style={{ color: theme.foreground, fontWeight: "600" }}>Retry</Text>
          </Pressable>
        </View>
      </Centered>
    );
  } else if (versionQuery.isLoading) {
    // First-ever check, still in flight, nothing cached yet.
    return (
      <Centered>
        <ActivityIndicator size="large" color={theme.primary} />
      </Centered>
    );
  }

  if (!isLoaded) {
    return (
      <Centered>
        <ActivityIndicator size="large" color={theme.primary} />
      </Centered>
    );
  }

  if (!isSignedIn) {
    return <SignInScreen />;
  }

  if (statusQuery.isLoading) {
    return (
      <Centered>
        <ActivityIndicator size="large" color={theme.primary} />
      </Centered>
    );
  }

  if (statusQuery.isError) {
    // Network/API failure — fail closed, same principle TimeInScreen uses
    // for the geofence check: an unreachable server is never treated as
    // "assume it's fine" for a gate that guards real functionality.
    // The actual error is surfaced (not just a generic message) since
    // this is the first authenticated call after sign-in and the most
    // useful place to see exactly what's wrong: a real network failure,
    // a 401 (bad/rejected token), a 404 (wrong API_BASE_URL or a routing
    // issue upstream), a 500, etc.
    const err = statusQuery.error;
    const detail =
      err instanceof ApiError
        ? `HTTP ${err.status} — ${err.url}`
        : err instanceof Error
        ? err.message
        : String(err);
    return <AccountPendingScreen reason="network-error" detail={detail} onRetry={() => statusQuery.refetch()} />;
  }

  const status = statusQuery.data;

  // Profile completeness is checked BEFORE isActive: a brand-new user is
  // inactive by definition (users.isActive defaults false) and has no
  // contactNo/birthday yet — they need Registration first so there's
  // something for an Admin to review, not an indefinite AccountPending
  // screen with nothing to act on. Once saved, save-profile does NOT flip
  // isActive itself, so the user then correctly falls through to
  // AccountPending until an Admin approves them.
  if (!status?.contactNo || !status?.birthday) {
    return <RegistrationScreen />;
  }

  if (!status.isActive) {
    return <AccountPendingScreen reason={status.role ? undefined : "no-role"} />;
  }

  if (status.role !== "Technician") {
    return <UnsupportedRoleScreen role={status.role} />;
  }

  return (
    <Stack.Navigator>
      <Stack.Screen name="AppTabs" component={AppTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="MaintenanceForm"
        component={MaintenanceFormScreen}
        options={{ title: "Maintenance Report" }}
      />
      <Stack.Screen name="ScanQR" component={ScanQRScreen} options={{ title: "Scan QR" }} />
      <Stack.Screen
        name="CropImage"
        component={CropImageScreen}
        options={{ title: "Crop Photo", presentation: "modal" }}
      />
      <Stack.Screen
        name="SupportServiceForm"
        component={SupportServiceFormScreen}
        options={{ title: "Support Service" }}
      />
      <Stack.Screen
        name="PrinterHistory"
        component={PrinterHistoryScreen}
        options={{ title: "Printer History", presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}

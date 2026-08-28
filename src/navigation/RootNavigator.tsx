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
import { ActivityIndicator, View } from "react-native";

import { useApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import { useAppTheme } from "@/theme";
import { SignInScreen } from "@/screens/SignInScreen";
import { RegistrationScreen } from "@/screens/RegistrationScreen";
import { AccountPendingScreen } from "@/screens/AccountPendingScreen";
import { UnsupportedRoleScreen } from "@/screens/UnsupportedRoleScreen";
import { AppTabs } from "@/navigation/AppTabs";
import { MaintenanceFormScreen } from "@/screens/MaintenanceFormScreen";
import { ScanQRScreen } from "@/screens/ScanQRScreen";
import { CropImageScreen } from "@/screens/CropImageScreen";
import { SupportServiceFormScreen } from "@/screens/SupportServiceFormScreen";
import { PrinterHistoryScreen } from "@/screens/PrinterHistoryScreen";

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
  // Support Services: only the row id is passed, for the same reason
  // MaintenanceForm takes only a serialNo — the screen re-resolves the
  // full activity (and its signatories) itself from one endpoint, so it
  // behaves identically however it was reached and never renders stale
  // params handed down from a list that may have refetched since.
  SupportServiceForm: { supportServiceId: number };
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

  const statusQuery = useQuery({
    queryKey: ["user-status"],
    queryFn: () => api.get<UserStatus>("/api/user-status"),
    enabled: isSignedIn === true,
  });

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
    return <AccountPendingScreen reason="network-error" detail={detail} />;
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

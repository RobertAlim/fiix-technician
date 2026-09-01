// src/lib/version-check.ts
//
// The comparison half of the mandatory-update guardrail — RootNavigator.tsx
// owns the actual gate (fetching, caching via the existing persisted
// query client, and rendering UpdateRequiredScreen). This module only
// answers "what build is this device running" and "is that outdated."
//
// ⚠️ GET /api/app-version is a NEW, UNAUTHENTICATED endpoint — see
// BACKEND-SPEC-delta-008.md. Unauthenticated deliberately: this check
// has to run and be able to BLOCK before Clerk sign-in even happens (an
// outdated build shouldn't even be allowed to reach the sign-in screen),
// so it can't depend on a bearer token the technician doesn't have yet.
import * as Application from "expo-application";
import { Platform } from "react-native";

export interface VersionCheckResponse {
  // Keyed by platform since iOS and Android release independently — a
  // new Android build going out doesn't mean iOS technicians need to
  // update too, and gating both platforms off ONE shared number would
  // force synchronized releases for no real reason.
  minBuildNumber: { ios: number; android: number };
  // Where "Download Update" sends the technician. Deliberately a plain
  // URL rather than an assumed App/Play Store scheme — this project's
  // eas.json has production going through `submit`, which usually means
  // a store listing, but preview/internal builds are distributed as a
  // direct APK — a URL keeps this endpoint correct for either without
  // the mobile app needing to know which distribution model is
  // currently in use.
  updateUrl: { ios: string; android: string };
  // Optional human-readable reason shown alongside the generic copy —
  // e.g. "This update fixes an issue with Time Out at some locations."
  // Never required; UpdateRequiredScreen has sensible copy without it.
  message?: string | null;
}

/**
 * The installed build number, read from the compiled binary itself
 * (Info.plist's CFBundleVersion / AndroidManifest's versionCode) via
 * `expo-application` — NOT from app.json, which only reflects the
 * source at build time and (per this project's eas.json,
 * `appVersionSource: "remote"` + production `autoIncrement: true`) is
 * not what actually ships in a given build anyway; EAS assigns and
 * increments the real number remotely.
 *
 * Returns `null` if the native value can't be parsed as a number —
 * deliberately NOT NaN, and NEVER silently treated as "current": every
 * call site must treat `null` as "can't verify this device's build,"
 * which the gate then treats the same as a failed version-check
 * response (see RootNavigator.tsx) rather than letting an unparseable
 * value slip through a numeric comparison (`NaN < required` is always
 * `false` in JS — that would make an ungated device look eternally
 * up to date, exactly backwards from what this feature exists to
 * prevent).
 */
export function getInstalledBuildNumber(): number | null {
  const raw = Application.nativeBuildVersion;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getRequiredBuildNumber(response: VersionCheckResponse): number {
  return Platform.OS === "ios" ? response.minBuildNumber.ios : response.minBuildNumber.android;
}

export function getUpdateUrl(response: VersionCheckResponse): string {
  return Platform.OS === "ios" ? response.updateUrl.ios : response.updateUrl.android;
}

/** `installed == null` (unparseable) counts as outdated — see
 *  getInstalledBuildNumber's doc comment for why that has to be the
 *  direction this fails in. */
export function isBuildOutdated(installed: number | null, required: number): boolean {
  if (installed == null) return true;
  return installed < required;
}

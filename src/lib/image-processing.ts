// src/lib/image-processing.ts
//
// Resizes/compresses images before they ever reach the offline queue (and
// therefore before uploadToR2), so the SQLite queue holds the same
// already-optimized bytes that get PUT to R2 on every sync attempt —
// there's no separate "compress at upload time" step to keep in sync with
// this one.
//
// ⚠️ THE NUMBERS BELOW ARE PROVISIONAL, NOT PORTED FROM THE WEB APP.
// This session doesn't have the web app's actual image-processing source
// (whatever runs before its nozzle-photo/signature upload — sharp? a
// canvas resize? something in features/offline-sync/save-maintenance-
// report.ts?), so these are reasonable general-purpose defaults for a
// document/defect photo and a line-art signature respectively, not a
// confirmed match to what fruitbeanink.com actually stores. Send over
// that file (or just the max width/height + quality/format it uses for
// each of the two images) and these constants — and only these constants,
// the surrounding plumbing stays the same — are what need updating for
// real parity.
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

const NOZZLE_MAX_DIMENSION = 1280;
const NOZZLE_JPEG_QUALITY = 0.75;
const SIGNATURE_MAX_WIDTH = 600;

/** Resize (longest edge capped, aspect ratio preserved) + re-encode as
 *  JPEG. Called right at capture time (MaintenanceFormScreen's
 *  capturePhoto), not at save time, so the on-screen preview and the
 *  eventually-uploaded file are always the same bytes. */
export async function optimizeNozzlePhoto(uri: string): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: NOZZLE_MAX_DIMENSION } }],
    { compress: NOZZLE_JPEG_QUALITY, format: SaveFormat.JPEG }
  );
  return result.uri;
}

/** Resize + re-encode as PNG (kept lossless — signatures are thin-line
 *  art where JPEG's block compression tends to introduce visible
 *  ringing/fuzz around strokes, unlike a photo). Takes a local file URI,
 *  not the raw base64 the signature canvas hands back — the caller
 *  writes the decoded canvas bytes to a temp file first (see
 *  MaintenanceFormScreen's saveMaintenance), since manipulateAsync
 *  operates on a URI. */
export async function optimizeSignature(localPngUri: string): Promise<string> {
  const result = await manipulateAsync(
    localPngUri,
    [{ resize: { width: SIGNATURE_MAX_WIDTH } }],
    { format: SaveFormat.PNG }
  );
  return result.uri;
}

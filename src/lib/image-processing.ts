// src/lib/image-processing.ts
//
// Nozzle-photo numbers below are ported directly from the web app's
// components/CameraCapture.tsx (MAX_IMAGE_WIDTH/HEIGHT = 1920,
// JPEG_QUALITY = 0.8) — confirmed against the real source, not a guess.
// cropAndOptimizeNozzlePhoto() replicates that file's
// processAndOptimizeImage() dual-axis cap exactly: `Math.min(MAXW/width,
// MAXH/height)`, only scaling DOWN (never up) when the cropped region
// exceeds 1920 on either axis, then re-encoding as JPEG at the same
// quality. The crop itself is the mobile-specific addition — the web app
// gets its "only the relevant portion" framing from the technician
// physically composing the shot within a fixed aspect-video viewfinder
// (live camera) or from whatever the source photo already was (gallery
// upload); mobile's camera path doesn't have anything comparable, so
// CropImageScreen adds an explicit freeform crop step instead, and this
// function receives that crop rectangle already computed in the source
// image's own pixel coordinates.
//
// Signature numbers (below) are still NOT ported from web — this source
// file only covers camera-photo capture, not the signature canvas, which
// is presumably a separate component. Still provisional.
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

const NOZZLE_MAX_WIDTH = 1920;
const NOZZLE_MAX_HEIGHT = 1920;
const NOZZLE_JPEG_QUALITY = 0.8;

const SIGNATURE_MAX_WIDTH = 600; // ⚠️ still provisional — see note above

export interface CropRectPixels {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** Crop to exactly the technician-selected rectangle (source-image pixel
 *  coordinates — CropImageScreen is responsible for converting from its
 *  on-screen overlay to these before calling this), then cap to
 *  1920×1920 (only ever scaling down, matching web's
 *  `Math.min(MAXW/width, MAXH/height)` — a crop smaller than 1920 on
 *  both axes is left at its native size, same as web), then re-encode as
 *  JPEG @ 0.8. One manipulateAsync call does the crop+resize+compress
 *  together rather than three separate round-trips. */
export async function cropAndOptimizeNozzlePhoto(
  uri: string,
  crop: CropRectPixels
): Promise<string> {
  const ratio = Math.min(NOZZLE_MAX_WIDTH / crop.width, NOZZLE_MAX_HEIGHT / crop.height, 1);
  const targetWidth = Math.round(crop.width * ratio);
  const targetHeight = Math.round(crop.height * ratio);

  const result = await manipulateAsync(
    uri,
    [
      { crop },
      { resize: { width: targetWidth, height: targetHeight } },
    ],
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

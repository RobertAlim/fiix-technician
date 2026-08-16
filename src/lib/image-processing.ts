// src/lib/image-processing.ts
//
// Nozzle-photo starting point is ported from the web app's
// components/CameraCapture.tsx (MAX_IMAGE_WIDTH/HEIGHT = 1920,
// JPEG_QUALITY = 0.8) — but that fixed formula alone isn't what actually
// keeps web's real output under 100KB (confirmed against a screenshot of
// the actual R2 file listing: every real sample was under 92KB, most in
// the 20-40KB range). A full-resolution modern phone photo, even cropped
// down and capped at 1920px on its long edge, is still enough pixels at
// quality 0.8 to land around 250-300KB — roughly 4x the observed web
// sizes, which matches the ~4x pixel-count difference between a
// 1920-capped crop and web's typical real-world effective resolution
// (evidently well under 1920 in practice — likely closer to 1280 or
// less, going by file size). Rather than guess a single new fixed
// resolution and hope it holds for every possible crop, this now
// actively verifies the result and steps down until it's actually under
// budget — see cropAndOptimizeNozzlePhoto()'s attempt ladder below.
//
// Signature numbers (below) are still NOT ported from web — this source
// file only covers camera-photo capture, not the signature canvas, which
// is presumably a separate component. Still provisional.
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";

const NOZZLE_MAX_WIDTH = 1920;
const NOZZLE_MAX_HEIGHT = 1920;

// 90KB, not 100KB — real margin under the largest observed web sample
// (91.91 KB) rather than a number that could tip over 100KB on a
// borderline image.
const NOZZLE_TARGET_BYTES = 90 * 1024;

// Floor on the long edge — below this the nozzle pattern's fine
// horizontal color-bar lines risk becoming an illegible smear regardless
// of how much more that would save. If an image still can't hit budget
// at this floor, the last attempt's result is used as-is rather than
// degrading further — a slightly-over-budget legible photo beats a
// technically-in-budget useless one.
const NOZZLE_MIN_LONG_EDGE = 640;

// Each entry is tried in order against the SAME original crop (never
// re-compressing a previous JPEG output — that would compound
// generation-loss artifacts on top of shrinking further) until one
// lands at or under NOZZLE_TARGET_BYTES. `scale` multiplies the
// standard 1920-cap ratio; quality drops first (cheaper to legibility
// than shrinking further), then scale starts dropping once quality is
// already near its floor.
const NOZZLE_ATTEMPTS: { quality: number; scale: number }[] = [
  { quality: 0.8, scale: 1 },
  { quality: 0.6, scale: 1 },
  { quality: 0.45, scale: 1 },
  { quality: 0.45, scale: 0.75 },
  { quality: 0.4, scale: 0.6 },
  { quality: 0.4, scale: 0.45 },
];

const SIGNATURE_MAX_WIDTH = 600; // ⚠️ still provisional — see note above

export interface CropRectPixels {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** Crop to exactly the technician-selected rectangle (source-image pixel
 *  coordinates — CropImageScreen is responsible for converting from its
 *  on-screen overlay to these before calling this), then step down
 *  quality/size together until the result is actually under
 *  NOZZLE_TARGET_BYTES — not just under the 1920 dimension ceiling,
 *  which on its own isn't a tight enough bound for a modern phone photo
 *  (see the file-level comment above). Every attempt re-crops from the
 *  ORIGINAL uri rather than re-compressing the previous attempt's
 *  output, so quality never compounds across attempts. */
export async function cropAndOptimizeNozzlePhoto(
  uri: string,
  crop: CropRectPixels
): Promise<string> {
  const baseRatio = Math.min(NOZZLE_MAX_WIDTH / crop.width, NOZZLE_MAX_HEIGHT / crop.height, 1);

  let lastUri = "";
  for (let i = 0; i < NOZZLE_ATTEMPTS.length; i++) {
    const { quality, scale } = NOZZLE_ATTEMPTS[i];
    const ratio = baseRatio * scale;
    let targetWidth = Math.round(crop.width * ratio);
    let targetHeight = Math.round(crop.height * ratio);

    const longEdge = Math.max(targetWidth, targetHeight);
    if (longEdge < NOZZLE_MIN_LONG_EDGE) {
      const floorScale = NOZZLE_MIN_LONG_EDGE / longEdge;
      targetWidth = Math.round(targetWidth * floorScale);
      targetHeight = Math.round(targetHeight * floorScale);
    }

    const result = await manipulateAsync(
      uri,
      [{ crop }, { resize: { width: targetWidth, height: targetHeight } }],
      { compress: quality, format: SaveFormat.JPEG }
    );
    lastUri = result.uri;

    const size = new File(result.uri).size;
    const isLastAttempt = i === NOZZLE_ATTEMPTS.length - 1;
    const atFloor = longEdge <= NOZZLE_MIN_LONG_EDGE;
    if (size <= NOZZLE_TARGET_BYTES || isLastAttempt || atFloor) break;
  }
  return lastUri;
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

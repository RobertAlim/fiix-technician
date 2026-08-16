// src/lib/crop-bridge.ts
//
// Same one-shot-subscription pattern as scan-bridge.ts, for the same
// reason: React Navigation params only flow caller -> screen, not back up
// once CropImageScreen pops itself, so there's no built-in way to return
// the finished crop's uri to MaintenanceFormScreen otherwise.
type CropListener = (uri: string) => void;

let listener: CropListener | null = null;

export function onNextCrop(cb: CropListener) {
  listener = cb;
}

export function emitCrop(uri: string) {
  listener?.(uri);
  listener = null;
}

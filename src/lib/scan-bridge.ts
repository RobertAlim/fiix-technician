// src/lib/scan-bridge.ts
//
// React Navigation params flow down (caller -> ScanQRScreen), not back up
// once the user pops back — there's no built-in "return a value" pattern
// for a stack navigator. This is the standard minimal workaround: a
// one-shot subscription the caller registers right before navigating to
// ScanQRScreen, and ScanQRScreen fires exactly once with the decoded value
// before popping itself. No React state elsewhere needs to know this
// bridge exists.
type ScanListener = (value: string) => void;

let listener: ScanListener | null = null;

export function onNextScan(cb: ScanListener) {
  listener = cb;
}

export function emitScan(value: string) {
  listener?.(value);
  listener = null;
}

// src/lib/relative-time.ts
//
// A tiny local equivalent of date-fns's formatDistanceToNow — not worth
// adding a new dependency for the handful of "X ago" labels the new
// Synchronization panel needs (mirroring web's SyncStatusIndicator.tsx,
// which does use date-fns, but web already had that dependency for
// unrelated reasons this project doesn't share).
export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

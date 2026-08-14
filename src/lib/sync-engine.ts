// src/lib/sync-engine.ts
//
// Mirrors features/offline-sync/sync-engine.ts: drains queued_reports
// against POST /api/maintain-report whenever the app detects it's online
// (see hooks/useOfflineSync.ts, which wires this to NetInfo + a foreground
// re-check, same trigger set the web app's use-connectivity.ts uses).
//
// Photos and the signature are stored as local file:// URIs while offline
// (see MaintenanceFormScreen) and only read off disk + uploaded at sync
// time — never held in memory in the queue, so a large backlog doesn't
// blow up app memory the way base64-in-SQLite would.
import { ApiClient } from "@/lib/api";
import {
  listQueuedReports,
  markSyncing,
  markFailed,
  removeReport,
  QueuedReport,
} from "@/lib/offline-db";

// R2 bucket name the web app's offline-sync pipeline presigns against for
// maintenance photos/signatures — keep in sync with
// features/offline-sync/config.ts on the web repo if that ever changes.
const R2_BUCKET = "fiix-uploads";

/**
 * Presign-then-PUT one local file straight to R2 — same two-step protocol
 * as features/offline-sync/sync-engine.ts's uploadBlob(): the mobile app
 * never gets R2 credentials, only a short-lived signed PUT URL from
 * POST /api/get-upload-url. Returns the object KEY (not the signed URL),
 * which is what /api/maintain's `signPath`/`nozzlePath` fields expect.
 */
async function uploadToR2(
  api: ApiClient,
  localUri: string,
  key: string,
  contentType = "image/jpeg"
): Promise<string> {
  const { url } = await api.post<{ url: string }>("/api/get-upload-url", {
    key,
    contentType,
    bucketName: R2_BUCKET,
  });

  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  const putRes = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!putRes.ok) {
    throw new Error(`R2 upload failed (${putRes.status}) for ${key}`);
  }
  return key;
}

async function syncOne(api: ApiClient, item: QueuedReport): Promise<void> {
  await markSyncing(item.id);
  try {
    const payload = JSON.parse(item.payload);
    const photoUris: string[] = JSON.parse(item.photoLocalUris);

    // nozzlePath is mandatory on the real form (nozzleBlob is non-optional
    // in the web schema) — the first captured photo fills that slot;
    // MaintenanceFormScreen is responsible for enforcing at least one photo
    // exists before this ever queues.
    const [nozzleUri] = photoUris;
    const nozzlePath = nozzleUri
      ? await uploadToR2(api, nozzleUri, `maintain/${item.id}/nozzle.jpg`)
      : undefined;

    const signPath = item.signatureLocalUri
      ? await uploadToR2(api, item.signatureLocalUri, `maintain/${item.id}/signature.png`, "image/png")
      : undefined;

    const { id: mtId } = await api.post<{ id: number }>("/api/maintain", {
      ...payload,
      nozzlePath,
      signPath,
      // Matches maintain.clientUuid (see db/schema.ts) — the route does
      // `.onConflictDoNothing({ target: maintain.clientUuid })` and
      // always resolves + returns the winning row's id either way, so a
      // retry after a lost response is a safe no-op that still yields the
      // same mtId needed for the schedule-link step below.
      clientUuid: item.id,
    });

    // Mirrors features/offline-sync/sync-engine.ts step 4 exactly: link
    // the schedule detail this report was opened from (itinerary tap),
    // if any — scan/manual-entry reports have no schedDetailsId and skip
    // this. POST /api/sched-details is what marks the itinerary row
    // maintained server-side; skipping it would leave a Technician's
    // completed stop still showing as pending, which is the whole reason
    // this step exists rather than being optional. Deliberately NOT
    // caught separately from the block above — if this throws, the catch
    // below marks the report failed (not removed), so the next sync
    // attempt retries from here. The maintain POST is safe to repeat
    // (see clientUuid note above), so this is a safe at-least-once retry
    // rather than a risk of a duplicate report.
    if (item.schedDetailsId != null) {
      await api.post("/api/sched-details", { schedDetailsId: item.schedDetailsId, mtId });
    }

    await removeReport(item.id);
  } catch (err) {
    await markFailed(item.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function drainQueue(api: ApiClient): Promise<{ synced: number; failed: number }> {
  const items = await listQueuedReports();
  let synced = 0;
  let failed = 0;
  for (const item of items) {
    if (item.status === "syncing") continue; // already in-flight from a prior call
    try {
      await syncOne(api, item);
      synced += 1;
    } catch {
      failed += 1;
      // Keep going — one bad report (e.g. a since-deleted printer id)
      // must not block the rest of the queue from syncing.
    }
  }
  return { synced, failed };
}

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

// R2 buckets, checked directly against the real allowlist this round
// (lib/r2.ts's ALLOWED_BUCKETS + features/offline-sync/config.ts's
// per-upload-type mapping) after a "Bucket not allowed" error surfaced —
// the single hardcoded "fiix-uploads" this constant used to hold was
// never actually verified against anything and doesn't match ANY of the
// three real allowed values (env.bucketName, "fiixdrive", "fiixnozzle").
// Web uses a DIFFERENT bucket per upload kind, not one bucket for
// everything — nozzle photos and signatures are genuinely split.
//
// `support` is NEW and is the one value in this map that has NOT been
// verified against lib/r2.ts's real ALLOWED_BUCKETS — that allowlist
// currently contains only env.bucketName, "fiixdrive" and "fiixnozzle".
// A presign request for "fiixsupport" will be rejected with the same
// "Bucket not allowed" error that caught us before until the bucket is
// added there server-side (see the backend spec accompanying this
// delta). Signatures deliberately stay in "fiixdrive" for BOTH kinds of
// work, matching the request and the existing split.
const R2_BUCKETS = {
  nozzle: "fiixnozzle",
  signature: "fiixdrive",
  support: "fiixsupport",
} as const;

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
  bucketName: string,
  contentType = "image/jpeg"
): Promise<string> {
  const { url } = await api.post<{ url: string }>("/api/get-upload-url", {
    key,
    contentType,
    bucketName,
  });

  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  // Same reasoning as the api.ts timeout — an unbounded PUT of an actual
  // file (not a small JSON body) is if anything MORE likely to stall on a
  // weak mobile connection, and was the other half of what let a report
  // get stuck showing "Uploading" forever with no automatic recovery.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  let putRes: Response;
  try {
    putRes = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!putRes.ok) {
    throw new Error(`R2 upload failed (${putRes.status}) for ${key}`);
  }
  return key;
}

/** Same shape a QueuedReport needs, minus the queue-only bookkeeping
 *  fields (status/lastError/attempts) — this is what's needed to
 *  actually SUBMIT a report, whether it's coming straight out of
 *  MaintenanceFormScreen (direct online save) or out of the SQLite
 *  queue (drainQueue). */
export type ReportSubmission = Pick<
  QueuedReport,
  "id" | "kind" | "payload" | "photoLocalUris" | "signatureLocalUri" | "schedDetailsId"
>;

/**
 * The actual "send this report to the server" logic — presign+PUT the
 * nozzle photo and signature to R2, POST /api/maintain, then link the
 * schedule detail if this came from an itinerary tap. Extracted out of
 * syncOne() so MaintenanceFormScreen can call it directly for an
 * online-first save (see saveMaintenance() there) instead of always
 * detouring through the offline queue even when the connection is
 * fine — syncOne() below is now just this plus queue bookkeeping.
 *
 * Safe to call again for the same `id` if a previous attempt partially
 * succeeded (e.g. uploaded the photo, then the /api/maintain POST
 * failed): uploadToR2 PUTs to the same fixed key every time, and
 * /api/maintain's clientUuid onConflictDoNothing means a repeat POST
 * resolves to the same row rather than creating a duplicate.
 */
export async function submitReport(
  api: ApiClient,
  item: ReportSubmission
): Promise<{ mtId: number }> {
  const payload = JSON.parse(item.payload);
  const photoUris: string[] = JSON.parse(item.photoLocalUris);

  // nozzlePath is mandatory on the real form (nozzleBlob is non-optional
  // in the web schema) — the first captured photo fills that slot;
  // MaintenanceFormScreen is responsible for enforcing at least one photo
  // exists before this ever queues.
  const [nozzleUri] = photoUris;
  const nozzlePath = nozzleUri
    ? await uploadToR2(api, nozzleUri, `maintain/${item.id}/nozzle.jpg`, R2_BUCKETS.nozzle)
    : undefined;

  const signPath = item.signatureLocalUri
    ? await uploadToR2(
        api,
        item.signatureLocalUri,
        `maintain/${item.id}/signature.png`,
        R2_BUCKETS.signature,
        "image/png"
      )
    // "Unsigned" — matches features/offline-sync/save-maintenance-
    // report.ts's `signKey ?? "Unsigned"` exactly. This is a real,
    // pervasive sentinel value the web app checks in at least eight
    // places (PDF report rendering, dashboards, the purge tool) — not
    // an edge case being invented here. `maintain.signPath` is a real
    // NOT NULL column in production (confirmed via a live Postgres
    // constraint-violation error, even though the local schema.ts file
    // doesn't currently declare `.notNull()` — see the fix there too),
    // so sending `undefined` here — which JSON.stringify simply drops
    // from the request body entirely — reliably crashed the insert for
    // every report a technician submitted without signing. This isn't
    // a workaround; it's the same real value the rest of the app
    // already treats as the canonical "no signature yet" state.
    : "Unsigned";

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
  // this step exists rather than being optional.
  if (item.schedDetailsId != null) {
    await api.post("/api/sched-details", { schedDetailsId: item.schedDetailsId, mtId });
  }

  return { mtId };
}

/**
 * The support-services equivalent of submitReport(): upload the captured
 * photo to `fiixsupport` and the signature to `fiixdrive`, then POST the
 * completion to /api/support-services/complete.
 *
 * Idempotent under retry for the same reasons submitReport() is, and it
 * matters just as much here: uploadToR2 PUTs to a fixed per-item key, and
 * the completion route is expected to key off `clientUuid` the same way
 * /api/maintain does (see the backend spec — this is a REQUIREMENT of
 * that route, not a nicety, because this queue will happily replay a
 * submission whose response was lost in transit).
 *
 * There is no schedule-linking step: a support service is completed IN
 * PLACE on its own scheduled row (supportServices.id, carried in the
 * payload), so there's no second table to flip a flag in the way
 * /api/sched-details does for maintenance.
 */
async function submitSupportService(
  api: ApiClient,
  item: ReportSubmission
): Promise<void> {
  const payload = JSON.parse(item.payload);
  const photoUris: string[] = JSON.parse(item.photoLocalUris);

  const [photoUri] = photoUris;
  const photoPath = photoUri
    ? await uploadToR2(api, photoUri, `support/${item.id}/photo.jpg`, R2_BUCKETS.support)
    : undefined;

  const signPath = item.signatureLocalUri
    ? await uploadToR2(
        api,
        item.signatureLocalUri,
        `support/${item.id}/signature.png`,
        R2_BUCKETS.signature,
        "image/png"
      )
    // Same "Unsigned" sentinel the maintenance path uses — see the long
    // note in submitReport() above. Reused here rather than sending null
    // so the support table can carry the identical NOT NULL contract
    // without a second convention to remember.
    : "Unsigned";

  await api.post("/api/support-services/complete", {
    ...payload,
    photoPath,
    signPath,
    clientUuid: item.id,
  });
}

async function syncOne(api: ApiClient, item: QueuedReport): Promise<void> {
  await markSyncing(item.id);
  try {
    // Deliberately NOT caught separately inside submitReport — if any
    // step throws, this catch marks the report failed (not removed), so
    // the next drain attempt retries from here rather than losing the
    // report.
    //
    // `kind` is read with a fallback rather than switched on exactly:
    // a row written by an older build of this app predates the column
    // entirely, and while the ALTER TABLE in offline-db.ts backfills
    // 'maintenance' as its default, treating any unrecognized value as
    // maintenance too means a queued report can never become
    // undrainable just because a future kind was added and rolled back.
    if (item.kind === "support") {
      await submitSupportService(api, item);
    } else {
      await submitReport(api, item);
    }
    await removeReport(item.id);
  } catch (err) {
    await markFailed(item.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// Module-level, not per-hook — this is the actual fix for reports getting
// stuck showing "Uploading" indefinitely. useOfflineSync() is called from
// BOTH DashboardScreen (for the itinerary's "Queued" badges) and
// MaintenanceListScreen independently; with a tab navigator keeping both
// mounted at once, that's two fully separate hook instances each running
// their own mount-time drain. `item.status === "syncing"` alone doesn't
// prevent that — it's checked once per drainQueue() CALL, not shared
// across calls, so two overlapping calls can each grab a DIFFERENT
// pending item at the same moment and upload both concurrently. This
// guard makes every call — regardless of how many components ever call
// the hook — share the single actually-running pass instead of starting
// a new one, the same way a mutex would, without needing every caller to
// coordinate with each other.
let activeDrain: Promise<{ synced: number; failed: number }> | null = null;

export async function drainQueue(api: ApiClient): Promise<{ synced: number; failed: number }> {
  if (activeDrain) return activeDrain;
  activeDrain = (async () => {
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
  })();
  try {
    return await activeDrain;
  } finally {
    activeDrain = null;
  }
}

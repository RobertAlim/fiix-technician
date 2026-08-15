// src/lib/offline-db.ts
//
// Mobile equivalent of the web app's features/offline-sync/local-db.ts
// (Dexie/IndexedDB) — same purpose, same shape of queued item, backed by
// expo-sqlite instead since that's the durable on-device store available
// to a React Native app. A maintenance report saved offline here survives
// app restarts and is retried by the sync engine once connectivity is back,
// exactly like the web app's queue.
import * as SQLite from "expo-sqlite";

export interface QueuedReport {
  id: string; // client-generated uuid, becomes the idempotency key server-side
  createdAt: string;
  payload: string; // JSON-encoded maintain report body (see MaintenanceFormScreen)
  photoLocalUris: string; // JSON-encoded string[] of local file:// URIs to upload
  signatureLocalUri: string | null;
  /** Present only when this report was opened from an itinerary row —
   *  mirrors web's schedDetailsId, used after a successful /api/maintain
   *  POST to link the new record back to the schedule via
   *  POST /api/sched-details (see sync-engine.ts). Null for reports
   *  started by scan/manual serial entry, which aren't schedule-linked
   *  on web either. */
  schedDetailsId: number | null;
  status: "pending" | "syncing" | "failed";
  lastError: string | null;
  attempts: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("fiix-offline.db").then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS queued_reports (
          id TEXT PRIMARY KEY NOT NULL,
          createdAt TEXT NOT NULL,
          payload TEXT NOT NULL,
          photoLocalUris TEXT NOT NULL,
          signatureLocalUri TEXT,
          schedDetailsId INTEGER,
          status TEXT NOT NULL DEFAULT 'pending',
          lastError TEXT,
          attempts INTEGER NOT NULL DEFAULT 0
        );
      `);
      // Additive migration for anyone with an existing DB from before
      // schedDetailsId existed — ALTER TABLE ADD COLUMN is a no-op error
      // (not data loss) if the column's already there, which this
      // swallows rather than crashing app startup over.
      await db.execAsync(`ALTER TABLE queued_reports ADD COLUMN schedDetailsId INTEGER;`).catch(() => {});
      // Recovery for reports orphaned in "syncing" — this can only happen
      // from a session that ended (app killed, or the drainQueue
      // concurrency bug fixed alongside this) before the attempt that set
      // it actually finished either way. Nothing can still legitimately
      // be "in flight" at a fresh app start; the in-memory promise that
      // would eventually call markFailed/removeReport died with the
      // previous JS context. Without this, such a row stays "syncing"
      // forever — drainQueue's own `if (status === "syncing") continue`
      // guard means it would never be retried by anything again.
      await db.execAsync(
        `UPDATE queued_reports SET status = 'pending' WHERE status = 'syncing';`
      ).catch(() => {});
      return db;
    });
  }
  return dbPromise;
}

export async function enqueueReport(
  item: Omit<QueuedReport, "status" | "lastError" | "attempts">
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO queued_reports (id, createdAt, payload, photoLocalUris, signatureLocalUri, schedDetailsId, status, lastError, attempts)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, 0)`,
    item.id,
    item.createdAt,
    item.payload,
    item.photoLocalUris,
    item.signatureLocalUri,
    item.schedDetailsId
  );
}

export async function listQueuedReports(): Promise<QueuedReport[]> {
  const db = await getDb();
  return db.getAllAsync<QueuedReport>(
    `SELECT * FROM queued_reports ORDER BY createdAt ASC`
  );
}

export async function markSyncing(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE queued_reports SET status = 'syncing' WHERE id = ?`, id);
}

export async function markFailed(id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE queued_reports SET status = 'failed', lastError = ?, attempts = attempts + 1 WHERE id = ?`,
    error,
    id
  );
}

export async function removeReport(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM queued_reports WHERE id = ?`, id);
}

export async function resetToPending(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE queued_reports SET status = 'pending' WHERE id = ?`, id);
}

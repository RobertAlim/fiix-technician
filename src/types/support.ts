// src/types/support.ts
//
// Shared shapes for the Support Services workflow — the non-maintenance
// half of a technician's scheduled work (BIR 2307 forms, collection,
// billing, contracts, etc). Kept in its own module rather than inside a
// screen because three separate places consume them: DashboardScreen
// (the Support Services section of the itinerary), SupportServiceForm-
// Screen (the documentation form), and sync-engine.ts (the offline
// submission payload).
//
// ⚠️ API CONTRACT — these mirror endpoints that DO NOT EXIST YET on the
// Fiix web app. See the accompanying backend spec for the exact tables,
// routes and response shapes these are written against. If the real
// implementation differs, this file is the single place to reconcile.

/** GET /api/dropdown/support-service-types
 *  Same {value,label} convention every other dropdown route in this app
 *  uses (see /api/dropdown/status and /api/dropdown/parts) — `value` is
 *  CAST(id AS TEXT), a string, not a number. */
export interface SupportServiceTypeOption {
  value: string;
  label: string;
}

/** One scheduled support activity assigned to this technician for a
 *  given day. This is the row a Scheduler creates; the technician
 *  completes it in place rather than creating a second record, which is
 *  what keeps a support activity visible as "assigned work" whether or
 *  not it's been done yet. */
export interface SupportServiceRow {
  id: number;
  clientId: number;
  client: string;
  locationId: number;
  location: string;
  supportServiceTypeId: number;
  supportServiceType: string;
  /** Written by the Scheduler when assigning the activity — read-only to
   *  the technician (mirrors how schedules.notes works on the printer
   *  side). */
  notes: string | null;
  /** null while still outstanding. Non-null means it's already been
   *  documented and is locked, same role isMaintained plays for a
   *  scheduleDetail. */
  status: SupportServiceStatus | null;
  completedAt: string | null;
  /** From locationGeofences, same source as the printer itinerary's
   *  coordinates — null when the location has no pin configured yet, in
   *  which case the client hides the navigate affordance rather than
   *  linking to (0, 0). */
  latitude: number | null;
  longitude: number | null;
}

export type SupportServiceStatus = "Achieved" | "Not Achieved";

export const SUPPORT_SERVICE_STATUSES: SupportServiceStatus[] = ["Achieved", "Not Achieved"];

/** Body of POST /api/support-services/complete, built by
 *  SupportServiceFormScreen and replayed verbatim by sync-engine.ts on
 *  every retry. `photoPath`/`signPath` are filled in by the sync engine
 *  after the R2 uploads succeed, not by the form.
 *
 *  Exactly ONE of `supportServiceId`/`scheduleId` is set, matching the
 *  backend's exactly-one-of validation:
 *   - `supportServiceId`: completing a Scheduler-created Support Service
 *     row that already exists.
 *   - `scheduleId`: documenting a printer-less `schedules` row for the
 *     FIRST time — the "a Schedule was set for a client but no printer
 *     itinerary selected" case. No supportServices row exists yet; the
 *     backend creates one and links it back via scheduleId. */
export interface SupportServiceSubmission {
  supportServiceId?: number;
  scheduleId?: number;
  supportServiceTypeId: number;
  clientId: number;
  locationId: number;
  technicianId: number;
  signatoryId: number;
  status: SupportServiceStatus;
  notes: string;
  gps: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    heading: number | null;
    speed: number | null;
    capturedAt: string;
    gpsProvider: string;
    isMockLocation: boolean;
  };
}

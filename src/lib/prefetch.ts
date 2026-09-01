// src/lib/prefetch.ts
//
// The actual answer to "technicians should be able to continue working
// with their assigned itineraries and maintenance tasks offline" beyond
// just the itinerary LIST staying visible. The itinerary list
// (GET /api/schedule, GET /api/support-services) tells a technician
// WHAT to do today — it doesn't contain the per-printer detail
// (signatories, print-count baseline, deployment info) or per-support-
// service detail that MaintenanceFormScreen / SupportServiceFormScreen
// each fetch separately when opened. Without this, a technician who
// loses signal mid-route could still SEE today's stops but couldn't
// actually OPEN the form for any printer they hadn't already tapped
// into while still online — the itinerary would look complete while
// the actual work was silently blocked.
//
// This walks today's schedule + support services (already fetched by
// DashboardScreen) and warms the cache for every form the technician
// might open, while still online, so by the time connectivity drops
// none of that is a live network dependency anymore. Combined with the
// AsyncStorage query persister (App.tsx), this survives an app restart
// too, not just staying-in-foreground.
import { QueryClient } from "@tanstack/react-query";
import { ApiClient } from "@/lib/api";

interface PrefetchScheduleDetail {
  printer: { serialNo: string };
}
interface PrefetchSchedule {
  clientId: number;
  locationId: number;
  scheduleDetails: PrefetchScheduleDetail[];
}
interface PrefetchSupportService {
  id: number;
}

/**
 * Fire-and-forget-safe: every individual prefetch swallows its own
 * failure (react-query's `prefetchQuery` already does this internally —
 * a failed prefetch lands in that query's cached error state rather
 * than throwing), so one printer with no history yet, or one transient
 * 500, can't abort prefetching the rest of the day's work. Callers
 * don't need to wrap this in its own try/catch for that reason, but the
 * returned promise is still awaited-and-caught defensively in case a
 * queryFn setup itself throws synchronously before react-query gets a
 * chance to catch it.
 */
export async function prefetchTodaysWork(
  queryClient: QueryClient,
  api: ApiClient,
  schedules: PrefetchSchedule[],
  supportServices: PrefetchSupportService[]
): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  // Shared reference data — small, and needed by EVERY form regardless
  // of which printer or support service it's for, so it's always worth
  // keeping warm rather than gating it on today's specific stop list.
  tasks.push(
    queryClient.prefetchQuery({ queryKey: ["user-status"], queryFn: () => api.get("/api/user-status") }),
    queryClient.prefetchQuery({
      queryKey: ["dropdown-status"],
      queryFn: () => api.get("/api/dropdown/status"),
    }),
    queryClient.prefetchQuery({ queryKey: ["dropdown-parts"], queryFn: () => api.get("/api/dropdown/parts") }),
    queryClient.prefetchQuery({
      queryKey: ["dropdown-support-service-types"],
      queryFn: () => api.get("/api/dropdown/support-service-types"),
    })
  );

  // De-duplicated: the same printer can legitimately appear more than
  // once today (a client with several units due the same visit), and
  // prefetching its detail twice would just be a wasted request — the
  // Set collapses that before any network call is made.
  const serials = new Set<string>();
  for (const schedule of schedules) {
    for (const detail of schedule.scheduleDetails) {
      serials.add(detail.printer.serialNo);
    }
  }

  for (const serialNo of serials) {
    tasks.push(
      // Matches MaintenanceFormScreen's exact queryKey/path — this has
      // to warm the SAME cache entry the form itself will read, not a
      // parallel one, or the form would still hit the network when
      // opened.
      queryClient.prefetchQuery({
        queryKey: ["printer-lookup", serialNo],
        queryFn: () => api.get(`/api/maintain?serialNo=${encodeURIComponent(serialNo)}`),
      }),
      // History isn't required to COMPLETE a maintenance report, but the
      // history icon is one tap away from every printer row and is
      // "assigned work" information in its own right — a technician
      // deciding whether a printer needs escalating benefits from
      // seeing what was tried last time, offline or not.
      queryClient.prefetchQuery({
        queryKey: ["printer-history", serialNo],
        queryFn: () => api.get(`/api/printer-history?serialNo=${encodeURIComponent(serialNo)}`),
      })
    );
  }

  for (const row of supportServices) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: ["support-service", row.id],
        queryFn: () => api.get(`/api/support-services/${row.id}`),
      })
    );
  }

  // Printer-less schedules — the "documented as a Support Service"
  // workflow SupportServiceFormScreen's scheduleId branch uses. There's
  // no per-schedule detail endpoint to warm (client/location/notes are
  // already on the schedule row DashboardScreen passes as nav params),
  // but signatories ARE a live fetch that screen makes
  // (GET /api/signatories?clientId=&locationId=) — same queryKey shape
  // it uses, so this warms the exact cache entry the form will read.
  const noPrinterClientLocationPairs = new Set<string>();
  for (const schedule of schedules) {
    if (schedule.scheduleDetails.length > 0) continue;
    noPrinterClientLocationPairs.add(`${schedule.clientId}:${schedule.locationId}`);
  }
  for (const pair of noPrinterClientLocationPairs) {
    const [clientId, locationId] = pair.split(":");
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: ["signatories", Number(clientId), Number(locationId)],
        queryFn: () => api.get(`/api/signatories?clientId=${clientId}&locationId=${locationId}`),
      })
    );
  }

  await Promise.allSettled(tasks);
}

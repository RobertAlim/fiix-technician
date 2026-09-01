# delta-010 — Printer History field name fix (pairs with the web backend delta)

Copy `src/` over the same path in the project root. One file.

## Modified files
| Path | Change |
| --- | --- |
| `src/screens/PrinterHistoryScreen.tsx` | `HistoryRecord.clientAtMaintenance` → `client`/`location`, matching the real `GET /api/printer-history` response (built this session against the actual web repo) |

## Why

The web backend route didn't exist until this session — I'd originally
guessed at its response shape. Now that it's built (see
`delta-web-001-support-services-and-fixes` for the web repo), its real
field names match your existing `PrinterHistoryDialog.tsx` web
component (`client`/`location`), not the `clientAtMaintenance` name I'd
invented. This delta is the one-line mobile-side correction — apply it
together with the web delta.

[← Back to Documentation Home](../index.md)

# Debug Logs

Command **Salesforce Multitool: Open Debug Logs** opens a webview panel (`DebugLogWebviewPanel`) with the React app
in `client/src/components/debugLogFetcher`.

## Capabilities

- List the latest 200 ApexLogs, filter by user (typeahead) and by size (above / below N bytes).
- Download a log into `<workspace>/.sfdx/_multi-tool/debug-logs/<org host>/<logId>.log` and open it; repeat opens use the
  cached copy.
- Method name column: the entry point (class.method, trigger, flow) parsed from the first 10 KB of the body (50 KB when
  the log is already stored). Lookups are LRU-cached and limited to 5 concurrent requests.
- Delete one log, all logs, or all logs of one user (pages through every match, 200 per request). Bulk delete also
  removes the cached local copies. The webview asks for confirmation first.
- Start / stop logging (TraceFlag) for a user, with a **debug level picker**.

## Debug level when starting logging

The picker next to the start button lists **"Default (Multitools)"** plus the org's existing `DebugLevel` records
(label shown, developer name as tooltip). The selection is remembered in webview state across sessions; a saved level
that no longer exists falls back to the default.

Flow: `LogToolbar` → `useDebugLevels` / `useTraceFlags.start(user, level)` → `api.startTraceFlag(userId, debugLevelId?)`
→ `POST /api/traceFlags/start` → `DebugLogService.createTraceFlag(userId, debugLevelId?)`.

- `GET /api/debugLevels` → `DebugLogService.listDebugLevels()` (tooling query, max 200, ordered by label; the managed
  default level is excluded).
- `debugLevelId` is optional; absent / `null` / `''` means the managed default level, which is found or created
  (`SF_Multitools_Debug_v2`). A malformed id is a `BAD_REQUEST` and never reaches Salesforce.
- Active flags report their level: `searchUsers` selects `DebugLevel.DeveloperName` and returns `TraceFlagDebugLevel`;
  the UI shows it in the toolbar and the user dropdown.
- Rejected on purpose: starting logging for a user that already has an active flag.

Verified against a real developer org (flag created with the chosen level, correct user, `USER_DEBUG`, 60 min, reported
back by the service, cleaned up) using `scripts/dev/org-check.js`. Not yet seen end to end in a real VS Code window.

## Where things live

| Concern              | File                                     |
| -------------------- | ---------------------------------------- |
| Routes + validation  | `src/rpc/routes.ts`                      |
| Org operations       | `src/services/debugLogService.ts`        |
| Streaming log bodies | `src/services/logBodyClient.ts`          |
| Local cache          | `src/services/logStorage.ts`             |
| Log parsing          | `src/services/apexLogParser.ts`          |
| UI                   | `client/src/components/debugLogFetcher/` |
| API client + types   | `client/src/api/`                        |

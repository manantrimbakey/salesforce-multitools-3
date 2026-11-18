# Review follow-up

- [x] Phase 1 security: random token removed with Express, SOQL/id/path validation, nonce CSP
- [x] Phase 2 bugs: config namespace, logger errors, org resolution, watcher, bulk delete, subfolder component folder, CustomObject name
- [x] Phase 3 architecture/perf: postMessage RPC, lazy sfcore, connection de-dup, polling, debounced switcher, virtualized client
- [x] Phase 4 cleanup: dead code removed, esbuild.js simplified, eslint/tsconfig stricter, deps pruned

## Review

- tsc, eslint, unit tests (23), client build and production bundle all pass; bundle loads under a vscode stub.
- NOT verified inside a real VS Code host / org: webview rendering, RPC round trips, lazy chunk loading under CSP.

# Review round 2

- [x] pnpm: `allowBuilds` fixed (root + client), `pnpm run` scripts work again
- [x] Security: `isInsideWorkspace` resolves symlinks (async), CSP `img-src` no longer allows `https:`
- [x] Debug level: lighter defaults, versioned name (`SF_Multitools_Debug_v2`)
- [x] Bulk delete removes local cached copies of deleted logs (UI already confirms before delete)
- [x] Trace flag stop: only `traceFlagId` required
- [x] esbuild: `@salesforce/core` split into `dist/sfcore.js`; `extension.js` 2.1 MB -> 52 KB
- [x] `.vscodeignore` stale `scripts/**` removed; `tasks/lessons.md` added
- [x] Webview blank (vendor chunk cycle) fixed and verified in Chrome with CSP + mocked VS Code API
- [ ] F5 walkthrough in a real VS Code host + org (sidebar, debug log panel, download, delete, bulk delete, trace flags, file browse, lazy sfcore load)
- [ ] Move pure unit tests off `vscode-test` (mocha 10 breaks on Node 26)
- [ ] Multi-root workspaces (`workspaceFolders[0]` assumed)
- [ ] `logBodyClient` uses raw `https.get`: check behind a proxy
- [ ] Split `lastModifiedDetails/commands.ts` (501 lines, module-level state); collapse CodeLens selector list
- [ ] Commit in logical chunks (tooling, rpc/services, client)

Verified: tsc, eslint, 26 unit tests (node:test + vscode stub), client build, production bundle, `dist/sfcore.js` loads with the logger env.

# Feature: choose debug level when starting logging for a user

Design: picker lists the org's existing DebugLevel records plus a built-in default (managed `SF_Multitools_Debug_v2`, created on demand). Sits next to the start button; selection remembered in webview state.

- [x] Service: `listDebugLevels()`, `createTraceFlag(userId, debugLevelId?)`, active trace flag also reports its debug level name
- [x] RPC: `GET /api/debugLevels`; `POST /api/traceFlags/start` accepts optional validated `debugLevelId`
- [x] Client: types + api, `useDebugLevels` hook (load once, persisted selection), `DebugLevelSelect` next to start button, show level for active flags
- [x] Tests: route validation for `debugLevelId`; tsc/eslint/client build; browser smoke test with mocked bridge

Verified: tsc, eslint, 28 unit tests, client build, Chrome smoke test with mocked host (picker lists default + org levels, start posts the chosen `debugLevelId`).
Org check (4rst dev edition, real service code + independent `sf` queries): listDebugLevels, createTraceFlag with a chosen level, TraceFlag row correct (user, USER_DEBUG, level, ~60 min expiry), searchUsers reports level, duplicate rejected, deleteTraceFlag cleans up. Throwaway flag deleted afterwards.

# Project knowledge for future sessions

- [x] `CLAUDE.md` (commands, architecture, rules, verification) + `docs/development/{building,gotchas}.md` + `docs/features/debug-logs.md`; overview and index updated
- [x] `scripts/dev/`: `run-unit-tests.sh` + `vscode-stub.js`, `webview-harness.js`, `org-check.js` (all run once successfully; org-check is opt-in and writes to the org)
- [ ] Fix the docs index: it still links pages that do not exist (getting-started, configuration, tech-stack, component-structure, communication-flow, setup, contributing)
- [x] Line endings: LF everywhere (`.gitattributes`, `.editorconfig`, `.prettierrc`, hook, 10 CRLF files converted)

# Feature: compare permission set / profile (branch vs org, org vs org, branch vs branch)

Status: implemented on branch `feature/permission-compare`, NOT committed (user commits). Decisions: fast-xml-parser, core+extra sections, skip-one-sided toggle.

## Design

- Each side of a compare is a `Source`: `{ kind: 'org', username }` or `{ kind: 'branch', ref }`. Both load into one normalized model
  `PermissionModel` (sets of keyed entries per section), so any pairing = load A, load B, diff. Diff is pure, unit-tested.
- **Org side (SOQL, full permissions)**: SF CLI retrieve of a Profile/PermissionSet returns only what is in the retrieved package, so
  query the real rows via Tooling/REST API instead:
    - PermissionSet / Profile row: `PermissionSet` where `Name` (or `Profile.Name` + `IsOwnedByProfile = true` for profiles)
    - `ObjectPermissions` (ParentId = permset id): Create/Read/Edit/Delete/ViewAll/ModifyAll per object
    - `FieldPermissions`: Read/Edit per `Field` (`Object.Field`)
    - `SetupEntityAccess` joined to `SetupEntityType`: Apex classes, VF pages, custom permissions, flows, external data sources, etc.
    - `PermissionSetTabSetting`: tab visibility; `PermissionSetAssignment` not compared
    - System/user permissions: `PermissionSet` boolean `Permissions*` fields (describe the sobject, read all `Permissions*` columns)
    - Record types / app visibility: via metadata read if SOQL cannot express it (list as known gap, see open questions)
    - Pagination via `queryMore`; chunk large `IN` lists; all inputs through `soqlEscape` / `isSalesforceId`.
- **Branch side (git)**: detect repo (`git rev-parse --show-toplevel` from workspace; absent => branch options hidden with a hint).
  List refs (`git for-each-ref` heads + remotes + tags), find `*.permissionset-meta.xml` / `*.profile-meta.xml` under the sfdx package
  dirs (`sfdx-project.json` `packageDirectories`), read with `git show <ref>:<path>` (never checkout, never touches working tree),
  parse XML into the same `PermissionModel`. Refs and paths validated (`git check-ref-format`-style allow-list, `execFile` with args array,
  `--` separators, no shell).
- **Multi-org**: `SFUtils.getConnection()` only knows the default org. Add `SFUtils.getConnectionFor(username)` (cached per username,
  invalidated on `refresh()`), plus `listAuthorizedOrgs()` via `StateAggregator`/`AuthInfo.listAllAuthorizations` (lazy core, same rules).
- **Routes** (all validated, in `src/rpc/routes.ts`): `GET /api/compare/orgs`, `GET /api/compare/git`, `GET /api/compare/refs`,
  `GET /api/compare/items?source=...&type=permissionset|profile`, `POST /api/compare/run`.
- **UI**: new command `salesforce-multitools-3.openPermissionCompare` + webview panel (same pattern as debug logs), component
  `client/src/components/permissionCompare`: two source pickers (type + org/ref), item picker (permset/profile), Compare button, result
  grouped by section with added / removed / changed, "only differences" toggle, filter box. No network from webview (CSP unchanged).
- Services: `src/services/permissionCompare/{types,orgLoader,gitLoader,xmlParser,diff}.ts`.

## Tasks

- [x] Decide open questions below
- [x] `PermissionModel` types + `diff` (+ tests)
- [x] Git: repo detection, refs, file listing, `git show` loader, XML -> model (+ tests with fixture XML and a temp git repo)
- [x] `SFUtils.getConnectionFor` + authorized org listing
- [x] Org loader (SOQL) -> model (+ tests with mocked connection)
- [x] Routes + validation + route tests
- [x] Webview UI + command + `package.json` contribution + harness mock
- [x] Docs (`docs/features/permission-compare.md`), `CHANGELOG.md` `[Unreleased]` Features
- [x] Verify: tsc, eslint, unit tests, client build, harness in Chrome, `org-check`-style real-org run on 4rst (read-only), F5 listed as unverified

## Open questions

1. XML parsing for the branch side: add `fast-xml-parser` (small, no deps) vs hand-rolled regex parser (fragile).
2. v1 scope of sections (object, field, system perms, Apex class, VF page, custom perm, tab, flow, record type, app visibility).
3. Branch vs org: org side is full SOQL data, branch side is whatever the XML contains; sections the repo XML lacks will show as
   "only in org". Offer a "compare only sections present on both sides" toggle (default on)?

## Review (permission compare)

- tsc, eslint (ext + client), 46 unit tests (incl. temp git repo, fake org, route validation), client build, esbuild all pass.
- Chrome harness (`?c=permissionCompare`): pickers, auto-match, compare, chips and one-sided toggle render and work.
- Real org (4rst, dummy sets `ZZ_Compare_A/B`, deleted afterwards): org vs org diffs correct; deployed XML vs SOQL view equal for both sets;
  profile vs profile loads (207 diffs, ~1 s). Real run caught SetupEntityType `FlowDefinition` (not `Flow`) and that EntityDefinition hides
  some custom settings (Tooling `CustomObject` fallback).
- NOT verified: F5 in a real VS Code host (command, panel, RPC under CSP), branch-vs-branch in a real project (only a temp repo in tests),
  record types / layouts / login hours (not compared), very large profiles (field permission volume).

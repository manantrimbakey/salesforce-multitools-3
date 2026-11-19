# Salesforce Multitools (VS Code extension)

VS Code extension for Salesforce dev: LWC/Aura file switcher, last-modified CodeLens/status bar, debug log viewer
with trace flag control. Extension host in `src/` (TypeScript, esbuild), webview UI in `client/` (React 19 + MUI 7 + Vite).
Publisher `manantrimbakey`, extension id `salesforce-multitools-3`, VS Code `^1.90`.

Read before working: `tasks/lessons.md` (mistakes already made once), `tasks/todo.md` (open items, current plan).

## How the owner wants work done

The owner tests the extension on real orgs and reports what breaks, so most of the value is in catching those cases first.

- **Think through real-life scenarios before saying "done".** Bugs reported so far were all situations the happy path hid: the typed
  text wiped on blur, a permission set that does not exist in the other org (raw error instead of a clear message), a whole
  permission type missing from the compare. For every new feature ask: what if the item is missing / deleted / still updating, the
  API call is not permitted, the list is empty or huge, the other side has no such section? Handle it with a plain-language message
  or a warning, never a raw error and never a silent gap. When asked "did you handle errors?", audit the new code honestly and
  fix the gaps rather than just answering yes.
- **Completeness is checked against sources, not memory.** For "are we missing anything" questions enumerate from the real thing
  (Metadata API type fields, `SetupEntityAccess` types actually present in an org, SOQL child tables of `PermissionSet`, the Salesforce
  docs) and list what is still not covered and why.
- **Work autonomously, report honestly.** Short, typo-heavy messages mean "work out the intent and do it". Do the obvious next steps
  (tests, docs, CHANGELOG, README/GIF, error handling) without being asked, then say plainly what was verified and what was not
  (real VS Code host, F5, orgs not tried). Do not claim more than was run.
- **Keep the owner informed during long runs**: a one-line status of what is being done and what comes next, especially while waiting
  on orgs, builds or the browser.
- **Respect blocks.** If a tool is denied or a safety check refuses a command (e.g. a broad `rm`), do not work around it: say what was
  wanted and let the owner decide. If the Chrome extension is not connected, tell the owner what to check (Chrome open, same account,
  Developer mode if unpacked) instead of retrying in a loop.
- **A UI change is not finished until** the harness was exercised in a browser, `docs/features/*`, `CHANGELOG.md` (user-visible words
  only) and, when the look changed, the README GIF are updated. Offer useful companions (export, clear hints) when a feature produces
  data or can fail in a confusing way.
- **Git**: leave work uncommitted until told. "Commit, PR and merge" is one request that covers the whole `dev2` then `dev1` flow
  below. New work starts on a fresh branch off `dev2`.
- **Answers are terse** (the global caveman mode applies to chat; code, commits, docs and PRs are written normally).

## Project state

Public open-source repo, extension on the VS Code Marketplace (0.8.0 shipped with permission compare); Open VSX is behind and waiting on
Eclipse staff, so do not promise Open VSX releases. Permission compare is the active feature area (types: org / branch / working tree
sources; permission sets, profiles, permission set groups; export; warnings). Next candidates live in `tasks/todo.md`.

## Commands

Node comes from nvm (no `node`/`pnpm` on a bare PATH). Package manager is **pnpm 11** (corepack). Root `pnpm install`
also installs `client/` (postinstall).

| Task                                                    | Command                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Type check / lint (extension)                           | `pnpm run check-types`, `pnpm run lint`                                              |
| Client type check / lint                                | `cd client && npx tsc --noEmit -p tsconfig.app.json && npx eslint .`                 |
| Build webview                                           | `pnpm run build:client` (writes `dist/webview`, must run before F5 / packaging)      |
| Build extension                                         | `node esbuild.js` (writes `dist/extension.js` + `dist/sfcore.js`)                    |
| Full package                                            | `pnpm run package`                                                                   |
| Release (Marketplace + Open VSX + tag + GitHub release) | `pnpm run release` (dry run), `pnpm run release -- --yes` to publish                 |
| Unit tests (fast, no VS Code)                           | `bash scripts/dev/run-unit-tests.sh`                                                 |
| Full tests                                              | `pnpm test` (vscode-test: downloads VS Code, needed for `extension.test.ts`)         |
| Webview in a browser                                    | `node scripts/dev/webview-harness.js` then open `/harness.html`                      |
| Real-org check (writes!)                                | `node scripts/dev/org-check.js <alias> <projectDir> --yes`                           |
| Permission compare vs a real org (read-only SOQL)       | `pnpm run compile-tests` then `node scripts/dev/permission-compare-check.js ...`     |
| Move Dependabot PRs to `dev2`                           | `bash scripts/dev/retarget-dependabot-prs.sh --apply` (omit `--apply` for a dry run) |

F5 ("Run Extension") runs the `watch` task: `build:client` once, then `watch:tsc` + `watch:esbuild`. Client edits need a
rebuild (`pnpm run build:client`, or `pnpm run watch:client`) then **Developer: Reload Window** in the dev host.
Details: `docs/development/building.md`.
Publishing to the Marketplace (version, PAT, `vsce`): `docs/development/publishing.md`. `vsce` is installed globally
(`npm i -g @vscode/vsce`), not a project dependency. Claude has no Marketplace
credentials, so the user runs `vsce publish` themselves.

## Architecture (short)

- No HTTP server. Webviews call `window.callServerApi(endpoint, method, data)` (postMessage RPC, bridge injected by
  `src/utils/webview.ts`). Host side: `src/rpc/{router,routes,attachRpc}.ts`. Routes are thin, work lives in `src/services/*`.
- `@salesforce/core` is built into its own file `dist/sfcore.js` and loaded lazily with `require` in
  `src/utils/sfutils.ts` (keeps activation at ~280 KB instead of ~2 MB; `fast-xml-parser` is bundled into `extension.js`, 50 KB before it). One shared connection, resolved from
  `.sf/config.json` / `.sfdx/sfdx-config.json` (`target-org`, `defaultusername`) then the global config.
- Debug logs: `DebugLogService` (list/delete/trace flags/debug levels), `LogStorage` (cache in
  `<workspace>/.sfdx/_multi-tool/debug-logs/<org>/`), `logBodyClient` (streamed bodies).
- Webview: `client/src/components/{mainBody,componentFileSwitcher,debugLogFetcher}`, typed API in `client/src/api`.
- Activates only when the workspace has `.sfdx/sfdx-config.json` or `.sf/config.json`.
- Config namespace is `salesforceMultitools-3` (settings) while command ids are `salesforce-multitools-3.*`. Easy to mix up.
- Permission compare: `src/services/permissionCompare/` (org via SOQL, branch via `git show` + `fast-xml-parser`, normalize + diff are
  pure), routes `/api/compare/*` (`context`, `items`, `run`, `export`), UI `client/src/components/permissionCompare`. Items are
  permission sets, profiles and permission set groups. Things that took real-org checking to get right:
    - SOQL cannot return everything: record type visibility, profile page layout assignments and the profile default app come
      from a Metadata API `read` (`connection.metadata.read`; standard profiles need their API name, `System Administrator` is
      `Admin`). Failures there become `warnings` on the model, never a silent gap and never a failed compare.
    - Connected apps / external client apps / external credential principals are `SetupEntityAccess` types
      (`ConnectedApplication`, `ExternalClientApplication`, `ExternalCredentialParameter`). Principals resolve through the
      **Tooling** API to `<ExternalCredential>-<Principal>`. Profile metadata XML has no principals, and no XML has connected apps.
    - A permission set group's effective permissions are the calculated hidden `PermissionSet` row (`PermissionSetGroupId`),
      muting already applied, and only when the group `Status` is `Updated`. On a branch they are the member XMLs merged minus
      the `*.mutingpermissionset-meta.xml` files (`permissionGroup.ts`). `grantedBy` says which member grants each permission.
    - Typed text in the item picker must survive blur (`clearOnBlur={false}` + own `inputValue`); say when the item does not exist
      in the chosen org / ref instead of failing.
    - Exports are built on the host (`exportFormat.ts`, pure and tested), the webview only sends the shown entries; CSV cells that
      start with `= + - @` are defused.

More: `docs/architecture/overview.md`, `docs/features/debug-logs.md`, `docs/features/permission-compare.md`.

## Rules that are easy to break

1. **Webview input is untrusted.** Validate ids with `isSalesforceId`, escape SOQL with `soqlEscape` / `soqlLikeEscape`,
   check paths with `isInsideWorkspace` (async, resolves symlinks). New routes go in `src/rpc/routes.ts` with validation
   and a test in `src/test/`.
2. **CSP stays strict**: nonce scripts, `connect-src 'none'`, no remote images. Do not add network access to the webview.
3. **Keep `@salesforce/core` lazy.** Use `require('@salesforce/core')` in `sfutils.ts`, never `import()` (see gotchas) and
   never a static value import elsewhere (type-only imports are fine).
4. **One vendor chunk** in `client/vite.config.ts`. Do not split react/mui/emotion into separate chunks.
5. **Line endings**: everything is LF (`.gitattributes` `eol=lf`, `.editorconfig`, `.prettierrc` `endOfLine: lf`). Never
   commit CRLF or whole-file line-ending churn. Check with
   `git diff --stat` and `git diff --ignore-cr-at-eol --stat`.
6. Do not run `git stash` to inspect state (it unstages). Use `git status` / `git diff`.
7. Org-writing checks (trace flags, deletes, deploying dummy metadata) only on orgs the user owns and named, and only when
   they allow it; clean up what you create and verify it is gone. **`4rst` is the user's test org and is allowed for writes**
   (test data like `Compare_Test_PS`, `Compare_Test_PS2`, `Compare_Test_Mute`, `Compare_Test_PSG`, `Compare_Test_RT` lives there on
   purpose and may stay). Every other org (e.g. `sgdev`) is read-only: SOQL and retrieve only. Seed test metadata from a scratch
   sfdx project outside the repo and check `sf project deploy report` for component failures.
8. **Do not commit unless told**, and never add yourself as author: no `Co-Authored-By` trailer on commits and no
   "Generated with Claude Code" footer on PRs. The user is the author; this overrides default attribution. Commit with the
   repo git identity (see `tasks/lessons.md`), after the user says so. Never commit generated output (`out/`, `dist/`).
9. Verify SOQL / metadata assumptions against a real org before trusting them (`SetupEntityAccess.SetupEntityType` is
   `FlowDefinition` / `TabSet` / `CustomEntityDefinition`, not SObject names; `EntityDefinition` hides some custom settings).

## Branches and release flow

Work lands on **`dev2`**, is promoted **`dev2` -> `dev1` -> `master`**, in that order. Never skip a stage, never commit
or merge straight into `dev1` or `master` from a feature branch, and never push or open PRs unless asked. Feature work: branch off `dev2`, PR into `dev2`, delete the branch after the
merge (local and remote). Merge a PR only when asked. Check where a
change stands with `git rev-list --count origin/dev1..origin/dev2` and `git rev-list --count origin/master..origin/dev1`.
(`dev_new` and `dev_log_viewer` are old feature branches kept for history.) `master` is what users see on GitHub.
When the user says "commit, PR and merge to dev1": commit on a feature branch off `dev2`, PR into `dev2`, merge (merge commit,
`--delete-branch`), then PR `dev2` -> `dev1` and merge it. Both PRs are covered by that one request; `master` still is not.
Dependabot security-update PRs always target `master` (GitHub ignores `target-branch` for them); run
`scripts/dev/retarget-dependabot-prs.sh --apply` to move them to `dev2`. `master` has a ruleset requiring a review, so
merging into it needs the owner's admin bypass; do not use `--admin` or edit rulesets unless asked.

## Verification before calling something done

`tsc` + `eslint` + unit tests are necessary, not sufficient. Webview changes: build and run the harness in a browser
(catches blank-page crashes and CSP issues; `harness.html?c=<component>` picks the component). Org-facing changes: run
`org-check.js` (debug logs) or `permission-compare-check.js` (permission compare) against a dev org. Anything not
exercised in a real VS Code host (F5) must be listed as unverified. Open items live in `tasks/todo.md`.

Test against a real org with the user's allowed org (`4rst`) and compare retrieved XML with the org view: they must give no
diff (apart from things XML cannot hold, such as connected apps). Do not judge profile XML from a plain retrieve, it is partial.

## README GIFs

`asset/*.gif` are embedded in the README and shown on the Marketplace. After a visible UI change, refresh the one for that
feature: build (`pnpm run build:client`), start `node scripts/dev/webview-harness.js 8767` (extend its mock answers for the new UI
state), record in Chrome with the Claude extension (`gif_creator`; the extension must be connected, Chrome open, same account),
export, then shrink with ImageMagick (`gifsicle` is not installed):
`magick in.gif -coalesce -resize 1200x -fuzz 2% +dither -colors 96 -layers OptimizeTransparency -loop 0 out.gif` (3 MB -> ~0.4 MB,
check a `-coalesce`d frame for legibility; a single un-coalesced frame looks broken because it is only a delta). The harness
shows canned data in a plain browser look, not the VS Code theme. Stop the harness by PID (`kill <pid>`), never `pkill -f`.

## Conventions

- 4-space indent, single quotes, 120 cols (see `.prettierrc`), strict TypeScript, ESLint flat config.
- Services/pure logic get unit tests (`src/test/*.test.ts`, mocha TDD style: `suite`/`test`). Pure tests must not need
  VS Code beyond what `scripts/dev/vscode-stub.js` provides. `run-unit-tests.sh` compiles to a temp dir, so runtime
  dependencies resolve through `NODE_PATH` (already set in the script).
- A pre-commit hook (`.githooks/pre-commit`, wired by `pnpm install` via `core.hooksPath`) formats staged files with
  `prettier --end-of-line lf` and skips files with unstaged hunks. Bypass: `git commit --no-verify`.
- User-visible changes go in `CHANGELOG.md` under `[Unreleased]`, in plain language, grouped as Features / Optimizations / Bug fixes.
  Only what an extension user sees: no tooling, dev scripts, docs, line endings, dependency bumps or internal refactors, and
  no "Tooling" heading. Keep `docs/` and `README.md` (public, user-facing) in sync.
- Commit messages: short imperative subject, wrapped body grouped by Security / Fixes / Performance / Tooling.

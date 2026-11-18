# Salesforce Multitools (VS Code extension)

VS Code extension for Salesforce dev: LWC/Aura file switcher, last-modified CodeLens/status bar, debug log viewer
with trace flag control. Extension host in `src/` (TypeScript, esbuild), webview UI in `client/` (React 19 + MUI 7 + Vite).
Publisher `manantrimbakey`, extension id `salesforce-multitools-3`, VS Code `^1.90`.

Read before working: `tasks/lessons.md` (mistakes already made once), `tasks/todo.md` (open items, current plan).

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
  pure), routes `/api/compare/*`, UI `client/src/components/permissionCompare`. Check against a real org with
  `scripts/dev/permission-compare-check.js`.

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
   they allow it; clean up what you create and verify it is gone.
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
Dependabot security-update PRs always target `master` (GitHub ignores `target-branch` for them); run
`scripts/dev/retarget-dependabot-prs.sh --apply` to move them to `dev2`. `master` has a ruleset requiring a review, so
merging into it needs the owner's admin bypass; do not use `--admin` or edit rulesets unless asked.

## Verification before calling something done

`tsc` + `eslint` + unit tests are necessary, not sufficient. Webview changes: build and run the harness in a browser
(catches blank-page crashes and CSP issues; `harness.html?c=<component>` picks the component). Org-facing changes: run
`org-check.js` (debug logs) or `permission-compare-check.js` (permission compare) against a dev org. Anything not
exercised in a real VS Code host (F5) must be listed as unverified. Open items live in `tasks/todo.md`.

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

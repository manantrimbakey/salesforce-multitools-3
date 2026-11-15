[← Back to Documentation Home](../index.md)

# Building, Running and Testing

## Environment

- Node via **nvm**; package manager **pnpm 11** through corepack. A shell that did not load `~/.bashrc` has no `node`
  or `pnpm`. `.vscode/tasks.json` therefore prepends the newest `~/.nvm/versions/node/v*/bin` itself.
- pnpm 11 refuses dependency build scripts unless allowed. `pnpm-workspace.yaml` (root and `client/`) sets
  `allowBuilds` for esbuild. If every `pnpm run` fails with
  `ERR_PNPM_IGNORED_BUILDS`, that file is wrong.
- `pnpm install` at the root also installs `client/` (postinstall).

## What gets built

| Output                       | Source             | Tool                              |
| ---------------------------- | ------------------ | --------------------------------- |
| `dist/extension.js` (~50 KB) | `src/extension.ts` | esbuild (`node esbuild.js`)       |
| `dist/sfcore.js` (~2 MB)     | `@salesforce/core` | esbuild, loaded lazily at runtime |
| `dist/webview/`              | `client/`          | Vite (`pnpm run build:client`)    |

`dist/` is not committed. `esbuild.js` rewrites `import '@salesforce/core'` to `require('./sfcore.js')` (plugin
`lazy-sfcore`), which is why `src/utils/sfutils.ts` must use `require`.

## Run in VS Code (F5)

`.vscode/launch.json` → "Run Extension" → default build task `watch` = `build:client` (once) + `watch:tsc` +
`watch:esbuild`. After editing client code: `pnpm run build:client`, then **Developer: Reload Window** in the
Extension Development Host. For live rebuilds run `pnpm run watch:client` in a terminal.

Test with a Salesforce project that has `.sf/config.json` or `.sfdx/sfdx-config.json` (the extension does not
activate otherwise).

## Tests

- `bash scripts/dev/run-unit-tests.sh`: compiles to a temp dir and runs everything except `extension.test.ts` with
  `node:test` and a `vscode` stub. Use this by default. (`pnpm test` goes through vscode-test, downloads VS Code, and
  mocha 10 itself does not start on Node 26.)
- Test style is mocha TDD (`suite`, `test`, `suiteSetup`...); the stub maps those onto `node:test`.
- Tests that mutate the stub (e.g. `workspaceFolders`) use `vscode.workspace` from the shared instance.

## Verifying a webview change without VS Code

```bash
pnpm run build:client
node scripts/dev/webview-harness.js 8767   # open http://localhost:8767/harness.html
```

The harness injects the same CSP and bridge script the extension does and mocks `acquireVsCodeApi`, so crashes such
as circular chunks or CSP violations show up in the browser console. `window.__posts` holds every message the page
posted (assert request bodies there). Edit the canned responses in `scripts/dev/webview-harness.js` as needed.

## Verifying against a real org

```bash
pnpm run compile-tests          # builds out/ (gitignored)
node scripts/dev/org-check.js <orgAlias> <sfdxProjectDir> --yes
```

Runs the real `DebugLogService`: lists debug levels, creates a TraceFlag with a chosen level on a user that has no
active flag, verifies it with an independent `sf data query --use-tooling-api`, checks the service reports it, then
deletes it. **It writes to the org**; use a developer or sandbox org you own and name the org explicitly.
Requires the `sf` CLI authorized for that alias.

## Dependabot PRs

Dependabot security updates are enabled and always open PRs against the default branch (`master`); `target-branch` in
`dependabot.yml` only affects version updates. To keep the `dev2` -> `dev1` -> `master` flow, retarget them:

```bash
bash scripts/dev/retarget-dependabot-prs.sh            # dry run
bash scripts/dev/retarget-dependabot-prs.sh --apply    # base -> dev2 (use --base dev1 for another branch)
```

It only touches open PRs authored by Dependabot, needs `gh`, and is safe to rerun.

This also runs automatically: `.github/workflows/retarget-dependabot.yml` retargets each new Dependabot PR to `dev2` when it
is opened or reopened (`pull_request_target`, so it gets a write token; it never checks out or runs PR code). The workflow
file must be on `master` to take effect. **Actions -> Retarget Dependabot PRs -> Run workflow** backfills open PRs that
still point at `master`. Repo setting needed: Settings -> Actions -> General -> Workflow permissions must allow the
workflow's `pull-requests: write` (the file requests it explicitly; org-level "read only" defaults can still block it).

## Git hooks

`pnpm install` runs the `prepare` script, which sets `core.hooksPath` to `.githooks`. The `pre-commit` hook runs Prettier on
staged `ts/tsx/js/jsx/json/md/css/html` files and re-stages them. It passes `--end-of-line auto`, so a file keeps its own
LF or CRLF endings (the repo is mixed; `.prettierrc` says `crlf`). Files that also have unstaged changes are skipped with a
warning, so the hook never stages hunks you left out. Prettier formats whole files: touching an unformatted file adds
formatting changes to the commit. Bypass with `git commit --no-verify`.

## Packaging

`pnpm run package` (type check, lint, client build, minified bundles). `.vscodeignore` keeps `src`, `client`, `docs`,
`scripts`, `tasks` and `CLAUDE.md` out of the `.vsix`; only `dist/` and `resources/` ship.

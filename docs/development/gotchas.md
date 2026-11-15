[← Back to Documentation Home](../index.md)

# Gotchas (things that already broke once)

Short and symptom-first. The running log is `tasks/lessons.md`.

| Symptom                                                                     | Cause                                                                                                                                                  | Fix                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `/usr/bin/bash: pnpm: command not found` in a VS Code task                  | Task shells do not load `~/.bashrc`, so nvm is not on `PATH`                                                                                           | Tasks prepend the nvm node bin (see `.vscode/tasks.json`)                                         |
| `ERR_PNPM_IGNORED_BUILDS` on any `pnpm run`                                 | pnpm 11 `allowBuilds` placeholder in `pnpm-workspace.yaml`                                                                                             | Set `esbuild: true` (root and `client/`)                                                          |
| Webview tab is completely blank, no spinner                                 | JS crashed before React mounted. Cause so far: separate react/mui/emotion Vite chunks importing each other (`Cannot access 'x' before initialization`) | Single `vendor` chunk in `client/vite.config.ts`; reproduce with `scripts/dev/webview-harness.js` |
| "Webview resources not found … Run the client build first"                  | `dist/webview` missing; F5 only built tsc/esbuild                                                                                                      | `build:client` is part of the F5 `watch` task now; or run it by hand                              |
| `Cannot read properties of undefined (reading 'root')` at first org use     | `import('@salesforce/core')` of the externalised `dist/sfcore.js` is a native ESM import of a CJS file, so named exports are lost                      | Use plain `require` in `sfutils.ts`                                                               |
| `unable to determine transport target for …transformStream`                 | Bundled `@salesforce/core` Pino logger cannot find its transport                                                                                       | `SF_CORE_ENV` in `sfutils.ts` disables file logging while the lib initializes                     |
| Huge whole-file diffs, `package.json` shows every line changed              | A formatter flipped LF to CRLF (`.prettierrc` has `endOfLine: crlf`, repo mostly LF)                                                                   | Restore with `sed -i 's/\r$//' <file>`; format with `--end-of-line lf`                            |
| Symlink inside the workspace can read outside files                         | Lexical `path.relative` check                                                                                                                          | `isInsideWorkspace` resolves `realpath` on both sides                                             |
| `mocha` crashes on startup (`require is not defined in ES module scope`)    | mocha 10 / yargs 16 on Node 26                                                                                                                         | `scripts/dev/run-unit-tests.sh`                                                                   |
| `pnpm run <script>` hangs the agent shell / `git stash` unstaged my changes | Process and git state surprises                                                                                                                        | Use direct `npx` calls; never `git stash` to inspect                                              |

## Salesforce specifics

- A user can have only one active TraceFlag; `createTraceFlag` rejects a second one on purpose.
- Trace flags last 60 minutes (`TRACE_FLAG_DURATION_MS` in `debugLogService.ts`, mirrored in the client's optimistic update).
- Log filtering is by `LogUser.Name`, not user Id.
- `connection.request` buffers whole bodies, so log bodies are streamed in `logBodyClient.ts` with the connection's token
  (refreshed once on 401). This bypasses jsforce's proxy handling; behind a corporate proxy downloads may fail (open item).
- The managed debug level is `SF_Multitools_Debug_v2` (FINE for Apex, INFO elsewhere, DEBUG for System). The old
  `SF_Multitools_Debug` (everything FINEST) is no longer used; it stays in orgs that ran older versions.

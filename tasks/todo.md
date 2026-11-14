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

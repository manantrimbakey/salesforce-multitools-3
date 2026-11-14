# Lessons

- Do not mark a phase done while webview/RPC/CSP behaviour is unverified in a real VS Code host (F5); list it as an open item instead.
- Path allow-list checks must resolve symlinks (`realpath`) on both sides; lexical `path.relative` is not enough.
- `pnpm` 11 needs `allowBuilds: <pkg>: true`; the placeholder text it writes makes every `pnpm run` fail.
- Never run `git stash` to "check" state; use `git diff`/`git status` (it unstages index changes).
- `@salesforce/core` is bundled separately (`dist/sfcore.js`) so activation stays small; keep it behind the lazy import in `sfutils.ts`.
- esbuild leaves `import()` of an external as a native ESM import; CJS `module.exports = require(..)` loses named exports. Use `require` for the lazy `dist/sfcore.js` and smoke-test through `dist/extension.js`, not just the library.
- Vite `manualChunks` that splits react/mui/emotion into separate chunks causes circular chunk imports (blank webview, "Cannot access x before initialization"). Use one vendor chunk, and smoke-test the built webview in a browser (CSP + mock acquireVsCodeApi) before claiming it works.
- Dev tooling lives in `scripts/dev/` (unit test runner, webview harness, org check); use them instead of rebuilding throwaway harnesses. `pnpm test` needs a real VS Code download.

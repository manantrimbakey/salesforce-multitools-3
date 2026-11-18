# Lessons

- Do not mark a phase done while webview/RPC/CSP behaviour is unverified in a real VS Code host (F5); list it as an open item instead.
- Path allow-list checks must resolve symlinks (`realpath`) on both sides; lexical `path.relative` is not enough.
- `pnpm` 11 needs `allowBuilds: <pkg>: true`; the placeholder text it writes makes every `pnpm run` fail.
- Never run `git stash` to "check" state; use `git diff`/`git status` (it unstages index changes).
- `@salesforce/core` is bundled separately (`dist/sfcore.js`) so activation stays small; keep it behind the lazy import in `sfutils.ts`.
- esbuild leaves `import()` of an external as a native ESM import; CJS `module.exports = require(..)` loses named exports. Use `require` for the lazy `dist/sfcore.js` and smoke-test through `dist/extension.js`, not just the library.
- Vite `manualChunks` that splits react/mui/emotion into separate chunks causes circular chunk imports (blank webview, "Cannot access x before initialization"). Use one vendor chunk, and smoke-test the built webview in a browser (CSP + mock acquireVsCodeApi) before claiming it works.
- Dev tooling lives in `scripts/dev/` (unit test runner, webview harness, org check); use them instead of rebuilding throwaway harnesses. `pnpm test` needs a real VS Code download.
- Git identity for this repo is `manantrimbakey` / `35310440+manantrimbakey@users.noreply.github.com`. `manantrimbakey@gmail.com` is verified on the separate GitHub account `manantrimbakey-hash`, so commits made with it are credited there (0.7.1 release commits were). Check with `gh api repos/manantrimbakey/salesforce-multitools-3/commits/<sha> --jq .author.login`.
- Changelog is for user-visible changes only: no "Tooling" section, dev scripts, docs or line-ending notes (CLAUDE.md convention).
- No Claude `Co-Authored-By` / "Generated with Claude Code" attribution when the user says they are the author.
- Do not commit (or branch-commit) unless the user says so; the user is the author. Leave changes in the working tree.
- SetupEntityAccess `SetupEntityType` values are not the SObject names (`FlowDefinition`, `TabSet`, `CustomEntityDefinition`); verify against a real org, and `EntityDefinition` hides some custom settings.
- Unit tests compile to a temp dir, so runtime deps need `NODE_PATH` (set in `scripts/dev/run-unit-tests.sh`).
- vsce applies `!` re-includes over every exclude regardless of order: a blanket `!dist/**` in `.vscodeignore` re-includes stale `*.map` files (dev builds leave them in `dist/`). List shipped files explicitly and check the `.vsix` listing (`release.sh` does).

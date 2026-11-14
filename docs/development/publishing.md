[← Back to Documentation Home](../index.md)

# Publishing to the VS Code Marketplace

Step by step, from a merged `master` to a live release. Extension id `manantrimbakey.salesforce-multitools-3`, publisher
`manantrimbakey`. Commands assume nvm node on `PATH`:

```bash
cd ~/Projects/salesforce-multitools-3
export PATH="$(ls -d $HOME/.nvm/versions/node/v*/bin | sort -V | tail -1):$PATH"
```

## 0. Know the rules

- The Marketplace **rejects a version it already has** and the version must be **higher** than the live one. Check what is
  live: `npx vsce show manantrimbakey.salesforce-multitools-3` (look at `Version`).
- You cannot overwrite a published version. A fix means a new version number.
- The package page takes its links and README images from `package.json` `repository`. README images use
  `./asset/*.gif`; `vsce` turns them into `https://github.com/<repo>/raw/HEAD/asset/...`, so the repo must be public and
  `asset/` must be committed.
- Release tags (`v*`) are protected by a ruleset: they cannot be moved or deleted. Tag the commit you actually publish.
- Only publish from `master`. Flow: `dev2` -> `dev1` -> `master` (see `CLAUDE.md`); `master` needs a review, so you merge
  the last PR with the owner's admin bypass.

## 1. Pick the version and prepare the release (on `dev2`)

Semver: new feature = minor, fix or metadata only = patch. Example: 0.7.0 is tagged but never reached the Marketplace and
its package still carried the old repository link, so the clean option is a patch, **0.7.1**.

1. Set `"version"` in `package.json` **and** `client/package.json`.
2. `CHANGELOG.md`: rename `[Unreleased]` entries into a new `## [x.y.z]` section above the previous one, and keep an empty
   `## [Unreleased]` at the top.
3. Commit, push `dev2`, open a PR into `dev1`, merge; open `dev1` -> `master`, merge (admin bypass).
4. Sync back if wanted: `git fetch && git switch dev2 && git merge --ff-only origin/master`.

## 2. Build and check from a clean `master`

```bash
git fetch origin && git switch master && git pull --ff-only
pnpm install --frozen-lockfile
pnpm run package            # type check, lint, client build, minified bundles
bash scripts/dev/run-unit-tests.sh
```

Expected: `dist/extension.js` ~50 KB, `dist/sfcore.js` ~2 MB, `dist/webview/` with `vendor.js`. If `pnpm install` fails with
`ERR_PNPM_IGNORED_BUILDS` or a YAML error, look at `pnpm-workspace.yaml` and `client/pnpm-workspace.yaml`
(see [gotchas](./gotchas.md)).

Smoke test in VS Code before publishing: `F5` in this repo, or install the `.vsix` (step 5) and open a project with
`.sf/config.json`; open Debug Logs, start and stop logging for a user.

## 3. One-time account setup (skip if you can already publish)

1. Sign in at https://dev.azure.com with the Microsoft account that owns the publisher.
2. Top right: **User settings -> Personal access tokens -> New Token**.
   - Organization: **All accessible organizations**
   - Scopes: **Custom defined -> Show all scopes -> Marketplace -> Manage**
   - Expiry: 30-90 days. Copy the token once; keep it in a password manager, never in the repo or in chat.
3. Check the publisher exists and you can manage it: https://marketplace.visualstudio.com/manage/publishers/manantrimbakey
   (create one there if not; the id must equal `publisher` in `package.json`).

## 4. Log in with `vsce`

```bash
npx vsce login manantrimbakey        # paste the token at the prompt
npx vsce verify-pat manantrimbakey   # should say the PAT is valid
```

Or set it per command: `VSCE_PAT=<token> npx vsce publish ...` (do not put it in shell history permanently).

## 5. Package

```bash
rm -f salesforce-multitools.vsix
pnpm run vscode:package              # vsce package --no-dependencies -o salesforce-multitools.vsix
```

Check the listing: about 16 files, ~760 KB, **no** `.map`, `src/`, `docs/`, `CLAUDE.md`, `node_modules/`. Warnings about
README images or the repository field mean `package.json` `repository` is wrong. Optional local install test:
`code --install-extension salesforce-multitools.vsix --force`.

## 6. Publish

```bash
npx vsce publish --packagePath salesforce-multitools.vsix
```

This uploads the file as built and does not touch the version or git. (Do not use `vsce publish patch`: it bumps the
version and commits/tags on its own.) No-CLI alternative: https://marketplace.visualstudio.com/manage -> your extension ->
**... -> Update** -> upload the `.vsix`.

## 7. Verify

- `npx vsce show manantrimbakey.salesforce-multitools-3` shows the new version (the page can lag a few minutes; the
  Marketplace also runs a security/malware scan before the version appears).
- Open https://marketplace.visualstudio.com/items?itemName=manantrimbakey.salesforce-multitools-3: version, README images,
  changelog tab, repository / issues links point at the new repo.
- In a clean VS Code profile install it from the Extensions view, open a Salesforce project, open Debug Logs.

## 8. After publishing

1. Tag the published commit (annotated) and push the tag: `git tag -a vX.Y.Z -m "Release X.Y.Z" && git push origin vX.Y.Z`.
   Tags `v*` cannot be moved afterwards.
2. GitHub release: `gh release create vX.Y.Z salesforce-multitools.vsix --title vX.Y.Z --notes-file <changelog section>`.
3. Leave `[Unreleased]` ready for the next change; bump the next version only when you start a release.

## 9. Optional: Open VSX (VSCodium and others)

Create a token at https://open-vsx.org, claim the namespace once, then `npx ovsx publish salesforce-multitools.vsix -p <token>`.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Version number X is already used` / `already exists` | Bump the version; published versions are immutable |
| `401` / `403` / `TF400813` | PAT expired, wrong scope (needs Marketplace -> Manage) or not "All accessible organizations" |
| `The Personal Access Token verification has failed` | Re-create the token; log in again with the exact publisher id |
| Publisher not found | Create it at marketplace.visualstudio.com/manage; id must match `package.json` |
| README images broken on the page | Repo private, wrong `repository` URL, or `asset/` not committed |
| Old repository link on the page | The published package was built before `repository` was fixed; publish a new version |
| `pnpm` / `node` not found | Run the `export PATH=...` line above (nvm is not on a bare `PATH`) |
| Wrong version published | Cannot overwrite. Publish a higher version; use `vsce unpublish` only as a last resort (it removes the extension) |

[← Back to Documentation Home](../index.md)

# Publishing to the VS Code Marketplace

Step by step, from a merged `master` to a live release. Extension id `manantrimbakey.salesforce-multitools-3`, publisher
`manantrimbakey`. Commands assume nvm node on `PATH`:

```bash
cd ~/Projects/salesforce-multitools-3
export PATH="$(ls -d $HOME/.nvm/versions/node/v*/bin | sort -V | tail -1):$PATH"
```

## Prerequisite: global `vsce`

`vsce` is **not** a project dependency; install it once, globally, with npm (it lives under the active nvm node, so
reinstall it after switching Node versions; needs Node >= 22):

```bash
npm install -g @vscode/vsce
vsce --version
```

`pnpm run vscode:package` calls the bare `vsce` command, so it needs this on `PATH`. Open VSX needs `ovsx` the same way:

```bash
npm install -g ovsx
ovsx login manantrimbakey        # paste the Open VSX token (create at https://open-vsx.org -> Settings -> Access Tokens)
```

## 0. Know the rules

- The Marketplace **rejects a version it already has** and the version must be **higher** than the live one. Check what is
  live: `vsce show manantrimbakey.salesforce-multitools-3` (look at `Version`).
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
vsce login manantrimbakey        # paste the token at the prompt
vsce verify-pat manantrimbakey   # should say the PAT is valid
```

Or set it per command: `VSCE_PAT=<token> vsce publish ...` (do not put it in shell history permanently).

## Automated release (steps 5 to 9 in one command)

From a clean, up to date `master` with the version and `CHANGELOG.md` already bumped (step 1) and both logins done:

```bash
pnpm run release              # dry run: preflight, build, package, prints what it would do
pnpm run release -- --yes     # publish to Marketplace + Open VSX, tag, push tag, GitHub release
```

Flags: `--skip-marketplace`, `--skip-openvsx`, `--skip-tests`. Tokens come from the stored `vsce`/`ovsx` logins or the
`VSCE_PAT` / `OVSX_PAT` environment variables; never pass them as arguments.

What it checks: on `master`, clean tree, equal to `origin/master`, `package.json` and `client/package.json` versions match,
`CHANGELOG.md` has the section, tag not present. It reads the live version from each registry, skips one that already has
this version (so a half-failed run can be re-run) and refuses if a registry has a newer one. It builds one `.vsix`, rejects
it if it contains maps, `src/`, `docs/` or `node_modules`, and publishes that same file to both registries. The manual
steps below remain as a fallback.

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
vsce publish --packagePath salesforce-multitools.vsix
```

This uploads the file as built and does not touch the version or git. (Do not use `vsce publish patch`: it bumps the
version and commits/tags on its own.) No-CLI alternative: https://marketplace.visualstudio.com/manage -> your extension ->
**... -> Update** -> upload the `.vsix`.

## 7. Verify

- `vsce show manantrimbakey.salesforce-multitools-3` shows the new version (the page can lag a few minutes; the
  Marketplace also runs a security/malware scan before the version appears).
- Open https://marketplace.visualstudio.com/items?itemName=manantrimbakey.salesforce-multitools-3: version, README images,
  changelog tab, repository / issues links point at the new repo.
- In a clean VS Code profile install it from the Extensions view, open a Salesforce project, open Debug Logs.

## 8. After publishing

1. Tag the published commit (annotated) and push the tag: `git tag -a vX.Y.Z -m "Release X.Y.Z" && git push origin vX.Y.Z`.
   Tags `v*` cannot be moved afterwards.
2. GitHub release: `gh release create vX.Y.Z salesforce-multitools.vsix --title vX.Y.Z --notes-file <changelog section>`.
3. Leave `[Unreleased]` ready for the next change; bump the next version only when you start a release.

## 9. Open VSX (VSCodium and others)

Namespace `manantrimbakey`; page https://open-vsx.org/extension/manantrimbakey/salesforce-multitools-3. Publish the same
file: `ovsx publish salesforce-multitools-X.Y.Z.vsix` (uses `ovsx login` or `OVSX_PAT`). The namespace was created under an
auto-generated GitHub login (`manantrimbakey-hash`); changing the linked account is tracked in
https://github.com/EclipseFdn/open-vsx.org/issues/5843. Until ownership is claimed, versions may show as unverified.

## Troubleshooting

| Symptom                                               | Cause / fix                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Version number X is already used` / `already exists` | Bump the version; published versions are immutable                                                                |
| `401` / `403` / `TF400813`                            | PAT expired, wrong scope (needs Marketplace -> Manage) or not "All accessible organizations"                      |
| `The Personal Access Token verification has failed`   | Re-create the token; log in again with the exact publisher id                                                     |
| Publisher not found                                   | Create it at marketplace.visualstudio.com/manage; id must match `package.json`                                    |
| README images broken on the page                      | Repo private, wrong `repository` URL, or `asset/` not committed                                                   |
| Old repository link on the page                       | The published package was built before `repository` was fixed; publish a new version                              |
| `pnpm` / `node` not found                             | Run the `export PATH=...` line above (nvm is not on a bare `PATH`)                                                |
| Wrong version published                               | Cannot overwrite. Publish a higher version; use `vsce unpublish` only as a last resort (it removes the extension) |

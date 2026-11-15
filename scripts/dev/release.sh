#!/usr/bin/env bash
# Build one .vsix from master and publish it to the VS Code Marketplace and Open VSX, then tag and cut a GitHub release.
#
#   bash scripts/dev/release.sh                 # dry run: preflight, build, package, print what would happen
#   bash scripts/dev/release.sh --yes           # really publish, tag, push the tag, create the GitHub release
#   flags: --skip-marketplace  --skip-openvsx  --skip-tests
#
# Tokens: `vsce login manantrimbakey` / `ovsx login manantrimbakey` once, or export VSCE_PAT / OVSX_PAT.
# Never pass tokens as arguments (they would land in shell history). See docs/development/publishing.md.
set -euo pipefail
cd "$(dirname "$0")/../.."

EXT_ID="manantrimbakey.salesforce-multitools-3"
OVSX_API="https://open-vsx.org/api/manantrimbakey/salesforce-multitools-3"
WRONG_EMAIL="manantrimbakey@gmail.com" # verified on the manantrimbakey-hash GitHub account, mis-credits commits

yes=0 skip_mp=0 skip_ovsx=0 skip_tests=0
for arg in "$@"; do
    case "$arg" in
        --yes) yes=1 ;;
        --skip-marketplace) skip_mp=1 ;;
        --skip-openvsx) skip_ovsx=1 ;;
        --skip-tests) skip_tests=1 ;;
        *) echo "unknown argument: $arg" >&2; exit 2 ;;
    esac
done

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH ($2)"; }

# nvm node is not on a bare PATH
if ! command -v node >/dev/null 2>&1; then
    node_bin="$(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -V | tail -1 || true)"
    [ -n "$node_bin" ] && export PATH="$node_bin:$PATH"
fi
need node "load nvm"
need pnpm "corepack enable"
need git ""
[ "$skip_mp" = 1 ] || need vsce "npm i -g @vscode/vsce"
[ "$skip_ovsx" = 1 ] || need ovsx "npm i -g ovsx"
[ "$yes" = 1 ] && need gh "needed to create the GitHub release"

json_field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s)["'"$1"'"];if(v)console.log(v)}catch{}})'; }
# true when $1 > $2 (semver, plain x.y.z)
version_gt() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" = "$1" ]; }

step "Preflight"
version="$(node -p "require('./package.json').version")"
client_version="$(node -p "require('./client/package.json').version")"
[ "$version" = "$client_version" ] || die "package.json ($version) and client/package.json ($client_version) versions differ"
tag="v$version"
vsix="salesforce-multitools-$version.vsix"

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "master" ] || die "on '$branch'; release only from master"
[ -z "$(git status --porcelain)" ] || die "working tree not clean (commit or revert first)"
git fetch --quiet origin master --tags
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/master)" ] || die "master differs from origin/master (pull or push first)"
grep -q "^## \[$version\]" CHANGELOG.md || die "CHANGELOG.md has no '## [$version]' section"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "tag $tag already exists"

email="$(git config user.email || true)"
[ "$email" != "$WRONG_EMAIL" ] || echo "WARN: git user.email is $WRONG_EMAIL (credited to manantrimbakey-hash); use the noreply address of manantrimbakey"
echo "version $version, branch $branch, commit $(git rev-parse --short HEAD)"

step "Live versions"
mp_live="" ovsx_live=""
if [ "$skip_mp" = 0 ]; then
    mp_live="$(vsce show "$EXT_ID" --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).versions[0].version)}catch{}})' || true)"
    echo "Marketplace: ${mp_live:-unknown}"
    if [ "$mp_live" = "$version" ]; then echo "  already live, skipping"; skip_mp=1
    elif [ -n "$mp_live" ] && version_gt "$mp_live" "$version"; then die "Marketplace has $mp_live, newer than $version"; fi
fi
if [ "$skip_ovsx" = 0 ]; then
    ovsx_live="$(curl -fsS --max-time 20 "$OVSX_API" 2>/dev/null | json_field version || true)"
    echo "Open VSX:    ${ovsx_live:-unknown}"
    if [ "$ovsx_live" = "$version" ]; then echo "  already live, skipping"; skip_ovsx=1
    elif [ -n "$ovsx_live" ] && version_gt "$ovsx_live" "$version"; then die "Open VSX has $ovsx_live, newer than $version"; fi
fi

step "Build and test"
pnpm install --frozen-lockfile
[ "$skip_tests" = 1 ] || bash scripts/dev/run-unit-tests.sh
rm -f "$vsix"
# vsce runs the vscode:prepublish script (type check, lint, client build, minified bundles) itself
vsce package --no-dependencies -o "$vsix"
listing="$(unzip -Z1 "$vsix")"
echo "$listing" | grep -Eq '\.map$|^extension/src/|^extension/docs/|node_modules' && die "$vsix contains files that must not ship (maps, src, docs or node_modules)"
echo "$listing" | grep -q '^extension/dist/extension.js$' || die "$vsix has no dist/extension.js"
echo "built $vsix ($(du -h "$vsix" | cut -f1), $(echo "$listing" | wc -l) entries)"

if [ "$yes" = 0 ]; then
    step "Dry run, nothing published"
    [ "$skip_mp" = 1 ] || echo "would: vsce publish --packagePath $vsix"
    [ "$skip_ovsx" = 1 ] || echo "would: ovsx publish $vsix"
    echo "would: git tag -a $tag, git push origin $tag, gh release create $tag $vsix"
    echo "re-run with --yes to do it."
    exit 0
fi

step "Publish"
[ "$skip_mp" = 1 ] || vsce publish --packagePath "$vsix"
[ "$skip_ovsx" = 1 ] || ovsx publish "$vsix"

step "Tag and GitHub release"
git tag -a "$tag" -m "Release $version"
git push origin "$tag"
notes="$(mktemp)"
trap 'rm -f "$notes"' EXIT
awk -v v="$version" '$0 ~ "^## \\[" v "\\]" {f=1; next} f && /^## \[/ {exit} f' CHANGELOG.md >"$notes"
gh release create "$tag" "$vsix" --title "$tag" --notes-file "$notes"

step "Done; verify"
echo "https://marketplace.visualstudio.com/items?itemName=$EXT_ID"
echo "https://open-vsx.org/extension/manantrimbakey/salesforce-multitools-3"

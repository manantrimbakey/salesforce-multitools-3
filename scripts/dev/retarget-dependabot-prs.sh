#!/usr/bin/env bash
# Move open Dependabot pull requests to the branch where work lands (default: dev2).
#
# Dependabot SECURITY updates always target the repo's default branch (master) and `target-branch` in
# dependabot.yml cannot change that, but our flow is dev2 -> dev1 -> master. Run this whenever new
# Dependabot PRs show up; it only changes the base branch of PRs authored by Dependabot.
#
#   bash scripts/dev/retarget-dependabot-prs.sh                 # dry run: list what would change
#   bash scripts/dev/retarget-dependabot-prs.sh --apply         # retarget them to dev2
#   bash scripts/dev/retarget-dependabot-prs.sh --apply --base dev1
#   bash scripts/dev/retarget-dependabot-prs.sh --apply --rebase   # also ask Dependabot to rebase (posts a comment)
#
# Requires the GitHub CLI (`gh`), authenticated with access to the repo.
set -euo pipefail

base="dev2"
apply=false
rebase=false

while [ $# -gt 0 ]; do
    case "$1" in
        --apply) apply=true ;;
        --rebase) rebase=true ;;
        --base)
            base="${2:?--base needs a branch name}"
            shift
            ;;
        -h | --help)
            sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "unknown option: $1 (try --help)" >&2
            exit 2
            ;;
    esac
    shift
done

command -v gh >/dev/null || { echo "gh (GitHub CLI) is required" >&2; exit 1; }

repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
gh api "repos/$repo/branches/$base" --silent 2>/dev/null || { echo "$repo has no branch '$base'" >&2; exit 1; }

# Open PRs opened by Dependabot that do not already target $base
prs="$(gh pr list --repo "$repo" --state open --author 'app/dependabot' --limit 100 \
    --json number,title,baseRefName \
    --jq ".[] | select(.baseRefName != \"$base\") | \"\(.number)\t\(.baseRefName)\t\(.title)\"")"

if [ -z "$prs" ]; then
    echo "No Dependabot PRs to retarget in $repo (all open ones already target $base)."
    exit 0
fi

while IFS=$'\t' read -r number current title; do
    if [ "$apply" = true ]; then
        gh pr edit "$number" --repo "$repo" --base "$base" >/dev/null
        echo "#$number $current -> $base  $title"
        if [ "$rebase" = true ]; then
            gh pr comment "$number" --repo "$repo" --body "@dependabot rebase" >/dev/null
        fi
    else
        echo "[dry run] #$number $current -> $base  $title"
    fi
done <<<"$prs"

[ "$apply" = true ] || echo "Nothing changed. Re-run with --apply to retarget."

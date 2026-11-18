#!/usr/bin/env bash
# Run the unit tests that do not need a real VS Code host (everything in src/test except extension.test.ts).
# `pnpm test` (vscode-test) downloads VS Code and needs the full compile; this is the fast path.
set -euo pipefail
cd "$(dirname "$0")/../.."

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

npx tsc -p . --outDir "$out"
tests=$(ls "$out"/test/*.test.js | grep -v 'extension\.test\.js')
# shellcheck disable=SC2086
NODE_PATH="$PWD/node_modules" node --require ./scripts/dev/vscode-stub.js --test $tests

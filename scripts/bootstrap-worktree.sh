#!/bin/bash
# Link ignored local resources from the canonical checkout into a secondary worktree.
# Usage: bash scripts/bootstrap-worktree.sh [/path/to/master-checkout]
set -euo pipefail

MASTER_CHECKOUT="${1:-/workspace/typescript/hulymcp}"

if [ ! -d "$MASTER_CHECKOUT" ]; then
  echo "ERROR: master checkout not found: $MASTER_CHECKOUT" >&2
  exit 1
fi

link_if_missing() {
  local name="$1"
  local source="$MASTER_CHECKOUT/$name"

  if [ ! -e "$source" ]; then
    echo "SKIP: $name (missing in $MASTER_CHECKOUT)"
    return 0
  fi

  if [ -e "$name" ] || [ -L "$name" ]; then
    echo "OK: $name already exists"
    return 0
  fi

  ln -s "$source" "$name"
  echo "LINK: $name -> $source"
}

link_if_missing "node_modules"
link_if_missing ".reference"
link_if_missing ".env.local"
link_if_missing "CLAUDE.local.md"

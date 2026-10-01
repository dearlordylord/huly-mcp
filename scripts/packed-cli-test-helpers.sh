#!/usr/bin/env bash

source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh" || exit 1

prepare_packed_cli() {
  local test_tmpdir="$1"

  if [[ -n "${HULY_CLI_INTEGRATION_EXECUTABLE:-}" ]]; then
    HULY_PREPARED_CLI="$HULY_CLI_INTEGRATION_EXECUTABLE"
    return
  fi

  local package_dir="$test_tmpdir/package"
  local install_dir="$test_tmpdir/install"
  mkdir -p "$package_dir" "$install_dir"
  pnpm --filter @firfi/huly-cli build >/dev/null
  npm_config_ignore_scripts=true pnpm --dir packages/huly-cli pack --pack-destination "$package_dir" >/dev/null
  local tarball
  tarball="$(find "$package_dir" -maxdepth 1 -type f -name '*.tgz' -print -quit)"
  if [[ -z "$tarball" ]]; then
    echo "Packed CLI tarball was not created." >&2
    return 1
  fi
  printf '{"private":true,"type":"module"}\n' >"$install_dir/package.json"
  pnpm --dir "$install_dir" add "$tarball" >/dev/null
  HULY_PREPARED_CLI="$install_dir/node_modules/.bin/huly"
}

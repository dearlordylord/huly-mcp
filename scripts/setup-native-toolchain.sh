#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
platform=$(uname -s)
architecture=$(uname -m)
tools="${HULY_NATIVE_TOOLCHAIN_DIR:-${RUNNER_TEMP:-${HOME}/.cache/huly-mcp}/native-rust-${platform}-${architecture}}"
setup=true
if [[ "${1:-}" == --cargo ]]; then setup=false; shift; fi

if $setup; then
  packages=('cargo-zigbuild==0.20.1' 'ziglang==0.14.1')
  if command -v uv >/dev/null; then
    if [[ ! -x "$tools/bin/python" ]]; then uv venv "$tools"; fi
    uv pip install --python "$tools/bin/python" "${packages[@]}"
  else
    python3 -m venv "$tools"
    "$tools/bin/python" -m pip install --disable-pip-version-check "${packages[@]}"
  fi
fi
export PATH="$tools/bin:${HOME}/.cargo/bin:$PATH"
export CARGO_ZIGBUILD_PYTHON_PATH="$tools/bin/python"

if [[ "$platform" == Darwin ]]; then
  export SDKROOT="${SDKROOT:-$(xcrun --show-sdk-path)}"
else
  sdk_archive="$tools/MacOSX11.3.sdk.tar.xz"
  if $setup && [[ -z "${SDKROOT:-}" && ! -d "$tools/MacOSX11.3.sdk" ]]; then
    curl --fail --location --retry 2 'https://github.com/phracker/MacOSX-SDKs/releases/download/11.3/MacOSX11.3.sdk.tar.xz' -o "$sdk_archive"
    printf '%s  %s\n' 'cd4f08a75577145b8f05245a2975f7c81401d75e9535dcffbb879ee1deefcbf4' "$sdk_archive" | sha256sum --check
    tar -xJf "$sdk_archive" -C "$tools"
  fi
  export SDKROOT="${SDKROOT:-$tools/MacOSX11.3.sdk}"
fi

if ! $setup; then
  cd "$project_root/native/stdio"
  exec cargo "$@"
fi
# Entering the crate makes rustup use its pinned toolchain and target inventory.
(cd "$project_root/native/stdio" && rustup show active-toolchain)
if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "$tools/bin" "${HOME}/.cargo/bin" >> "$GITHUB_PATH"
  printf 'SDKROOT=%s\nCARGO_ZIGBUILD_PYTHON_PATH=%s\n' "$SDKROOT" "$CARGO_ZIGBUILD_PYTHON_PATH" >> "$GITHUB_ENV"
fi

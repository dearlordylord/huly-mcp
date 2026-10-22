#!/usr/bin/env bash
set -euo pipefail
native_cargo=(bash "$(dirname "${BASH_SOURCE[0]}")/setup-native-toolchain.sh" --cargo)
"${native_cargo[@]}" fmt --all -- --check
"${native_cargo[@]}" clippy --locked --all-targets --quiet -- -D warnings
# The native suite keeps the original 30-second execution bound on Linux and macOS.
timeout 30s "${native_cargo[@]}" test --locked --quiet

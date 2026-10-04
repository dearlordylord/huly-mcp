#!/usr/bin/env bash
set -euo pipefail
# Unit/config tests own their environment; live credentials remain in the parent coordinator.
while IFS= read -r movement_config_key; do
  unset "$movement_config_key"
done < <(compgen -A variable HULY_)
pnpm check-all

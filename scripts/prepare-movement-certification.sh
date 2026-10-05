#!/usr/bin/env bash
set -euo pipefail
node scripts/movement-quality-receipt.mjs --preflight
# Unit/config tests own their environment; live credentials remain in the parent coordinator.
while IFS= read -r movement_config_key; do
  unset "$movement_config_key"
done < <(compgen -A variable HULY_)
if [[ -n "${MOVEMENT_VERIFIED_QUALITY_RECEIPT:-}" ]]; then
  node scripts/movement-quality-receipt.mjs --verify "$MOVEMENT_VERIFIED_QUALITY_RECEIPT" "$MOVEMENT_QUALITY_CHECK_TIME"
  pnpm verify-movement-fixtures
  pnpm test:movement-process
else
  pnpm check-all
fi

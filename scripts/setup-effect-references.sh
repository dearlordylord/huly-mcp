#!/usr/bin/env bash
# Create or verify the pinned Effect 4 reference corpus.
# Usage: bash scripts/setup-effect-references.sh [--check]
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REFERENCE_ROOT="$PROJECT_ROOT/.reference"
EFFECT_REPOSITORY="https://github.com/Effect-TS/effect.git"
SKILLS_REPOSITORY="https://github.com/Effect-TS/skills.git"
V4_NAME="effect-v4.0.0-rc.117"
V4_REF="effect@4.0.0-rc.117"
V4_COMMIT="14a3f140095fdebbff9162944fe7d4ea83e054e6"
SKILLS_NAME="effect-skills"
SKILLS_COMMIT="28822c9e19998876a6b0e0d97877442012ed4391"
CHECK_ONLY=false
STAGING_DIRECTORY=""

usage() {
  echo "Usage: bash scripts/setup-effect-references.sh [--check]"
  echo ""
  echo "Without options, create missing pinned repositories and verify both."
  echo "With --check, verify only; do not access the network or create anything."
}

case "${1:-}" in
  "") ;;
  --check) CHECK_ONLY=true ;;
  --help|-h)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 2
fi

cleanup_staging_directory() {
  if [[ -n "$STAGING_DIRECTORY" && -d "$STAGING_DIRECTORY" ]]; then
    rm -rf -- "$STAGING_DIRECTORY"
  fi
}
trap cleanup_staging_directory EXIT

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

assert_reference_root() {
  if [[ -e "$REFERENCE_ROOT" && ! -d "$REFERENCE_ROOT" ]]; then
    fail "reference root is not a directory: $REFERENCE_ROOT"
  fi

  if [[ -e "$REFERENCE_ROOT/effect" || -L "$REFERENCE_ROOT/effect" ]]; then
    fail "ambiguous legacy reference exists at $REFERENCE_ROOT/effect; inspect and move it aside before continuing"
  fi

  if [[ "$CHECK_ONLY" == false ]]; then
    mkdir -p "$REFERENCE_ROOT"
  elif [[ ! -d "$REFERENCE_ROOT" ]]; then
    fail "reference root is missing: $REFERENCE_ROOT (run without --check to create it)"
  fi
}

fetch_tagged_repository() {
  local destination="$1"
  local repository="$2"
  local ref="$3"

  STAGING_DIRECTORY="$(mktemp -d "$REFERENCE_ROOT/.effect-reference.XXXXXX")"
  git -C "$STAGING_DIRECTORY" init --quiet
  git -C "$STAGING_DIRECTORY" remote add origin "$repository"
  git -C "$STAGING_DIRECTORY" fetch --quiet --depth=1 origin "refs/tags/$ref:refs/tags/$ref"
  git -C "$STAGING_DIRECTORY" checkout --quiet --detach "$ref^{commit}"
  mv "$STAGING_DIRECTORY" "$destination"
  STAGING_DIRECTORY=""
}

fetch_commit_repository() {
  local destination="$1"
  local repository="$2"
  local commit="$3"

  STAGING_DIRECTORY="$(mktemp -d "$REFERENCE_ROOT/.effect-reference.XXXXXX")"
  git -C "$STAGING_DIRECTORY" init --quiet
  git -C "$STAGING_DIRECTORY" remote add origin "$repository"
  git -C "$STAGING_DIRECTORY" fetch --quiet --depth=1 origin "$commit"
  git -C "$STAGING_DIRECTORY" checkout --quiet --detach FETCH_HEAD
  mv "$STAGING_DIRECTORY" "$destination"
  STAGING_DIRECTORY=""
}

ensure_tagged_repository() {
  local name="$1"
  local repository="$2"
  local ref="$3"
  local destination="$REFERENCE_ROOT/$name"

  if [[ -e "$destination" || -L "$destination" ]]; then
    return 0
  fi
  if [[ "$CHECK_ONLY" == true ]]; then
    fail "pinned reference is missing: $destination (run without --check to create it)"
  fi

  echo "CREATE: $name at $ref"
  fetch_tagged_repository "$destination" "$repository" "$ref"
}

ensure_commit_repository() {
  local name="$1"
  local repository="$2"
  local commit="$3"
  local destination="$REFERENCE_ROOT/$name"

  if [[ -e "$destination" || -L "$destination" ]]; then
    return 0
  fi
  if [[ "$CHECK_ONLY" == true ]]; then
    fail "pinned reference is missing: $destination (run without --check to create it)"
  fi

  echo "CREATE: $name at $commit"
  fetch_commit_repository "$destination" "$repository" "$commit"
}

verify_repository() {
  local name="$1"
  local repository="$2"
  local commit="$3"
  local destination="$REFERENCE_ROOT/$name"
  local actual_origin
  local actual_commit
  local changes

  [[ -d "$destination/.git" ]] || fail "reference is not an independent Git repository: $destination"
  actual_origin="$(git -C "$destination" remote get-url origin)"
  [[ "$actual_origin" == "$repository" ]] || fail "$name origin is $actual_origin; expected $repository"
  actual_commit="$(git -C "$destination" rev-parse HEAD)"
  [[ "$actual_commit" == "$commit" ]] || fail "$name is at $actual_commit; expected $commit (the script will not rewrite an existing checkout)"
  changes="$(git -C "$destination" status --porcelain)"
  [[ -z "$changes" ]] || fail "$name has local changes; inspect them before continuing"
}

verify_tag() {
  local name="$1"
  local ref="$2"
  local commit="$3"
  local destination="$REFERENCE_ROOT/$name"
  local tagged_commit

  git -C "$destination" rev-parse --verify --quiet "$ref^{commit}" >/dev/null || fail "$name does not contain tag $ref"
  tagged_commit="$(git -C "$destination" rev-list -n 1 "$ref")"
  [[ "$tagged_commit" == "$commit" ]] || fail "$name tag $ref resolves to $tagged_commit; expected $commit"
}

verify_package_version() {
  local name="$1"
  local expected_version="$2"
  local manifest="$REFERENCE_ROOT/$name/packages/effect/package.json"

  [[ -f "$manifest" ]] || fail "Effect manifest is missing: $manifest"
  node -e '
    const manifest = require(process.argv[1])
    if (manifest.version !== process.argv[2]) {
      console.error(`ERROR: ${process.argv[1]} has version ${manifest.version}; expected ${process.argv[2]}`)
      process.exit(1)
    }
  ' "$manifest" "$expected_version"
}

verify_required_file() {
  local path="$1"
  [[ -f "$REFERENCE_ROOT/$path" ]] || fail "required reference file is missing: $REFERENCE_ROOT/$path"
}

require_command git
require_command mktemp
require_command node
assert_reference_root

ensure_tagged_repository "$V4_NAME" "$EFFECT_REPOSITORY" "$V4_REF"
ensure_commit_repository "$SKILLS_NAME" "$SKILLS_REPOSITORY" "$SKILLS_COMMIT"

verify_repository "$V4_NAME" "$EFFECT_REPOSITORY" "$V4_COMMIT"
verify_tag "$V4_NAME" "$V4_REF" "$V4_COMMIT"
verify_package_version "$V4_NAME" "4.0.0-rc.117"

verify_repository "$SKILLS_NAME" "$SKILLS_REPOSITORY" "$SKILLS_COMMIT"
verify_required_file "$SKILLS_NAME/skills/effect-ts/SKILL.md"

echo "OK: pinned Effect reference corpus verified"

#!/usr/bin/env bash
# Enforces the hyper SDK import boundary:
#   1. apps/sidecar/src/** must NOT import hypercore*/hyperdrive*/hyperswarm*/corestore*
#      directly; it must go through `hyper-sdk` (the official npm package).
#   2. Only apps/sidecar/src/infrastructure/sdk/index.ts is allowed to
#      `import 'hyper-sdk'`. Everything else must consume the SDK via
#      the `infrastructure/sdk/index.ts` re-export, keeping the SDK
#      boundary to one file.
#   3. Other apps in apps/ must follow the same rule.
#
# Run:  pnpm --filter @cinereel/sidecar check:sdk-boundary
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"

SDK='hypercore|hyperdrive|hyperswarm|corestore'
violations=0

scan_forbidden() {
  local label="$1"
  local dir="$2"
  [ -d "$dir" ] || return 0
  while IFS= read -r file; do
    matches=$( (grep -nE "from ['\"]($SDK)" "$file" || true) ; \
               (grep -nE "require\(['\"]($SDK)" "$file" || true) )
    if [ -n "$matches" ]; then
      echo "x hyper SDK leak in $label: $file"
      printf '%s\n' "$matches" | sed 's|^|    |'
      violations=$((violations + 1))
    fi
  done < <(find "$dir" -type f -name '*.ts')
}

scan_hyper_sdk_outside_core() {
  local dir="$1"
  local allow="$2"
  [ -d "$dir" ] || return 0
  while IFS= read -r file; do
    # The single file allowed to import 'hyper-sdk' is passed in $allow.
    if [ "$file" = "$allow" ]; then continue; fi
    matches=$( (grep -nE "from ['\"]hyper-sdk['\"]" "$file" || true) ; \
               (grep -nE "require\(['\"]hyper-sdk['\"]\)" "$file" || true) )
    if [ -n "$matches" ]; then
      echo "x 'hyper-sdk' imported outside $allow: $file"
      printf '%s\n' "$matches" | sed 's|^|    |'
      violations=$((violations + 1))
    fi
  done < <(find "$dir" -type f -name '*.ts')
}

# Sidecar must go through `hyper-sdk`, not raw SDK packages.
scan_forbidden "apps/sidecar/src" "$ROOT/src"
scan_forbidden "apps/sidecar/test" "$ROOT/test"

# Only infrastructure/sdk/index.ts is allowed to import 'hyper-sdk' directly.
scan_hyper_sdk_outside_core "$ROOT/src" "$ROOT/src/infrastructure/sdk/index.ts"

# Belt-and-suspenders: nothing under apps/ other than sidecar may import raw SDK
# without going through `hyper-sdk`. (Other apps don't currently need it,
# but if they appear later they should follow the same rule.)
while IFS= read -r file; do
  matches=$( (grep -nE "from ['\"]($SDK)" "$file" || true) ; \
             (grep -nE "require\(['\"]($SDK)" "$file" || true) )
  if [ -n "$matches" ]; then
    echo "x hyper SDK raw import outside hyper-sdk: $file"
    printf '%s\n' "$matches" | sed 's|^|    |'
    violations=$((violations + 1))
  fi
done < <(find "$REPO_ROOT/apps" -path "$REPO_ROOT/apps/sidecar" -prune -o -type f -name '*.ts' -print)

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "$violations file(s) violate the SDK boundary."
  echo "Apps should import via 'hyper-sdk', not raw SDK packages."
  echo "Sidecar should consume 'hyper-sdk' only through infrastructure/sdk/index.ts."
  exit 1
fi

echo "ok SDK boundary clean: hyper SDK imports confined to hyper-sdk dependency"
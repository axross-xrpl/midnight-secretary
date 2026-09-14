#!/usr/bin/env bash
# Compiles .compact files under compact/ (one contract per file), writing each
# to src/managed/<name>. With no file argument, compiles every compact/*.compact
# file. Pass a name or path (e.g. `token`, `token.compact`, `compact/token.compact`)
# to compile just that one contract. Any other argument (e.g. --skip-zk) is
# forwarded to `compact compile`.
set -euo pipefail

COMPILER_VERSION="+0.31.1"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

EXTRA_FLAGS=()
TARGET=""
for arg in "$@"; do
  if [[ "$arg" == -* ]]; then
    EXTRA_FLAGS+=("$arg")
  else
    TARGET="$arg"
  fi
done

if [ -n "$TARGET" ]; then
  candidate="$TARGET"
  [[ "$candidate" != *.compact ]] && candidate="${candidate}.compact"
  if [ -f "$candidate" ]; then
    f="$candidate"
  elif [ -f "compact/$candidate" ]; then
    f="compact/$candidate"
  elif [ -f "compact/$(basename "$candidate")" ]; then
    f="compact/$(basename "$candidate")"
  else
    echo "No such .compact file: $TARGET"
    exit 1
  fi
  files=("$f")
else
  shopt -s nullglob
  files=(compact/*.compact)
  shopt -u nullglob
fi

if [ ${#files[@]} -eq 0 ]; then
  echo "No .compact files found under compact/"
  exit 1
fi

for f in "${files[@]}"; do
  name="$(basename "$f" .compact)"
  echo "=== Compiling $name ==="
  compact compile "$COMPILER_VERSION" "${EXTRA_FLAGS[@]}" "$f" "src/managed/$name"
done

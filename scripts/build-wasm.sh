#!/usr/bin/env bash
set -euo pipefail

# Ensure script runs from the repository root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Building HushChat WASM package..."
mkdir -p web/src/wasm/pkg

wasm-pack build crates/wasm --target web --out-dir ../../web/src/wasm/pkg --release

echo "WASM build complete!"

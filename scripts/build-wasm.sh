#!/usr/bin/env bash
set -euo pipefail

echo "Building PeerChat WASM package..."
mkdir -p web/src/wasm/pkg

wasm-pack build crates/wasm --target web --out-dir ../../web/src/wasm/pkg --release

echo "WASM build complete!"

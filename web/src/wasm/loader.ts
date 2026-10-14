import * as wasmPkg from './pkg/peerchat_wasm';

let wasmInitialized = false;

export async function initWasm() {
  if (wasmInitialized) return wasmPkg;
  try {
    await (wasmPkg as unknown as { default: () => Promise<unknown> }).default();
    wasmInitialized = true;
    return wasmPkg;
  } catch (err) {
    console.error('Failed to initialize WASM module:', err);
    throw err;
  }
}

export function getWasm() {
  return wasmPkg;
}

export type WasmModule = typeof wasmPkg;

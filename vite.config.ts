import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

// Copy WASM binaries from node_modules into public/ at build/dev time so they
// are always in sync with the installed @tensorflow/tfjs-backend-wasm version.
function copyWasmPlugin() {
  const wasmSrc = resolve(__dirname, 'node_modules/@tensorflow/tfjs-backend-wasm/dist');
  const wasmDest = resolve(__dirname, 'public');
  const files = [
    'tfjs-backend-wasm.wasm',
    'tfjs-backend-wasm-simd.wasm',
    'tfjs-backend-wasm-threaded-simd.wasm',
  ];

  return {
    name: 'copy-wasm',
    buildStart() {
      mkdirSync(wasmDest, { recursive: true });
      for (const file of files) {
        copyFileSync(resolve(wasmSrc, file), resolve(wasmDest, file));
      }
    },
  };
}

export default defineConfig({
  plugins: [copyWasmPlugin()],
  build: {
    // TF.js is ~350KB minified — unavoidable for an ML app
    chunkSizeWarningLimit: 400,
  },
});

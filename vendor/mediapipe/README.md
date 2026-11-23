# Vendored MediaPipe Tasks Vision

These files are copied, unchanged, from the npm package
`@mediapipe/tasks-vision` **version 0.10.35** (Apache-2.0 license, by Google).

| File | What it is |
|------|------------|
| `vision_bundle.mjs` | The JavaScript library (ES module) |
| `wasm/vision_wasm_internal.js` + `.wasm` | The compiled engine for browsers with SIMD (all modern Chrome) |
| `wasm/vision_wasm_nosimd_internal.js` + `.wasm` | Backup engine for older browsers without SIMD |

The hand model lives in `/models/hand_landmarker.task` (float16, version 1,
from Google's MediaPipe model storage).

**Why 0.10.35 and not the newest 1.x?** Starting with 1.0, the library sends
usage metrics to a Google server every minute. Offline (at competition) those
requests fail and show up as errors in the console. 0.10.35 is the newest
version that works completely offline and sends nothing.

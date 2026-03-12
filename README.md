## Performative Checker

Detects whether a live webcam frame contains a drink container (cup/bottle/wine glass) using TensorFlow.js COCO-SSD. If a drink is detected, the banner shows "Performative"; otherwise, it shows "Non‑performative".

### Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Vite's dev server handles HTTPS-free camera access on localhost automatically.

### Build

```bash
npm run build   # type-checks then builds to dist/
npm run preview # preview the production build locally
```

### Usage

1. Click "Start camera" and allow permission.
2. The banner will switch to "Performative" when a drink-like object is detected.
3. Use the "Advanced" settings to tune detection thresholds and frame counts.

### Notes

- All processing happens in-browser; no video is uploaded.
- Model: `@tensorflow-models/coco-ssd` with `lite_mobilenet_v2` backbone.
- TF.js, COCO-SSD, and GSAP are bundled via Vite — no CDN dependencies.

### Deploying to Vercel

The included `vercel.json` is pre-configured. Just run:

```bash
vercel deploy --prod
```

## Performative Checker

Detects whether a live webcam frame contains a drink container (cup/bottle/wine glass) using TensorFlow.js COCO-SSD. If a drink is detected, the banner shows "Performative"; otherwise, it shows "Non‑performative".

### Run locally

Because browsers require HTTPS or `localhost` for camera access, use the included Node server:

```bash
npm run start
# It tries port 8080 and falls back to a free port automatically
```

If you need a specific port:

```bash
npm run start:port
# Uses PORT=8081 by default; set PORT env to override
```

### Usage

1. Open `http://localhost:8080`.
2. Click "Start camera" and allow permission.
3. The banner will switch to "Performative" when a drink-like object is detected.

### Notes

- All processing happens in-browser; no video is uploaded.
- Model: `@tensorflow-models/coco-ssd` with `lite_mobilenet_v2` backbone.

### Deploying to Vercel

Create a `vercel.json` in the project root to add the necessary security headers (CSP compatible with TF.js on Firefox) and cache rules:

```json
{
  "cleanUrls": true,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "Permissions-Policy", "value": "camera=(self)" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com https://tfhub.dev; worker-src 'self' blob:; frame-ancestors 'none'" }
      ]
    }
  ]
}
```

Then deploy:

```bash
vercel deploy --prod
```



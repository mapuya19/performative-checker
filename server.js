#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function send(res, status, content, headers = {}) {
  const securityHeaders = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // COEP can block CDN scripts/models; omit to avoid breaking TFJS CDN usage
    'Permissions-Policy': 'camera=(self)',
    // Allow self + CDNs used for TFJS and fonts
    'Content-Security-Policy': [
      "default-src 'self'",
      // TFJS on Firefox may require 'unsafe-eval' and 'wasm-unsafe-eval'
      "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "media-src 'self' blob:",
      // Allow TFJS/coco-ssd to fetch model assets
      "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com https://tfhub.dev",
      // Allow workers and blob URLs sometimes used by TF backends
      "worker-src 'self' blob:",
      "frame-ancestors 'none'"
    ].join('; ')
  };
  res.writeHead(status, { ...securityHeaders, ...headers });
  res.end(content);
}

// Simple static file server with minimal security headers suitable for local dev
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const filePath = path.join(process.cwd(), urlPath === '/' ? 'index.html' : urlPath);

  fs.stat(filePath, (err, stat) => {
    if (err) {
      return send(res, 404, 'Not Found');
    }
    if (stat.isDirectory()) {
      const indexFile = path.join(filePath, 'index.html');
      fs.stat(indexFile, (err2, stat2) => {
        if (err2 || !stat2.isFile()) return send(res, 403, 'Forbidden');
        fs.readFile(indexFile, (e, data) => {
          if (e) return send(res, 500, 'Server Error');
          send(res, 200, data, { 'Content-Type': MIME['.html'] });
        });
      });
      return;
    }
    fs.readFile(filePath, (e, data) => {
      if (e) return send(res, 500, 'Server Error');
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      send(res, 200, data, { 'Content-Type': type });
    });
  });
});

function tryListen(port) {
  return new Promise((resolve) => {
    const s = server.listen(port, HOST, () => resolve({ ok: true, port }));
    s.on('error', (err) => {
      if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
        resolve({ ok: false, err });
      } else {
        console.error(err);
        process.exit(1);
      }
    });
  });
}

(async () => {
  const first = await tryListen(DEFAULT_PORT);
  if (first.ok) {
    console.log(`Serving on http://localhost:${first.port}`);
    console.log('Press Ctrl+C to stop');
    return;
  }
  const s2 = http.createServer();
  s2.listen(0, HOST, () => {
    const { port } = s2.address();
    s2.close(() => {
      server.listen(port, HOST, () => {
        console.log(`Port ${DEFAULT_PORT} busy. Serving on http://localhost:${port}`);
        console.log('Press Ctrl+C to stop');
      });
    });
  });
})();



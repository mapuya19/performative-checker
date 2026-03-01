#!/usr/bin/env node
import http from 'http';
import fs from 'fs';
import path from 'path';

const DEFAULT_PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';

interface MimeTypes {
  [key: string]: string;
}

const MIME: MimeTypes = {
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

function send(
  res: http.ServerResponse,
  status: number,
  content: string | Buffer,
  headers: http.OutgoingHttpHeaders = {}
): void {
  const securityHeaders: http.OutgoingHttpHeaders = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(self)',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "media-src 'self' blob:",
      "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com https://tfhub.dev",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'"
    ].join('; ')
  };
  res.writeHead(status, { ...securityHeaders, ...headers });
  res.end(content);
}

const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const filePath = path.join(process.cwd(), urlPath === '/' ? 'index.html' : urlPath);

  fs.stat(filePath, (err: NodeJS.ErrnoException | null, stat: fs.Stats) => {
    if (err) {
      return send(res, 404, 'Not Found');
    }
    if (stat.isDirectory()) {
      const indexFile = path.join(filePath, 'index.html');
      fs.stat(indexFile, (err2: NodeJS.ErrnoException | null, stat2: fs.Stats) => {
        if (err2 || !stat2.isFile()) return send(res, 403, 'Forbidden');
        fs.readFile(indexFile, (e: NodeJS.ErrnoException | null, data: Buffer) => {
          if (e) return send(res, 500, 'Server Error');
          send(res, 200, data, { 'Content-Type': MIME['.html'] });
        });
      });
      return;
    }
    fs.readFile(filePath, (e: NodeJS.ErrnoException | null, data: Buffer) => {
      if (e) return send(res, 500, 'Server Error');
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      send(res, 200, data, { 'Content-Type': type });
    });
  });
});

interface TryListenResult {
  ok: boolean;
  port?: number;
  err?: Error;
}

function tryListen(port: number): Promise<TryListenResult> {
  return new Promise((resolve) => {
    const s = server.listen(port, HOST, () => resolve({ ok: true, port }));
    s.on('error', (err: Error) => {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE' || (err as NodeJS.ErrnoException).code === 'EACCES') {
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
    const address = s2.address() as { port: number };
    const { port } = address;
    s2.close(() => {
      server.listen(port, HOST, () => {
        console.log(`Port ${DEFAULT_PORT} busy. Serving on http://localhost:${port}`);
        console.log('Press Ctrl+C to stop');
      });
    });
  });
})();

#!/usr/bin/env node
// KDCN Platform V2 — minimal static server for the dashboard
// Serves V2/dashboard/ on http://localhost:8080/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'dashboard');
const PORT = Number(process.env.DASHBOARD_PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let filePath = path.join(ROOT, decodeURIComponent(parsed.pathname));

  // Prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  // Default to index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // Fallback: if path ends without extension, try .html
  if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    const html = filePath + '.html';
    if (fs.existsSync(html)) filePath = html;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const ctype = MIME[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);

  res.writeHead(200, {
    'Content-Type': ctype,
    'Cache-Control': 'no-store',
    'X-Powered-By': 'KDCN-Platform-V2',
  });
  res.end(content);
});

server.listen(PORT, () => {
  console.log(`▶ KDCN Dashboard on http://localhost:${PORT}/`);
  console.log(`▶ Serving: ${ROOT}`);
  console.log('▶ Press Ctrl+C to stop.');
});

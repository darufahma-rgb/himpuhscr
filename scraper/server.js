/**
 * server.js — Dashboard server untuk HIMPUH Leads
 * Jalankan: node server.js
 * Akses:    http://localhost:<PORT>/
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT     = process.env.PORT || 3000;
const DIR      = path.resolve(__dirname);
const DATA_DIR = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
};

function jsonError(res, code, message) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: message }));
}

function serveJsonFile(res, filePath, fallback) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(data);
  } catch (e) {
    console.error(`[server] Error reading ${filePath}:`, e.message);
    jsonError(res, 500, 'Internal server error');
  }
}

const server = http.createServer((req, res) => {
  // Only allow GET
  if (req.method !== 'GET') {
    return jsonError(res, 405, 'Method not allowed');
  }

  const url = req.url.split('?')[0];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  // ── API: data JSON ────────────────────────────────
  if (url === '/api/data') {
    const file = path.join(DATA_DIR, 'himpuh-travel.json');
    if (!fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('[]');
    }
    return serveJsonFile(res, file);
  }

  // ── API: progress ─────────────────────────────────
  if (url === '/api/progress') {
    const file = path.join(DATA_DIR, 'progress.json');
    if (!fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('{}');
    }
    return serveJsonFile(res, file);
  }

  // ── API: download CSV ─────────────────────────────
  if (url === '/api/dashboard/download/csv') {
    const file = path.join(DATA_DIR, 'himpuh-travel.csv');
    if (!fs.existsSync(file)) {
      return jsonError(res, 404, 'File belum tersedia — jalankan scraper dulu');
    }
    try {
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="himpuh-travel.csv"',
      });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      console.error('[server] Error streaming CSV:', e.message);
      jsonError(res, 500, 'Internal server error');
    }
    return;
  }

  // ── API: download JSON ────────────────────────────
  if (url === '/api/dashboard/download/json') {
    const file = path.join(DATA_DIR, 'himpuh-travel.json');
    if (!fs.existsSync(file)) {
      return jsonError(res, 404, 'File belum tersedia — jalankan scraper dulu');
    }
    try {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="himpuh-travel.json"',
      });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      console.error('[server] Error streaming JSON:', e.message);
      jsonError(res, 500, 'Internal server error');
    }
    return;
  }

  // ── Static files ──────────────────────────────────
  let decoded;
  try { decoded = decodeURIComponent(url); } catch (_) { decoded = url; }
  const relPath  = decoded === '/' ? '/dashboard-live.html' : decoded;
  const fullPath = path.resolve(DIR, '.' + relPath);

  // Path traversal guard — resolved path must stay within DIR
  if (!fullPath.startsWith(DIR + path.sep) && fullPath !== DIR) {
    return jsonError(res, 403, 'Forbidden');
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }

  const ext  = path.extname(fullPath);
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });

  const stream = fs.createReadStream(fullPath);
  stream.on('error', (e) => {
    console.error('[server] Stream error:', e.message);
    if (!res.headersSent) jsonError(res, 500, 'Internal server error');
    else res.destroy();
  });
  stream.pipe(res);
});

server.on('error', (e) => {
  console.error('[server] Fatal error:', e.message);
  process.exit(1);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[server] ${signal} received — shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard server berjalan di http://0.0.0.0:${PORT}`);
  console.log(`Buka: http://localhost:${PORT}/`);
});

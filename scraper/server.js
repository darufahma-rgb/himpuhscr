/**
 * server.js — Dashboard server untuk HIMPUH Leads
 * Jalankan: node server.js
 * Akses:    http://localhost:<PORT>/
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT     = process.env.PORT || 3000;
const DIR      = __dirname;
// Data files are written to the workspace root (parent of this scraper dir)
const DATA_DIR = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
};

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // ── CORS & no-cache ──────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  // ── API: data JSON ────────────────────────────────
  if (url === '/api/data') {
    const file = path.join(DATA_DIR, 'himpuh-travel.json');
    if (!fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
      return;
    }
    try {
      const data = fs.readFileSync(file, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    } catch (e) {
      res.writeHead(500); res.end('error');
    }
    return;
  }

  // ── API: progress ────────────────────────────────
  if (url === '/api/progress') {
    const file = path.join(DATA_DIR, 'progress.json');
    if (!fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    try {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      res.writeHead(500); res.end('error');
    }
    return;
  }

  // ── Static files ──────────────────────────────────
  let filePath = url === '/' ? '/dashboard-live.html' : url;
  const fullPath = path.join(DIR, filePath);

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    res.writeHead(404); res.end('Not found');
    return;
  }

  const ext  = path.extname(fullPath);
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(fullPath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard server berjalan di http://0.0.0.0:${PORT}`);
  console.log(`Buka: http://localhost:${PORT}/`);
});

/**
 * server.js — Dashboard server untuk HIMPUH Leads
 * Sumber data: Supabase (utama) + file JSON lokal (fallback)
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const PORT     = process.env.PORT || 5000;
const DIR      = path.resolve(__dirname);
const DATA_DIR = path.resolve(__dirname, '..');

const SUPABASE_ENABLED = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const supabase = SUPABASE_ENABLED
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

if (SUPABASE_ENABLED) {
  console.log('[server] Supabase aktif — data dibaca dari cloud.');
} else {
  console.log('[server] Supabase tidak dikonfigurasi — fallback ke file lokal.');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
};

function jsonOk(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function jsonError(res, code, message) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: message }));
}

// ── Fetch all data: Supabase first, fallback to local JSON ──
async function fetchData() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('himpuh_travel')
        .select('id,nama_perusahaan,merek_dagang,jenis_anggota,no_registrasi,alamat,telepon,email,website,url_himpuh,kota')
        .order('id', { ascending: true });
      if (!error && data) return data;
      console.error('[server] Supabase fetchData error:', error?.message);
    } catch (e) {
      console.error('[server] Supabase fetchData exception:', e.message);
    }
  }
  // Fallback: local JSON
  const file = path.join(DATA_DIR, 'himpuh-travel.json');
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  }
  return [];
}

// ── Fetch progress: file first (scraper writes this), then Supabase ──
async function fetchProgress() {
  const file = path.join(DATA_DIR, 'progress.json');
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  }
  if (supabase) {
    try {
      const { data } = await supabase
        .from('scraper_progress')
        .select('*').eq('id', 1).single();
      if (data) return { lastId: data.last_id, jumlah: data.jumlah, savedAt: data.saved_at };
    } catch (_) {}
  }
  return {};
}

// ── Generate CSV from data array ──
function generateCSV(records) {
  const esc = (s) => `"${(s ?? '').toString().replace(/"/g, '""')}"`;
  const header = ['No','Nama Perusahaan','Merek Dagang','Kota','Alamat',
    'Telepon/WA','Email','Website','Jenis','Link HIMPUH','Status Follow-up','Catatan'];
  const rows = records.map((d, i) => [
    i+1, d.nama_perusahaan, d.merek_dagang, d.kota, d.alamat,
    d.telepon, d.email, d.website, d.jenis_anggota, d.url_himpuh,
    d.status_followup || 'Belum dihubungi', d.catatan || '',
  ].map(esc).join(','));
  return '\uFEFF' + [header.map(esc).join(','), ...rows].join('\n');
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  const url = req.url.split('?')[0];
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  // ── API: data ──────────────────────────────────────────
  if (url === '/api/data') {
    try {
      const data = await fetchData();
      return jsonOk(res, data);
    } catch (e) {
      console.error('[server] /api/data error:', e.message);
      return jsonError(res, 500, 'Internal server error');
    }
  }

  // ── API: progress ──────────────────────────────────────
  if (url === '/api/progress') {
    try {
      const prog = await fetchProgress();
      return jsonOk(res, prog);
    } catch (e) {
      return jsonOk(res, {});
    }
  }

  // ── API: download CSV ──────────────────────────────────
  if (url === '/api/dashboard/download/csv') {
    try {
      const data = await fetchData();
      const csv  = generateCSV(data);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="himpuh-travel.csv"',
      });
      return res.end(csv);
    } catch (e) {
      console.error('[server] /download/csv error:', e.message);
      return jsonError(res, 500, 'Internal server error');
    }
  }

  // ── API: download JSON ─────────────────────────────────
  if (url === '/api/dashboard/download/json') {
    try {
      const data = await fetchData();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="himpuh-travel.json"',
      });
      return res.end(JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[server] /download/json error:', e.message);
      return jsonError(res, 500, 'Internal server error');
    }
  }

  // ── Static files ───────────────────────────────────────
  let decoded;
  try { decoded = decodeURIComponent(url); } catch (_) { decoded = url; }
  const relPath  = decoded === '/' ? '/dashboard-live.html' : decoded;
  const fullPath = path.resolve(DIR, '.' + relPath);

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

function shutdown(signal) {
  console.log(`\n[server] ${signal} — shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard server berjalan di http://0.0.0.0:${PORT}`);
  console.log(`Sumber data: ${SUPABASE_ENABLED ? 'Supabase ☁️' : 'File lokal 📄'}`);
});
